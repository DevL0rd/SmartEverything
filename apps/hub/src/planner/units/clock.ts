import {
  ApiError,
  type PlannerAlarmRow,
  type PlannerLap,
  type PlannerMissedReason,
  type PlannerRingRow,
  type PlannerStopwatchRow,
  type PlannerTimerRow,
} from '@smarteverything/domain';
import { storeUnit } from '../../store/host/unit';
import type { PlannerTimerPatch } from '../../store/repositories/planner-timers';
import type { Store } from '../../store/store';
import { nextRing, ringsBetween } from '../alarms';
import { elapsedOf } from '../stopwatch';

const MINUTE_MS = 60_000;

function iso(milliseconds: number): string {
  return new Date(milliseconds).toISOString();
}

function remainingOf(timer: PlannerTimerRow, now: number): number {
  if (timer.ends_at === null) return timer.remaining_ms ?? 0;
  return Math.max(Date.parse(timer.ends_at) - now, 0);
}

function extension(timer: PlannerTimerRow, milliseconds: number, now: number): PlannerTimerPatch {
  if (timer.state === 'running') {
    return {
      duration_ms: timer.duration_ms + milliseconds,
      ends_at: iso(Date.parse(timer.ends_at ?? '') + milliseconds),
    };
  }
  if (timer.state === 'paused') {
    return {
      duration_ms: timer.duration_ms + milliseconds,
      remaining_ms: (timer.remaining_ms ?? 0) + milliseconds,
    };
  }
  return {
    duration_ms: milliseconds,
    state: 'running',
    ends_at: iso(now + milliseconds),
    remaining_ms: null,
  };
}

function dismissTimerRings(store: Store, timer: PlannerTimerRow, now: number): void {
  for (const ring of store.plannerRings.forRef('timer', timer.id)) {
    if (ring.outcome === 'rang' && ring.dismissed_at === null) {
      store.plannerRings.update(ring.id, { dismissed_at: iso(now) });
    }
  }
}

export type TimerAction =
  | { readonly kind: 'pause' }
  | { readonly kind: 'resume' }
  | { readonly kind: 'add'; readonly ms: number }
  | { readonly kind: 'cancel' };

export interface TimerChange {
  readonly id: string;
  readonly profileId: string;
  readonly action: TimerAction;
  readonly nowMs: number;
}

function changedTimer(
  store: Store,
  { id, profileId, action, nowMs }: TimerChange,
): PlannerTimerRow {
  const timer = store.plannerTimers.byId(id, profileId);
  if (action.kind === 'pause') {
    if (timer.state !== 'running')
      throw new ApiError('conflict', 'Only a running timer can pause.');
    return store.plannerTimers.update(id, profileId, {
      state: 'paused',
      ends_at: null,
      remaining_ms: remainingOf(timer, nowMs),
    });
  }
  if (action.kind === 'resume') {
    if (timer.state !== 'paused') throw new ApiError('conflict', 'Only a paused timer can resume.');
    return store.plannerTimers.update(id, profileId, {
      state: 'running',
      ends_at: iso(nowMs + remainingOf(timer, 0)),
      remaining_ms: null,
    });
  }
  if (action.kind === 'add') {
    if (timer.state === 'cancelled') throw new ApiError('conflict', 'A cancelled timer is gone.');
    const row = store.plannerTimers.update(id, profileId, extension(timer, action.ms, nowMs));
    dismissTimerRings(store, timer, nowMs);
    return row;
  }
  if (timer.state === 'cancelled') return timer;
  const row = store.plannerTimers.update(id, profileId, {
    state: 'cancelled',
    ends_at: null,
    remaining_ms: null,
  });
  dismissTimerRings(store, timer, nowMs);
  return row;
}

export interface TimerFinish {
  readonly timer: PlannerTimerRow;
  readonly outcome: 'rang' | 'missed';
  readonly nowMs: number;
}

