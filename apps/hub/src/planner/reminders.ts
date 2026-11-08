import {
  PLANNER_SIGNAL,
  type LiveChange,
  type PlannerItemRow,
  type PlannerMissedReason,
  type PlannerRingRow,
  type SignalInput,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Cancel, Clock } from '../clock';
import type { Store } from '../store/store';
import { isoOf } from './instants';
import { expandOccurrences } from './occurrences';
import { loadWindow } from './range';
import { duesOfView, reachOf, ringKey, type Due } from './reminder-dues';
import { profileIdOfItem, type SummaryDesk, type SummaryStore } from './summary';

const DAY_MS = 86_400_000;

export type ReminderStore = SummaryStore &
  Pick<Store, 'plannerItems' | 'plannerOccurrences' | 'plannerRings'>;

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
  private readonly watermark = new Map<string, number>();
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly options: ReminderSchedulerOptions) {}

  start(): void {
    this.reconcile('hub_down');
    this.unsubscribe = this.options.store.feed.subscribe((change) => {
      this.follow(change);
    });
  }

  private follow(change: LiveChange): void {
    if (change.table === 'planner_items') {
      const row = change.record ?? change.oldRecord;
      if (row !== null) this.arm(row.profile_id);
    } else if (change.table === 'planner_occurrences') {
      const row = change.record ?? change.oldRecord;
      const profileId = row === null ? null : profileIdOfItem(this.options.store, row.item_id);
      if (profileId === null) this.armAll();
      else this.arm(profileId);
    } else if (change.table === 'settings') {
      this.armAll();
    }
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.disarmAll();
  }

  resumed(): void {
    this.reconcile('computer_asleep');
  }

  private zone(): string {
    return this.options.store.settings.read().time_zone;
  }

  private nowInstant(): Temporal.Instant {
    return Temporal.Instant.fromEpochMilliseconds(this.options.clock.now().getTime());
  }

  private reconcile(reason: PlannerMissedReason): void {
    this.disarmAll();
    this.watermark.clear();
    const now = this.nowInstant();
    for (const profile of this.options.store.profiles.list()) {
      this.settleOverdue(profile.id, now, reason);
      this.watermark.set(profile.id, now.epochMilliseconds + 1);
    }
    this.armAll();
    this.options.summary.refreshAll();
  }

  private settleOverdue(
    profileId: string,
    now: Temporal.Instant,
    reason: PlannerMissedReason,
  ): void {
    const lower = this.handledUntil(profileId);
    if (lower.size === 0) return;
    const from = Temporal.Instant.fromEpochMilliseconds(Math.min(...lower.values()));
    const overdue = this.duesIn(profileId, from, now.add({ milliseconds: 1 })).filter(
      (due) =>
        due.kind === 'reminder' &&
        due.at.epochMilliseconds > (lower.get(due.item.id) ?? Infinity) &&
        !this.rung(due),
    );
    for (const due of overdue) this.recordMissed(due, reason);
  }

  private handledUntil(profileId: string): Map<string, number> {
    const lower = new Map<string, number>();
    for (const item of this.options.store.plannerItems.list(profileId)) {
      if (item.reminders.length === 0) continue;
      const rings = this.options.store.plannerRings.forRef('reminder', item.id);
      const latest = rings.at(-1)?.due_at;
      lower.set(
        item.id,
        Math.max(Date.parse(item.updated_at), latest === undefined ? 0 : Date.parse(latest)),
      );
    }
    return lower;
  }

  private duesIn(profileId: string, from: Temporal.Instant, to: Temporal.Instant): Due[] {
    const { store } = this.options;
    const zone = this.zone();
    const reach = reachOf(store.plannerItems.list(profileId));
    const window = {
      from: from.subtract({ milliseconds: reach.lead }),
      to: to.add({ milliseconds: reach.reach }),
      timeZone: zone,
    };
    const loaded = loadWindow(store, profileId, window);
    const items = new Map(loaded.items.map((item) => [item.id, item]));
    const views = expandOccurrences({
      items: loaded.items,
      stored: loaded.stored,
      window,
      now: from,
    });
    const seen = new Set<string>();
    return views
      .flatMap((view) => {
        const item = items.get(view.item_id);
        return item === undefined ? [] : duesOfView(view, item, zone);
      })
      .filter((due) => {
        const key = `${due.kind}|${due.view.occurrence_key}|${ringKey(due.item, due.at)}`;
        const inside =
          Temporal.Instant.compare(due.at, from) >= 0 && Temporal.Instant.compare(due.at, to) < 0;
        if (!inside || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => Temporal.Instant.compare(a.at, b.at));
  }

  private next(profileId: string, after: Temporal.Instant): Due | null {
    const reach = reachOf(this.options.store.plannerItems.list(profileId));
    if (!reach.relevant) return null;
    for (let span = DAY_MS; ; span *= 2) {
      const to = after.add({ milliseconds: span });
      const best = this.duesIn(profileId, after, to)[0];
      if (best !== undefined) return best;
      if (reach.latest !== null && to.epochMilliseconds > reach.latest) return null;
    }
  }

  private arm(profileId: string): void {
    const floor = this.watermark.get(profileId) ?? 0;
    const after = Temporal.Instant.fromEpochMilliseconds(
      Math.max(this.options.clock.now().getTime(), floor),
    );
    const due = this.next(profileId, after);
    if (due === null) {
      this.disarm(profileId);
      return;
    }
    const atMs = due.at.epochMilliseconds;
    if (this.armed.get(profileId)?.atMs === atMs) return;
    this.disarm(profileId);
    const cancel = this.options.clock.at(new Date(atMs), () => {
      this.armed.delete(profileId);
      this.run(profileId, due.at);
    });
    this.armed.set(profileId, { atMs, cancel });
  }

  private run(profileId: string, at: Temporal.Instant): void {
    this.watermark.set(profileId, at.epochMilliseconds + 1);
    const dues = this.duesIn(profileId, at, at.add({ milliseconds: 1 }));
    const pulls = this.pulls(dues);
    if (pulls.length === 0) {
      this.settle(profileId, dues);
      return;
    }
    this.afterPulls(profileId, at, pulls).catch((cause: unknown) => {
      this.options.log.error('planner.reminder_failed', cause, { profileId });
    });
  }

  private async afterPulls(
    profileId: string,
    at: Temporal.Instant,
    pulls: readonly Promise<void>[],
  ): Promise<void> {
    for (const result of await Promise.allSettled(pulls)) {
      if (result.status === 'rejected') {
        this.options.log.error('planner.reminder_pull_failed', result.reason, { profileId });
      }
    }
    this.settle(profileId, this.duesIn(profileId, at, at.add({ milliseconds: 1 })));
  }

  private settle(profileId: string, dues: readonly Due[]): void {
    try {
      this.announceAll(dues);
    } catch (cause) {
      this.options.log.error('planner.reminder_failed', cause, { profileId });
    } finally {
      this.options.summary.refresh(profileId);
      this.arm(profileId);
    }
  }

  private pulls(dues: readonly Due[]): Promise<void>[] {
    const { pull } = this.options;
    if (pull === undefined) return [];
    const items = new Map(
      dues.filter((due) => due.item.google !== null).map((due) => [due.item.id, due.item]),
    );
    return [...items.values()].map((item) => pull(item));
  }

  private announceAll(dues: readonly Due[]): void {
    for (const due of dues) {
      if (due.kind === 'missed') this.emitTask('task_missed', due, null);
      else if (!this.rung(due)) this.ring(due);
    }
  }

  private rung(due: Due): boolean {
    const at = isoOf(due.at);
    return this.options.store.plannerRings
      .forRef('reminder', due.item.id)
      .some((row) => row.due_at === at);
  }

  private ring(due: Due): void {
    const now = this.options.clock.now().toISOString();
    const row = this.options.store.plannerRings.insert({
      kind: 'reminder',
      ref_id: due.item.id,
      profile_id: due.item.profile_id,
      due_at: isoOf(due.at),
      rang_at: now,
      dismissed_at: now,
      snoozes: 0,
      target: null,
      outcome: 'rang',
      missed_reason: null,
    });
    this.notice(row);
    if (due.item.kind === 'event') this.emitEvent(due, row);
    else this.emitTask('task_due', due, row);
  }

  private recordMissed(due: Due, reason: PlannerMissedReason): void {
    const row = this.options.store.plannerRings.insert({
      kind: 'reminder',
      ref_id: due.item.id,
      profile_id: due.item.profile_id,
      due_at: isoOf(due.at),
      rang_at: null,
      dismissed_at: null,
      snoozes: 0,
      target: null,
      outcome: 'missed',
      missed_reason: reason,
    });
    this.options.log.warn('planner.reminder_missed', { itemId: due.item.id, reason });
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

  private base(due: Due, ring: PlannerRingRow | null): Omit<SignalInput, 'kind' | 'data'> {
    return {
      source: 'planner',
      subject: due.item.id,
      field: null,
      value: ring?.id ?? due.view.occurrence_key,
      previous: null,
      at: this.options.clock.now().toISOString(),
      profileId: due.item.profile_id,
    };
  }

  private emitTask(kind: 'task_due' | 'task_missed', due: Due, ring: PlannerRingRow | null): void {
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

  private emitEvent(due: Due, ring: PlannerRingRow): void {
    this.options.emit(
      PLANNER_SIGNAL.parse({
        ...this.base(due, ring),
        kind: 'event_starting',
        data: {
          itemId: due.item.id,
          occurrenceKey: due.view.occurrence_key,
          title: due.item.title,
          startsAt: isoOf(due.anchor),
          minutesBefore: due.minutesBefore,
        },
      }),
    );
  }

  private armAll(): void {
    for (const profile of this.options.store.profiles.list()) this.arm(profile.id);
  }

  private disarm(profileId: string): void {
    this.armed.get(profileId)?.cancel();
    this.armed.delete(profileId);
  }

  private disarmAll(): void {
    for (const profileId of [...this.armed.keys()]) this.disarm(profileId);
  }
}
