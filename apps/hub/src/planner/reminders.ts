import {
  PLANNER_SIGNAL,
  type LiveChange,
  type PlannerItemRow,
  type PlannerMissedReason,
  type PlannerRingRow,
  type SignalInput,
} from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import type { Cancel, Clock } from '../clock';
import { Coalesced } from '../store/reader';
import type { Store } from '../store/store';
import { PendingWork } from './pending-work';
import { profilesOfItem, type SummaryDesk } from './summary';
import type { AnnouncedDue, PlainDue } from './units/reminders';

export type ReminderStore = Pick<Store, 'host' | 'feed'>;

export type ReminderPull = (item: PlannerItemRow) => Promise<void>;

export interface ReminderSchedulerOptions {
  readonly store: ReminderStore;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly emit: (signal: SignalInput) => void;
  readonly summary: Pick<SummaryDesk, 'refresh' | 'refreshAll'>;
  readonly log: Logger;
  readonly pull?: ReminderPull;
}

interface Armed {
  readonly atMs: number;
  readonly cancel: Cancel;
}

export class ReminderScheduler {
  private readonly armed = new Map<string, Armed>();
  private readonly arming = new Map<string, Coalesced>();
  private readonly watermark = new Map<string, number>();
  private unsubscribe: (() => void) | null = null;
  private turn = 0;
  private readonly work = new PendingWork('planner.reminder_follow_failed');

  constructor(private readonly options: ReminderSchedulerOptions) {}

  async start(): Promise<void> {
    this.unsubscribe = this.options.store.feed.subscribe((change) => {
      this.work.run(this.follow(change));
    });
    await this.reconcile('hub_down');
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.turn += 1;
    for (const run of this.arming.values()) background(run.stop(), 'planner.reminder_failed');
    this.arming.clear();
    this.disarmAll();
  }

  resumed(): Promise<void> {
    return this.reconcile('computer_asleep');
  }

  async settled(): Promise<void> {
    await this.work.settled();
    await Promise.all([...this.arming.values()].map((run) => run.idle()));
    await this.work.settled();
  }

  private async follow(change: LiveChange): Promise<void> {
    if (change.table === 'planner_items') await this.followItem(change.record ?? change.oldRecord);
    else if (change.table === 'planner_guests') this.followGuest(change.record ?? change.oldRecord);
    else if (change.table === 'planner_occurrences') {
      await this.followOccurrence(change.record ?? change.oldRecord);
    } else if (change.table === 'settings') await this.armAll();
  }

  private async followItem(row: PlannerItemRow | null): Promise<void> {
    if (row === null) return;
    const involved = await this.options.store.host.read('plannerItemInvolved', { item: row });
    for (const profileId of involved) this.arm(profileId);
  }

  private followGuest(row: { readonly profile_id: string | null } | null): void {
    if (row?.profile_id !== null && row?.profile_id !== undefined) this.arm(row.profile_id);
  }

  private async followOccurrence(row: { readonly item_id: string } | null): Promise<void> {
    const profiles = row === null ? [] : await profilesOfItem(this.options.store, row.item_id);
    if (profiles.length === 0) await this.armAll();
    else for (const profileId of profiles) this.arm(profileId);
  }

  private async reconcile(reason: PlannerMissedReason): Promise<void> {
    const turn = ++this.turn;
    this.disarmAll();
    this.watermark.clear();
    const nowMs = this.options.clock.now().getTime();
    const overdue = await this.options.store.host.write('plannerRemindersOverdue', {
      nowMs,
      reason,
    });
    for (const row of overdue.missed) {
      this.options.log.warn('planner.reminder_missed', { itemId: row.ref_id, reason });
      this.notice(row);
    }
    if (turn !== this.turn) return;
    for (const profileId of overdue.profiles) this.watermark.set(profileId, nowMs + 1);
    await Promise.all(overdue.profiles.map((profileId) => this.armProfile(profileId)));
    await this.options.summary.refreshAll();
  }

  private async armAll(): Promise<void> {
    const profiles = await this.options.store.host.call('profiles', 'list');
    await Promise.all(profiles.map((profile) => this.armProfile(profile.id)));
  }

  private arm(profileId: string): void {
    this.work.run(this.armProfile(profileId), { profileId });
  }