function finishedTimer(store: Store, { timer, outcome, nowMs }: TimerFinish): PlannerRingRow {
  store.plannerTimers.update(timer.id, timer.profile_id, {
    state: 'done',
    ends_at: null,
    remaining_ms: null,
  });
  return store.plannerRings.insert({
    kind: 'timer',
    ref_id: timer.id,
    profile_id: timer.profile_id,
    due_at: timer.ends_at ?? iso(nowMs),
    rang_at: outcome === 'rang' ? iso(nowMs) : null,
    dismissed_at: null,
    snoozes: 0,
    target: null,
    outcome,
    missed_reason: outcome === 'missed' ? 'hub_down' : null,
  });
}

export type StopwatchAction = 'begin' | 'pause' | 'lap' | 'reset';

function stopwatchOf(store: Store, profileId: string): PlannerStopwatchRow {
  return (
    store.plannerStopwatch.find(profileId) ??
    store.plannerStopwatch.insert({
      profile_id: profileId,
      running: false,
      started_at: null,
      accumulated_ms: 0,
      laps: [],
    })
  );
}

function changedStopwatch(
  store: Store,
  {
    profileId,
    action,
    nowMs,
  }: { readonly profileId: string; readonly action: StopwatchAction; readonly nowMs: number },
): PlannerStopwatchRow {
  const row = stopwatchOf(store, profileId);
  if (action === 'begin') {
    if (row.running) return row;
    return store.plannerStopwatch.update(profileId, { running: true, started_at: iso(nowMs) });
  }
  if (action === 'pause') {
    if (!row.running) return row;
    return store.plannerStopwatch.update(profileId, {
      running: false,
      started_at: null,
      accumulated_ms: elapsedOf(row, nowMs),
    });
  }
  if (action === 'lap') {
    if (!row.running) throw new ApiError('conflict', 'Start the stopwatch before a lap.');
    const elapsed = elapsedOf(row, nowMs);
    const previous = row.laps.at(-1)?.elapsed_ms ?? 0;
    const lap: PlannerLap = { elapsed_ms: elapsed, split_ms: elapsed - previous };
    return store.plannerStopwatch.update(profileId, { laps: [...row.laps, lap] });
  }
  return store.plannerStopwatch.update(profileId, {
    running: false,
    started_at: null,
    accumulated_ms: 0,
    laps: [],
  });
}

function openRing(store: Store, profileId: string, ringId: string): PlannerRingRow {
  const ring = store.plannerRings.find(ringId);
  if (ring?.profile_id !== profileId) throw new ApiError('not_found', 'That ring does not exist.');
  if (ring.outcome !== 'rang' || ring.dismissed_at !== null) {
    throw new ApiError('conflict', 'That ring is no longer ringing.');
  }
  return ring;
}

function assertSnoozeLeft(limit: number | null, used: number): void {
  if (limit !== null && used >= limit) {
    throw new ApiError(
      'conflict',
      `This alarm allows ${String(limit)} ${limit === 1 ? 'snooze' : 'snoozes'} and they are used up.`,
    );
  }
}

export interface LabelledRing {
  readonly row: PlannerRingRow;
  readonly label: string | null;
}

export interface SnoozedRing extends LabelledRing {
  readonly until: string;
}

function snoozedRing(
  store: Store,
  {
    profileId,
    ringId,
    minutes,
    nowMs,
  }: {
    readonly profileId: string;
    readonly ringId: string;
    readonly minutes: number | null;
    readonly nowMs: number;
  },
): SnoozedRing {
  const ring = openRing(store, profileId, ringId);
  const alarm = store.plannerAlarms.find(ring.ref_id, profileId);
  assertSnoozeLeft(alarm?.snooze_limit ?? null, ring.snoozes);
  const length = minutes ?? alarm?.snooze_minutes;
  if (length === undefined) {
    throw new ApiError('invalid_request', 'The alarm is gone, so say how long to snooze.');
  }
  const until = iso(nowMs + length * MINUTE_MS);
  const row = store.plannerRings.update(ringId, { snoozes: ring.snoozes + 1, rang_at: until });
  return { row, label: alarm?.label ?? null, until };
}

