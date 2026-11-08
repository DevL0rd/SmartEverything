import {
  ApiError,
  PLANNER_SIGNAL,
  type PlannerAlarmRow,
  type PlannerMissedReason,
  type PlannerRingRow,
  type PlannerSignal,
  type SignalInput,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Cancel, Clock } from '../clock';
import type { Store } from '../store/store';

const MINUTE_MS = 60_000;

export type RingStore = Pick<Store, 'profiles' | 'plannerAlarms' | 'plannerRings' | 'feed'>;

export interface RingDeskOptions {
  readonly store: RingStore;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly emit: (signal: SignalInput) => void;
  readonly log: Logger;
}

type AlarmSignalKind = Extract<
  PlannerSignal['kind'],
  'alarm_rang' | 'alarm_dismissed' | 'alarm_snoozed'
>;

export class RingDesk {
  private readonly snoozing = new Map<string, Cancel>();

  constructor(private readonly options: RingDeskOptions) {}

  ring(alarm: PlannerAlarmRow, dueAt: Date): PlannerRingRow {
    const row = this.options.store.plannerRings.insert({
      kind: 'alarm',
      ref_id: alarm.id,
      profile_id: alarm.profile_id,
      due_at: dueAt.toISOString(),
      rang_at: this.options.clock.now().toISOString(),
      dismissed_at: null,
      snoozes: 0,
      target: null,
      outcome: 'rang',
      missed_reason: null,
    });
    this.announce(row, alarm.label, 'alarm_rang');
    return row;
  }

  missed(alarm: PlannerAlarmRow, dueAt: Date, reason: PlannerMissedReason): PlannerRingRow {
    const row = this.options.store.plannerRings.insert({
      kind: 'alarm',
      ref_id: alarm.id,
      profile_id: alarm.profile_id,
      due_at: dueAt.toISOString(),
      rang_at: null,
      dismissed_at: null,
      snoozes: 0,
      target: null,
      outcome: 'missed',
      missed_reason: reason,
    });
    this.options.log.warn('planner.alarm_missed', { alarmId: alarm.id, reason });
    this.notice(row);
    return row;
  }

  ringingNow(profileId: string): PlannerRingRow[] {
    const now = this.options.clock.now().getTime();
    return this.options.store.plannerRings
      .ringing(profileId)
      .filter((row) => row.rang_at !== null && Date.parse(row.rang_at) <= now);
  }

  snooze(profileId: string, ringId: string, minutes?: number): PlannerRingRow {
    const ring = this.open(profileId, ringId);
    const alarm = this.options.store.plannerAlarms.find(ring.ref_id, profileId);
    const length = minutes ?? alarm?.snooze_minutes;
    if (length === undefined) {
      throw new ApiError('invalid_request', 'The alarm is gone, so say how long to snooze.');
    }
    const until = new Date(this.options.clock.now().getTime() + length * MINUTE_MS);
    const row = this.options.store.plannerRings.update(ringId, {
      snoozes: ring.snoozes + 1,
      rang_at: until.toISOString(),
    });
    this.hold(row, until);
    this.options.emit(
      this.signal('alarm_snoozed', row, alarm?.label ?? null, {
        snoozes: row.snoozes,
        until: until.toISOString(),
      }),
    );
    this.notice(row);
    return row;
  }

  dismiss(profileId: string, ringId: string): PlannerRingRow {
    const ring = this.open(profileId, ringId);
    this.snoozing.get(ringId)?.();
    this.snoozing.delete(ringId);
    const row = this.options.store.plannerRings.update(ringId, {
      dismissed_at: this.options.clock.now().toISOString(),
    });
    const alarm = this.options.store.plannerAlarms.find(ring.ref_id, profileId);
    this.options.emit(this.signal('alarm_dismissed', row, alarm?.label ?? null));
    this.notice(row);
    return row;
  }

  reconcile(reason: PlannerMissedReason): void {
    this.stop();
    const now = this.options.clock.now();
    for (const profile of this.options.store.profiles.list()) {
      for (const alarm of this.options.store.plannerAlarms.list(profile.id)) {
        for (const row of this.options.store.plannerRings.forRef('alarm', alarm.id)) {
          this.settleSnooze(row, now, reason);
        }
      }
    }
  }

  stop(): void {
    for (const cancel of this.snoozing.values()) {
      cancel();
    }
    this.snoozing.clear();
  }

  private settleSnooze(row: PlannerRingRow, now: Date, reason: PlannerMissedReason): void {
    if (row.outcome !== 'rang' || row.dismissed_at !== null || row.snoozes === 0) {
      return;
    }
    const resumeAt = new Date(Date.parse(row.rang_at ?? row.due_at));
    if (resumeAt.getTime() > now.getTime()) {
      this.hold(row, resumeAt);
      return;
    }
    this.options.log.warn('planner.snooze_overdue', { ringId: row.id, reason });
    this.options.store.plannerRings.update(row.id, { dismissed_at: now.toISOString() });
  }

  private hold(row: PlannerRingRow, until: Date): void {
    this.snoozing.get(row.id)?.();
    this.snoozing.set(
      row.id,
      this.options.clock.at(until, () => {
        this.snoozing.delete(row.id);
        this.resound(row.id);
      }),
    );
  }

  private resound(ringId: string): void {
    const ring = this.options.store.plannerRings.find(ringId);
    if (ring?.dismissed_at !== null) {
      return;
    }
    const alarm = this.options.store.plannerAlarms.find(ring.ref_id, ring.profile_id);
    this.announce(ring, alarm?.label ?? null, 'alarm_rang');
  }

  private open(profileId: string, ringId: string): PlannerRingRow {
    const ring = this.options.store.plannerRings.find(ringId);
    if (ring?.profile_id !== profileId) {
      throw new ApiError('not_found', 'That ring does not exist.');
    }
    if (ring.outcome !== 'rang' || ring.dismissed_at !== null) {
      throw new ApiError('conflict', 'That ring is no longer ringing.');
    }
    return ring;
  }

  private announce(row: PlannerRingRow, label: string | null, kind: AlarmSignalKind): void {
    this.options.emit(this.signal(kind, row, label));
    this.notice(row);
  }

  private notice(row: PlannerRingRow): void {
    this.options.store.feed.notice({
      type: 'planner_ring',
      ringId: row.id,
      kind: row.kind,
      refId: row.ref_id,
      dueAt: row.due_at,
    });
  }

  private signal(
    kind: AlarmSignalKind,
    row: PlannerRingRow,
    label: string | null,
    extra: object = {},
  ): SignalInput {
    return PLANNER_SIGNAL.parse({
      source: 'planner',
      kind,
      subject: row.ref_id,
      field: null,
      value: row.id,
      previous: null,
      at: this.options.clock.now().toISOString(),
      profileId: row.profile_id,
      data: { alarmId: row.ref_id, ringId: row.id, label, dueAt: row.due_at, ...extra },
    });
  }
}