  private async armProfile(profileId: string): Promise<void> {
    if (this.unsubscribe === null) return;
    const run =
      this.arming.get(profileId) ??
      new Coalesced(
        () => this.armNow(profileId),
        (cause) => {
          this.options.log.error('planner.reminder_failed', cause, { profileId });
        },
      );
    this.arming.set(profileId, run);
    run.trigger();
    await run.idle();
  }

  private async armNow(profileId: string): Promise<void> {
    const turn = this.turn;
    const floor = this.watermark.get(profileId) ?? 0;
    const afterMs = Math.max(this.options.clock.now().getTime(), floor);
    const due = await this.options.store.host.read('plannerReminderNext', { profileId, afterMs });
    if (turn !== this.turn) return;
    if (due === null) {
      this.disarm(profileId);
      return;
    }
    const { atMs } = due;
    if (this.armed.get(profileId)?.atMs === atMs) return;
    this.disarm(profileId);
    const cancel = this.options.clock.at(new Date(atMs), () => {
      this.armed.delete(profileId);
      this.work.run(this.run(profileId, atMs), { profileId });
    });
    this.armed.set(profileId, { atMs, cancel });
  }

  private async run(profileId: string, atMs: number): Promise<void> {
    this.watermark.set(profileId, atMs + 1);
    try {
      await this.pullFor(profileId, atMs);
      const announced = await this.options.store.host.write('plannerReminderRing', {
        profileId,
        atMs,
        nowMs: this.options.clock.now().getTime(),
      });
      this.announceAll(announced);
    } catch (cause) {
      this.options.log.error('planner.reminder_failed', cause, { profileId });
    } finally {
      await this.options.summary.refresh(profileId);
      await this.armProfile(profileId);
    }
  }

  private async pullFor(profileId: string, atMs: number): Promise<void> {
    const { pull } = this.options;
    if (pull === undefined) return;
    const dues = await this.options.store.host.read('plannerReminderDues', { profileId, atMs });
    const items = new Map(
      dues.filter((due) => due.item.google !== null).map((due) => [due.item.id, due.item]),
    );
    if (items.size === 0) return;
    for (const result of await Promise.allSettled([...items.values()].map((item) => pull(item)))) {
      if (result.status === 'rejected') {
        this.options.log.error('planner.reminder_pull_failed', result.reason, { profileId });
      }
    }
  }

  private announceAll(announced: readonly AnnouncedDue[]): void {
    for (const { due, ring } of announced) {
      if (ring === null) {
        this.emitTask('task_missed', due, null);
        continue;
      }
      this.notice(ring);
      if (due.item.kind === 'event') this.emitEvent(due, ring);
      else this.emitTask('task_due', due, ring);
    }
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

  private base(due: PlainDue, ring: PlannerRingRow | null): Omit<SignalInput, 'kind' | 'data'> {
    return {
      source: 'planner',
      subject: due.item.id,
      field: null,
      value: ring?.id ?? due.view.occurrence_key,
      previous: null,
      at: this.options.clock.now().toISOString(),
      profileId: due.profileId,
    };
  }

  private emitTask(
    kind: 'task_due' | 'task_missed',
    due: PlainDue,
    ring: PlannerRingRow | null,
  ): void {
    this.options.emit(
      PLANNER_SIGNAL.parse({
        ...this.base(due, ring),
        kind,
        data: {
          itemId: due.item.id,
          occurrenceKey: due.view.occurrence_key,
          title: due.item.title,
          dueAt: due.view.due_at,
        },
      }),
    );
  }

  private emitEvent(due: PlainDue, ring: PlannerRingRow): void {
    this.options.emit(
      PLANNER_SIGNAL.parse({
        ...this.base(due, ring),
        kind: 'event_starting',
        data: {
          itemId: due.item.id,
          occurrenceKey: due.view.occurrence_key,
          title: due.item.title,
          startsAt: new Date(due.anchorMs).toISOString(),
          minutesBefore: due.minutesBefore,
        },
      }),
    );
  }

  private disarm(profileId: string): void {
    this.armed.get(profileId)?.cancel();
    this.armed.delete(profileId);
  }

  private disarmAll(): void {
    for (const profileId of [...this.armed.keys()]) this.disarm(profileId);
  }
}
