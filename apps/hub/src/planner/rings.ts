import {
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
import { PendingWork } from './pending-work';

export type RingStore = Pick<Store, 'host' | 'feed'>;

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
  private readonly work = new PendingWork('planner.alarm_resound_failed');

  constructor(private readonly options: RingDeskOptions) {}

  async ring(alarm: PlannerAlarmRow, dueAt: Date): Promise<PlannerRingRow> {
    const row = await this.options.store.host.call('plannerRings', 'insert', {
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

  missed(row: PlannerRingRow, reason: PlannerMissedReason): void {
    this.options.log.warn('planner.alarm_missed', { alarmId: row.ref_id, reason });
    this.notice(row);
  }

  async ringingNow(profileId: string): Promise<PlannerRingRow[]> {
    const now = this.options.clock.now().getTime();
    return (await this.options.store.host.call('plannerRings', 'ringing', profileId)).filter(
      (row) => row.rang_at !== null && Date.parse(row.rang_at) <= now,
    );
  }

  async snooze(profileId: string, ringId: string, minutes?: number): Promise<PlannerRingRow> {
    const { row, label, until } = await this.options.store.host.write('plannerRingSnooze', {
      profileId,
      ringId,
      minutes: minutes ?? null,
      nowMs: this.options.clock.now().getTime(),
    });
    this.hold(row, new Date(until));
    this.options.emit(this.signal('alarm_snoozed', row, label, { snoozes: row.snoozes, until }));
    this.notice(row);
    return row;
  }

  async dismiss(profileId: string, ringId: string): Promise<PlannerRingRow> {
    const { row, label } = await this.options.store.host.write('plannerRingDismiss', {
      profileId,
      ringId,
      nowMs: this.options.clock.now().getTime(),
    });
    this.snoozing.get(ringId)?.();
    this.snoozing.delete(ringId);
    this.options.emit(this.signal('alarm_dismissed', row, label));
    this.notice(row);
    return row;
  }

  async reconcile(reason: PlannerMissedReason): Promise<void> {
    this.stop();
    const settled = await this.options.store.host.write('plannerRingSnoozesSettle', {
      nowMs: this.options.clock.now().getTime(),
    });
    for (const { row, resumeAt } of settled.held) this.hold(row, new Date(resumeAt));
    for (const ringId of settled.dismissed) {
      this.options.log.warn('planner.snooze_overdue', { ringId, reason });
    }
  }

  settled(): Promise<void> {
    return this.work.settled();
  }

  stop(): void {
    for (const cancel of this.snoozing.values()) {
      cancel();
    }
    this.snoozing.clear();
  }

  private hold(row: PlannerRingRow, until: Date): void {
    this.snoozing.get(row.id)?.();
    this.snoozing.set(
      row.id,
      this.options.clock.at(until, () => {
        this.snoozing.delete(row.id);
        this.work.run(this.resound(row.id), { ringId: row.id });
      }),
    );
  }

  private async resound(ringId: string): Promise<void> {
    const { host } = this.options.store;
    const ring = await host.call('plannerRings', 'find', ringId);
    if (ring?.dismissed_at !== null) {
      return;
    }
    const alarm = await host.call('plannerAlarms', 'find', ring.ref_id, ring.profile_id);
    this.announce(ring, alarm?.label ?? null, 'alarm_rang');
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
