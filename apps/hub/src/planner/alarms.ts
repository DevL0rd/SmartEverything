import {
  type PlannerAlarmRow,
  type PlannerMissedReason,
  type PlannerRingRow,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Cancel, Clock } from '../clock';
import type { Store } from '../store/store';
import { PendingWork } from './pending-work';
import type { RingDesk } from './rings';
import type { SunriseRamp } from './sunrise';
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

export type AlarmStore = Pick<Store, 'host' | 'settings' | 'feed'>;

export interface AlarmSchedulerOptions {
  readonly store: AlarmStore;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly rings: RingDesk;
  readonly wake: WakeRoutine;
  readonly sunrise: SunriseRamp;
  readonly log: Logger;
}

interface Armed {
  readonly dueAtMs: number;
  readonly cancel: Cancel;
}

export class AlarmScheduler {
  private readonly armed = new Map<string, Armed>();
  private unsubscribe: (() => void) | null = null;
  private turn = 0;
  private readonly work = new PendingWork('planner.alarm_failed');

  constructor(private readonly options: AlarmSchedulerOptions) {}

  async start(): Promise<void> {
    this.unsubscribe = this.options.store.feed.subscribe((change) => {
      if (change.table === 'planner_alarms') {
        this.follow(change.record, change.oldRecord);
      } else if (change.table === 'settings') {
        this.work.run(this.armAll());
      }
    });
    await this.reconcile('hub_down');
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.turn += 1;
    this.disarmAll();
    this.options.rings.stop();
  }

  resumed(): Promise<void> {
    return this.reconcile('computer_asleep');
  }

  async settled(): Promise<void> {
    await this.work.settled();
    await this.options.rings.settled();
  }

  next(alarm: PlannerAlarmRow, after: Date = this.options.clock.now()): Date | null {
    return alarm.enabled ? nextRing(alarm, after, this.zone()) : null;
  }

  skipNext(profileId: string, alarmId: string): Promise<PlannerAlarmRow> {
    return this.options.store.host.write('plannerAlarmSkipNext', {
      profileId,
      alarmId,
      nowMs: this.options.clock.now().getTime(),
    });
  }

  snooze(profileId: string, ringId: string, minutes?: number): Promise<PlannerRingRow> {
    return this.options.rings.snooze(profileId, ringId, minutes);
  }

  dismiss(profileId: string, ringId: string): Promise<PlannerRingRow> {
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
        this.options.sunrise.cancel(before.id);
      }
      return;
    }
    this.arm(record);
  }

  private async reconcile(reason: PlannerMissedReason): Promise<void> {
    const turn = ++this.turn;
    this.disarmAll();
    const missed = await this.options.store.host.write('plannerAlarmsMissed', {
      nowMs: this.options.clock.now().getTime(),
      reason,
    });
    for (const row of missed) this.options.rings.missed(row, reason);
    await this.options.rings.reconcile(reason);
    if (turn === this.turn) await this.armAll();
  }

  private async armAll(): Promise<void> {
    const turn = this.turn;
    const enabled = await this.options.store.host.call('plannerAlarms', 'enabled');
    if (turn !== this.turn) return;
    for (const alarm of enabled) {
      this.arm(alarm);
    }
  }

  private arm(alarm: PlannerAlarmRow, after: Date = this.options.clock.now()): void {
    const dueAt = this.next(alarm, after);
    if (dueAt === null) {
      this.disarm(alarm.id);
      this.options.wake.cancel(alarm.id);
      this.options.sunrise.cancel(alarm.id);
      return;
    }
    this.options.wake.arm(alarm, dueAt);
    this.options.sunrise.arm(alarm, dueAt);
    if (this.armed.get(alarm.id)?.dueAtMs === dueAt.getTime()) {
      return;
    }
    this.disarm(alarm.id);
    const cancel = this.options.clock.at(dueAt, () => {
      this.armed.delete(alarm.id);
      this.work.run(this.fire(alarm.id, alarm.profile_id, dueAt), { alarmId: alarm.id });
    });
    this.armed.set(alarm.id, { dueAtMs: dueAt.getTime(), cancel });
  }

  private async fire(alarmId: string, profileId: string, dueAt: Date): Promise<void> {
    const { host } = this.options.store;
    const alarm = await host.call('plannerAlarms', 'find', alarmId, profileId);
    if (alarm?.enabled !== true) {
      return;
    }
    await this.options.rings.ring(alarm, dueAt);
    if (repeats(alarm)) {
      this.arm(alarm, new Date(Math.max(dueAt.getTime(), this.options.clock.now().getTime())));
      return;
    }
    await host.call('plannerAlarms', 'update', alarm.id, profileId, { enabled: false });
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
    this.options.sunrise.cancelAll();
  }
}
