import {
  PROFILE_NAME_MAX,
  insideClockWindow,
  isExpired,
  localClock,
  minuteOfClock,
  shiftedDate,
  zonedInstant,
  type ClientRow,
  type QuietHours,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { storeUnit } from '../store/host/unit';
import type { NewClient, NewPairing } from '../store/repositories/clients';
import type { HostStore } from '../store/host/host-store';

const lifecycleLog = new Logger('hub.access-lifecycle');

function counted(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

function membersOf(store: HostStore, profileId: string): ClientRow[] {
  return store.clients
    .list()
    .filter((client) => client.profile_id === profileId && client.role === 'member');
}

interface Unpairing {
  readonly clients: readonly ClientRow[];
  readonly profileId: string;
  readonly reason: string;
  readonly by: string | null;
}

function unpair(
  store: HostStore,
  { clients, profileId, reason, by }: Unpairing,
): readonly string[] {
  const codes = store.clients.forgetOpenPairingsOf(profileId);
  for (const client of clients) store.clients.remove(client.id);
  store.accessAudit.record({
    profile_id: profileId,
    client_id: by,
    kind: 'person_revoked',
    detail: `${counted(clients.length, 'device')} unpaired, ${counted(codes, 'pairing code')} withdrawn: ${reason}`,
  });
  lifecycleLog.info('person.devices_unpaired', {
    profileId,
    devices: clients.length,
    codes,
    reason,
  });
  return clients.map((client) => client.id);
}

function nextStart(store: HostStore, schedule: QuietHours, now: Date): Date {
  const zone = store.settings.read().time_zone;
  const clock = localClock(now, zone);
  const minute = minuteOfClock(schedule.from);
  const today = zonedInstant(clock, minute, zone);
  return today.getTime() > now.getTime()
    ? today
    : zonedInstant(shiftedDate(clock, 1), minute, zone);
}

function nextEdge(store: HostStore, now: string): number | null {
  const starts = store.personAccess
    .schedules()
    .map(({ schedule }) => nextStart(store, schedule, new Date(now)).getTime());
  const moments = [store.personAccess.nextExpiry(now), store.accessRequests.nextLapse(now)];
  const edges = [
    ...starts,
    ...moments.flatMap((moment) => (moment === undefined ? [] : [Date.parse(moment)])),
  ];
  return edges.length === 0 ? null : Math.min(...edges);
}

function pausedClients(store: HostStore, now: string): readonly string[] {
  const minute = localClock(new Date(now), store.settings.read().time_zone).minuteOfDay;
  return store.personAccess
    .schedules()
    .filter(({ schedule }) => insideClockWindow(schedule, minute))
    .flatMap(({ profileId }) => membersOf(store, profileId).map((client) => client.id));
}

export interface Revoked {
  readonly removed: readonly string[];
  readonly ended: boolean;
}

export interface RemovedPerson {
  readonly removed: readonly string[];
  readonly moved: readonly { readonly clientId: string; readonly profileId: string }[];
}

export interface ClaimedClient {
  readonly client: Omit<NewClient, 'profileId'>;
  readonly profileId: string | null;
}

export const ACCESS_LIFECYCLE_READ_UNITS = {
  hubSettings: storeUnit((store, _input: null) => store.settings.read()),
  accessNextEdge: storeUnit((store, { now }: { readonly now: string }) => nextEdge(store, now)),
  accessPausedClients: storeUnit((store, { now }: { readonly now: string }) =>
    pausedClients(store, now),
  ),
} as const;

export const ACCESS_LIFECYCLE_WRITE_UNITS = {
  accessSweepExpired: storeUnit((store, { now }: { readonly now: string }) =>
    store.personAccess.expiredIds(now).flatMap((profileId) => {
      const members = membersOf(store, profileId);
      if (members.length > 0)
        return unpair(store, { clients: members, profileId, reason: 'the access ended', by: null });
      store.clients.forgetOpenPairingsOf(profileId);
      return [];
    }),
  ),
  accessRevoke: storeUnit(
    (
      store,
      input: { readonly profileId: string; readonly by: string; readonly now: string },
    ): Revoked => {
      const members = membersOf(store, input.profileId);
      const standing = store.personAccess.standing(input.profileId);
      const ended = standing.known && standing.role !== 'owner' && !isExpired(standing, input.now);
      if (ended) store.personAccess.change(input.profileId, { expires_at: input.now });
      const removed = unpair(store, {
        clients: members,
        profileId: input.profileId,
        reason: 'revoked by an owner',
        by: input.by,
      });
      return { removed, ended };
    },
  ),
  personRemove: storeUnit((store, { profileId }: { readonly profileId: string }): RemovedPerson => {
    const onProfile = store.clients.list().filter((client) => client.profile_id === profileId);
    const members = onProfile.filter((client) => client.role === 'member');
    const removed = unpair(store, {
      clients: members,
      profileId,
      reason: 'the person was removed',
      by: null,
    });
    store.profiles.remove(profileId);
    const moved = onProfile
      .filter((client) => client.role === 'owner')
      .map((client) => ({ clientId: client.id, profileId: store.profiles.activeOf(client.id).id }));
    return { removed, moved };
  }),
  pairingStart: storeUnit(
    (
      store,
      input: { readonly now: string; readonly codeHash: string; readonly pairing: NewPairing },
    ) => {
      store.clients.forgetPairingsBefore(input.now);
      store.clients.addPairing(input.codeHash, input.pairing);
      store.accessAudit.record({
        profile_id: input.pairing.profileId ?? null,
        client_id: input.pairing.createdBy,
        kind: 'pairing_started',
        detail: `${input.pairing.role} pairing started`,
      });
    },
  ),
  pairingClaimClient: storeUnit((store, { client, profileId }: ClaimedClient): ClientRow => {
    const person =
      profileId ??
      (client.role === 'owner'
        ? store.personAccess.homeOwner()
        : store.profiles.create({ name: client.name.slice(0, PROFILE_NAME_MAX).trim() }).id);
    return store.clients.create({ ...client, profileId: person });
  }),
} as const;
