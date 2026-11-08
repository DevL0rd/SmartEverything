import {
  ApiError,
  type PlannerAlarmRow,
  type PlannerMissedReason,
  type PlannerRingRow,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Cancel, Clock } from '../clock';
import type { Store } from '../store/store';
import type { RingDesk } from './rings';
import type { WakeRoutine } from './wake-routine';

type AlarmTiming = Pick<PlannerAlarmRow, 'time' | 'days' | 'once_on' | 'skip_on'>;

function instantOn(date: Temporal.PlainDate, time: string, zone: string): Date {
  return new Date(
    date.toZonedDateTime({ timeZone: zone, plainTime: Temporal.PlainTime.from(time) }).toInstant()
      .epochMilliseconds,
  );
}

function repeatsOn(alarm: AlarmTiming, date: Temporal.PlainDate): boolean {
  return alarm.days.length === 0 || alarm.days.includes(date.dayOfWeek % 7);
}

export function nextRing(alarm: AlarmTiming, after: Date, zone: string): Date | null {
  if (alarm.once_on !== null) {
    const once = instantOn(Temporal.PlainDate.from(alarm.once_on), alarm.time, zone);
    return alarm.skip_on === alarm.once_on || once.getTime() <= after.getTime() ? null : once;
  }
  let date = Temporal.Instant.fromEpochMilliseconds(after.getTime())
    .toZonedDateTimeISO(zone)
    .toPlainDate();
  for (;;) {
    const candidate = instantOn(date, alarm.time, zone);
    if (
      repeatsOn(alarm, date) &&
      date.toString() !== alarm.skip_on &&
      candidate.getTime() > after.getTime()
    ) {
      return candidate;
    }
    date = date.add({ days: 1 });
  }
}

function repeats(alarm: AlarmTiming): boolean {
  return alarm.once_on === null && alarm.days.length > 0;
}

export function ringsBetween(
  alarm: AlarmTiming,
  since: Date,
  until: Date,
  zone: string,
): readonly Date[] {
  const found: Date[] = [];
  let cursor = since;
  for (;;) {
    const next = nextRing(alarm, cursor, zone);
    if (next === null || next.getTime() > until.getTime()) {
      return found;
    }
    found.push(next);
    if (!repeats(alarm)) {
      return found;
    }
    cursor = next;
  }
}

export type AlarmStore = Pick<Store, 'plannerAlarms' | 'plannerRings' | 'settings' | 'feed'>;

export interface AlarmSchedulerOptions {
  readonly store: AlarmStore;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly rings: RingDesk;
  readonly wake: WakeRoutine;
  readonly log: Logger;
}

interface Armed {
  readonly dueAtMs: number;
  readonly cancel: Cancel;
}

