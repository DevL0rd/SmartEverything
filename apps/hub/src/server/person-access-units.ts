import { isExpired, localClock, type ClientRow, type QuietHours } from '@smarteverything/domain';
import { insideQuiet } from '../reach/reach-rules';
import { storeUnit } from '../store/host/unit';
import type { KnownStanding, PersonStanding } from '../store/repositories/person-access';
import type { HostStore } from '../store/host/host-store';
import {
  readableStanding,
  withRole,
  type AccessEntry,
  type Admission,
  type Refusal,
  type Route,
  type TokenAdmission,
} from './person-access';
import { remoteKind } from './request-trace';

export function standingOfClient(
  store: Pick<HostStore, 'profiles' | 'personAccess'>,
  client: ClientRow,
): PersonStanding {
  const profileId = store.profiles.activeOf(client.id).id;
  return readableStanding(client, profileId, store.personAccess.standing(profileId));
}

export function effectiveRow(
  store: Pick<HostStore, 'profiles' | 'personAccess'>,
  client: ClientRow,
): ClientRow {
  const standing = standingOfClient(store, client);
  return standing.known ? withRole(client, client.role, standing.role) : client;
}

export function hasOwnerDevice(
  store: Pick<HostStore, 'clients' | 'profiles' | 'personAccess'>,
  profileId: string,
): boolean {
  return store.clients
    .list()
    .some(
      (client) => client.profile_id === profileId && effectiveRow(store, client).role === 'owner',
    );
}

export function effectiveClientById(store: HostStore, clientId: string): ClientRow {
  return effectiveRow(store, store.clients.byId(clientId));
}

function hostnameOf(host: string): string | null {
  return URL.canParse(`http://${host}`) ? new URL(`http://${host}`).hostname : null;
}

function onHomeHost(store: HostStore, host: string | null): boolean {
  if (host === null) return true;
  const hostname = hostnameOf(host);
  if (hostname === null) return false;
  const publicUrl = store.settings.read().public_url;
  return publicUrl === null || hostname !== new URL(publicUrl).hostname;
}

function onHomeRoute(store: HostStore, entry: AccessEntry): boolean {
  const kind = remoteKind(entry.remote);
  if (kind !== 'loopback' && kind !== 'private') return false;
  return !entry.forwarded && onHomeHost(store, entry.host);
}

export function standingRefusal(
  store: Pick<HostStore, 'now' | 'settings'>,
  standing: KnownStanding,
  route: Route,
): Refusal | null {
  if (isExpired(standing, store.now().toISOString())) {
    return {
      kind: 'refused_expired',
      detail: 'the access of the person has ended',
      message: 'This access has ended; ask the owner for more time.',
    };
  }
  if (standing.role === 'owner' || route.statusOnly) return null;
  if (standing.home_only && !route.home) {
    return {
      kind: 'refused_condition',
      detail: 'the person may use the home only from the home network',
      message: 'This person can use the home only from the home network.',
    };
  }
  if (standing.schedule !== null && insideSchedule(store, standing.schedule)) {
    return {
      kind: 'refused_condition',
      detail: 'the person is outside the hours they may use the home',
      message: 'This person is paused at this hour; ask the owner.',
    };
  }
  return null;
}

function insideSchedule(store: Pick<HostStore, 'now' | 'settings'>, schedule: QuietHours): boolean {
  const zone = store.settings.read().time_zone;
  return insideQuiet(schedule, localClock(store.now(), zone).minuteOfDay);
}

export function admissionOf(store: HostStore, client: ClientRow, entry: AccessEntry): Admission {
  const standing = standingOfClient(store, client);
  if (!standing.known) {
    if (client.role === 'owner') return { kind: 'admitted', client };
    return {
      kind: 'refused',
      subject: client,
      why: {
        kind: 'refused_scope',
        detail: 'the access of the person cannot be read',
        message: 'This person’s access cannot be read; ask the owner to check it.',
      },
    };
  }
  if (client.role === 'member' && standing.role !== 'owner') {
    const why = standingRefusal(store, standing, {
      home: onHomeRoute(store, entry),
      statusOnly: entry.statusOnly,
    });
    if (why !== null) {
      return {
        kind: 'refused',
        subject: { id: client.id, profile_id: store.profiles.activeOf(client.id).id },
        why,
      };
    }
  }
  return { kind: 'admitted', client: withRole(client, client.role, standing.role) };
}

export const PERSON_ACCESS_READ_UNITS = {
  clientAdmission: storeUnit(
    (store, { client, entry }: { readonly client: ClientRow; readonly entry: AccessEntry }) =>
      admissionOf(store, client, entry),
  ),
  tokenAdmission: storeUnit(
    (
      store,
      { tokenHash, entry }: { readonly tokenHash: string; readonly entry: AccessEntry },
    ): TokenAdmission => {
      const client = store.clients.byTokenHash(tokenHash);
      return client === undefined
        ? { kind: 'unknown' }
        : { kind: 'known', client, admission: admissionOf(store, client, entry) };
    },
  ),
  effectiveRow: storeUnit((store, { client }: { readonly client: ClientRow }) =>
    effectiveRow(store, client),
  ),
  effectiveClientById: storeUnit((store, { clientId }: { readonly clientId: string }) =>
    effectiveClientById(store, clientId),
  ),
  hasOwnerDevice: storeUnit((store, { profileId }: { readonly profileId: string }) =>
    hasOwnerDevice(store, profileId),
  ),
} as const;
