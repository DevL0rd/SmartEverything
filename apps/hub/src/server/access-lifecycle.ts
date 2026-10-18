import {
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
import type { Store } from '../store/store';

const log = new Logger('hub.access-lifecycle');

const LONGEST_TIMER_MS = 2_147_483_647;

function counted(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

export interface LifecycleOptions {
  readonly store: Store;
  readonly now: () => Date;
  readonly clientRemoved: (clientId: string) => void;
  readonly clientPaused: (clientId: string) => void;
}

export class AccessLifecycle {
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly options: LifecycleOptions) {}

  start(): void {
    this.sweep();
  }

  stop(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  arm(): void {
    clearTimeout(this.timer);
    const next = this.nextEdge();
    if (next === undefined) {
      this.timer = undefined;
      return;
    }
    const wait = Math.min(Math.max(next - this.options.now().getTime(), 0), LONGEST_TIMER_MS);
    this.timer = setTimeout(() => {
      this.sweep();
    }, wait);
    this.timer.unref();
  }

  sweep(): void {
    const { store, now } = this.options;
    for (const profileId of store.personAccess.expiredIds(now().toISOString())) {
      const members = this.membersOf(profileId);
      if (members.length > 0) this.unpair(members, profileId, 'the access ended');
      else store.clients.forgetOpenPairingsOf(profileId);
    }
    this.pauseStarted();
    this.arm();
  }

  revoke(profileId: string, by: string): number {
    const { store, now } = this.options;
    const members = this.membersOf(profileId);
    const standing = store.personAccess.standing(profileId);
    if (standing.known && standing.role !== 'owner' && !isExpired(standing, now().toISOString())) {
      store.personAccess.change(profileId, { expires_at: now().toISOString() });
      this.arm();
    }
    this.unpair(members, profileId, 'revoked by an owner', by);
    return members.length;
  }

  unpair(
    clients: readonly ClientRow[],
    profileId: string,
    reason: string,
    by: string | null = null,
  ): void {
    const { store, clientRemoved } = this.options;
    const codes = store.clients.forgetOpenPairingsOf(profileId);
    for (const client of clients) {
      store.clients.remove(client.id);
      clientRemoved(client.id);
    }
    store.accessAudit.record({
      profile_id: profileId,
      client_id: by,
      kind: 'person_revoked',
      detail: `${counted(clients.length, 'device')} unpaired, ${counted(codes, 'pairing code')} withdrawn: ${reason}`,
    });
    log.info('person.devices_unpaired', { profileId, devices: clients.length, codes, reason });
  }

  private nextEdge(): number | undefined {
    const { store, now } = this.options;
    const expiry = store.personAccess.nextExpiry(now().toISOString());
    const starts = store.personAccess
      .schedules()
      .map(({ schedule }) => this.nextStart(schedule).getTime());
    const edges = [...starts, ...(expiry === undefined ? [] : [Date.parse(expiry)])];
    return edges.length === 0 ? undefined : Math.min(...edges);
  }

  private nextStart(schedule: QuietHours): Date {
    const { store, now } = this.options;
    const zone = store.settings.read().time_zone;
    const clock = localClock(now(), zone);
    const minute = minuteOfClock(schedule.from);
    const today = zonedInstant(clock, minute, zone);
    return today.getTime() > now().getTime()
      ? today
      : zonedInstant(shiftedDate(clock, 1), minute, zone);
  }

  private pauseStarted(): void {
    const { store, now, clientPaused } = this.options;
    const minute = localClock(now(), store.settings.read().time_zone).minuteOfDay;
    for (const { profileId, schedule } of store.personAccess.schedules()) {
      if (!insideClockWindow(schedule, minute)) continue;
      for (const client of this.membersOf(profileId)) clientPaused(client.id);
    }
  }

  private membersOf(profileId: string): ClientRow[] {
    return this.options.store.clients
      .list()
      .filter((client) => client.profile_id === profileId && client.role === 'member');
  }
}