export class AlarmScheduler {
  private readonly armed = new Map<string, Armed>();
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly options: AlarmSchedulerOptions) {}

  start(): void {
    this.reconcile('hub_down');
    this.unsubscribe = this.options.store.feed.subscribe((change) => {
      if (change.table === 'planner_alarms') {
        this.follow(change.record, change.oldRecord);
      } else if (change.table === 'settings') {
        this.armAll();
      }
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.disarmAll();
    this.options.rings.stop();
  }

  resumed(): void {
    this.reconcile('computer_asleep');
  }

  next(alarm: PlannerAlarmRow, after: Date = this.options.clock.now()): Date | null {
    return alarm.enabled ? nextRing(alarm, after, this.zone()) : null;
  }

  skipNext(profileId: string, alarmId: string): PlannerAlarmRow {
    const alarm = this.options.store.plannerAlarms.byId(alarmId, profileId);
    if (!repeats(alarm)) {
      throw new ApiError('invalid_request', 'Only a repeating alarm has a next ring to skip.');
    }
    const upcoming = nextRing({ ...alarm, skip_on: null }, this.options.clock.now(), this.zone());
    if (upcoming === null) {
      return alarm;
    }
    const date = Temporal.Instant.fromEpochMilliseconds(upcoming.getTime())
      .toZonedDateTimeISO(this.zone())
      .toPlainDate()
      .toString();
    return this.options.store.plannerAlarms.update(alarmId, profileId, { skip_on: date });
  }

  snooze(profileId: string, ringId: string, minutes?: number): PlannerRingRow {
    return this.options.rings.snooze(profileId, ringId, minutes);
  }

  dismiss(profileId: string, ringId: string): PlannerRingRow {
    return this.options.rings.dismiss(profileId, ringId);
  }

  private zone(): string {
    return this.options.store.settings.read().time_zone;
  }

  private follow(record: PlannerAlarmRow | null, before: PlannerAlarmRow | null): void {
    if (record === null) {
      if (before !== null) {
        this.disarm(before.id);
        this.options.wake.cancel(before.id);
      }
      return;
    }
    this.arm(record);
  }

  private reconcile(reason: PlannerMissedReason): void {
    this.disarmAll();
    const now = this.options.clock.now();
    for (const alarm of this.options.store.plannerAlarms.enabled()) {
      this.settleOverdue(alarm, now, reason);
    }
    this.options.rings.reconcile(reason);
    this.armAll();
  }

  private settleOverdue(alarm: PlannerAlarmRow, now: Date, reason: PlannerMissedReason): void {
    const overdue = ringsBetween(alarm, this.handledUntil(alarm), now, this.zone());
    for (const dueAt of overdue) {
      this.options.rings.missed(alarm, dueAt, reason);
    }
    if (overdue.length > 0 && !repeats(alarm)) {
      this.options.store.plannerAlarms.update(alarm.id, alarm.profile_id, { enabled: false });
    }
  }

  private handledUntil(alarm: PlannerAlarmRow): Date {
    const rings = this.options.store.plannerRings.forRef('alarm', alarm.id);
    const latestRing = rings.at(-1)?.due_at;
    const edited = Date.parse(alarm.updated_at);
    return new Date(latestRing === undefined ? edited : Math.max(edited, Date.parse(latestRing)));
  }

  private armAll(): void {
    for (const alarm of this.options.store.plannerAlarms.enabled()) {
      this.arm(alarm);
    }
  }

  private arm(alarm: PlannerAlarmRow, after: Date = this.options.clock.now()): void {
    const dueAt = this.next(alarm, after);
    if (dueAt === null) {
      this.disarm(alarm.id);
      this.options.wake.cancel(alarm.id);
      return;
    }
    this.options.wake.arm(alarm, dueAt);
    if (this.armed.get(alarm.id)?.dueAtMs === dueAt.getTime()) {
      return;
    }
    this.disarm(alarm.id);
    const cancel = this.options.clock.at(dueAt, () => {
      this.armed.delete(alarm.id);
      this.fire(alarm.id, alarm.profile_id, dueAt);
    });
    this.armed.set(alarm.id, { dueAtMs: dueAt.getTime(), cancel });
  }

  private fire(alarmId: string, profileId: string, dueAt: Date): void {
    const alarm = this.options.store.plannerAlarms.find(alarmId, profileId);
    if (alarm?.enabled !== true) {
      return;
    }
    this.options.rings.ring(alarm, dueAt);
    if (repeats(alarm)) {
      this.arm(alarm, new Date(Math.max(dueAt.getTime(), this.options.clock.now().getTime())));
      return;
    }
    this.options.store.plannerAlarms.update(alarm.id, profileId, { enabled: false });
  }

  private disarm(alarmId: string): void {
    this.armed.get(alarmId)?.cancel();
    this.armed.delete(alarmId);
  }

  private disarmAll(): void {
    for (const alarmId of [...this.armed.keys()]) {
      this.disarm(alarmId);
    }
    this.options.wake.cancelAll();
  }
}