function dismissedRing(
  store: Store,
  {
    profileId,
    ringId,
    nowMs,
  }: { readonly profileId: string; readonly ringId: string; readonly nowMs: number },
): LabelledRing {
  const ring = openRing(store, profileId, ringId);
  const row = store.plannerRings.update(ringId, { dismissed_at: iso(nowMs) });
  return { row, label: store.plannerAlarms.find(ring.ref_id, profileId)?.label ?? null };
}

export interface SnoozeSettlement {
  readonly held: readonly { readonly row: PlannerRingRow; readonly resumeAt: string }[];
  readonly dismissed: readonly string[];
}

function settledSnoozes(store: Store, { nowMs }: { readonly nowMs: number }): SnoozeSettlement {
  const held: { row: PlannerRingRow; resumeAt: string }[] = [];
  const dismissed: string[] = [];
  for (const profile of store.profiles.list()) {
    for (const alarm of store.plannerAlarms.list(profile.id)) {
      for (const row of store.plannerRings.forRef('alarm', alarm.id)) {
        if (row.outcome !== 'rang' || row.dismissed_at !== null || row.snoozes === 0) continue;
        const resumeAt = Date.parse(row.rang_at ?? row.due_at);
        if (resumeAt > nowMs) {
          held.push({ row, resumeAt: iso(resumeAt) });
          continue;
        }
        store.plannerRings.update(row.id, { dismissed_at: iso(nowMs) });
        dismissed.push(row.id);
      }
    }
  }
  return { held, dismissed };
}

function repeats(alarm: PlannerAlarmRow): boolean {
  return alarm.once_on === null && alarm.days.length > 0;
}

function handledUntil(store: Store, alarm: PlannerAlarmRow): Date {
  const latestRing = store.plannerRings.forRef('alarm', alarm.id).at(-1)?.due_at;
  const edited = Date.parse(alarm.updated_at);
  return new Date(latestRing === undefined ? edited : Math.max(edited, Date.parse(latestRing)));
}

function missedAlarms(
  store: Store,
  { nowMs, reason }: { readonly nowMs: number; readonly reason: PlannerMissedReason },
): PlannerRingRow[] {
  const zone = store.settings.read().time_zone;
  const now = new Date(nowMs);
  const missed: PlannerRingRow[] = [];
  for (const alarm of store.plannerAlarms.enabled()) {
    const overdue = ringsBetween(alarm, handledUntil(store, alarm), now, zone);
    for (const dueAt of overdue) {
      missed.push(
        store.plannerRings.insert({
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
        }),
      );
    }
    if (overdue.length > 0 && !repeats(alarm)) {
      store.plannerAlarms.update(alarm.id, alarm.profile_id, { enabled: false });
    }
  }
  return missed;
}

function skippedAlarm(
  store: Store,
  {
    profileId,
    alarmId,
    nowMs,
  }: { readonly profileId: string; readonly alarmId: string; readonly nowMs: number },
): PlannerAlarmRow {
  const alarm = store.plannerAlarms.byId(alarmId, profileId);
  if (!repeats(alarm)) {
    throw new ApiError('invalid_request', 'Only a repeating alarm has a next ring to skip.');
  }
  const zone = store.settings.read().time_zone;
  const upcoming = nextRing({ ...alarm, skip_on: null }, new Date(nowMs), zone);
  if (upcoming === null) return alarm;
  const date = Temporal.Instant.fromEpochMilliseconds(upcoming.getTime())
    .toZonedDateTimeISO(zone)
    .toPlainDate()
    .toString();
  return store.plannerAlarms.update(alarmId, profileId, { skip_on: date });
}

export const PLANNER_CLOCK_WRITE_UNITS = {
  plannerTimerChange: storeUnit(changedTimer),
  plannerTimerFinish: storeUnit(finishedTimer),
  plannerStopwatch: storeUnit(changedStopwatch),
  plannerRingSnooze: storeUnit(snoozedRing),
  plannerRingDismiss: storeUnit(dismissedRing),
  plannerRingSnoozesSettle: storeUnit(settledSnoozes),
  plannerAlarmsMissed: storeUnit(missedAlarms),
  plannerAlarmSkipNext: storeUnit(skippedAlarm),
} as const;
