import {
  PLANNER_OCCURRENCE_SINGLE,
  PLANNER_SIGNAL_SOURCE,
  signalMatchesMatcher,
  type PlannerEvidence,
  type PlannerItemRow,
  type PlannerOccurrenceRow,
  type PlannerOccurrenceView,
  type SignalInput,
  type SignalMatcher,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { storeUnit } from '../../store/host/unit';
import type { HostStore } from '../../store/host/host-store';
import { expandOccurrences } from '../occurrences';

const log = new Logger('hub.planner');

export interface StepCompletion {
  readonly at: string;
  readonly by: PlannerOccurrenceRow['completed_by'];
  readonly evidence: PlannerEvidence | null;
}

export function completeOpenSteps(
  store: Pick<HostStore, 'plannerItems' | 'plannerOccurrences'>,
  parent: PlannerItemRow,
  completion: StepCompletion,
): PlannerOccurrenceRow[] {
  if (parent.rrule !== null) return [];
  const done: PlannerOccurrenceRow[] = [];
  for (const step of store.plannerItems.children(parent.id, parent.profile_id)) {
    if (step.kind !== 'task' || step.status !== 'open' || step.rrule !== null) continue;
    const existing = store.plannerOccurrences.find(step.id, PLANNER_OCCURRENCE_SINGLE);
    if (existing?.status === 'done' || existing?.status === 'skipped') continue;
    done.push(
      store.plannerOccurrences.save({
        item_id: step.id,
        occurrence_key: PLANNER_OCCURRENCE_SINGLE,
        status: 'done',
        completed_at: completion.at,
        completed_by: completion.by,
        evidence: completion.evidence,
        moved_start: null,
        moved_end: null,
      }),
    );
    store.plannerItems.update(step.id, step.profile_id, { status: 'done' });
  }
  return done;
}

interface SignalRule {
  readonly matcher: SignalMatcher;
  readonly window: 'occurrence' | 'day';
  readonly minSeconds: number | null;
}

export interface Completed {
  readonly item: PlannerItemRow;
  readonly view: PlannerOccurrenceView;
  readonly row: PlannerOccurrenceRow;
}

interface Day {
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
  readonly zone: string;
}

const OPEN_STATUSES: ReadonlySet<PlannerOccurrenceView['status']> = new Set(['open', 'missed']);

const LENGTH_FIELDS = ['durationS', 'duration_s', 'durationSeconds'] as const;

function textOf(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function ruleOf(item: PlannerItemRow): SignalRule | null {
  const { completion } = item;
  return completion.kind === 'signal'
    ? {
        matcher: completion.matcher,
        window: completion.window,
        minSeconds: completion.minSeconds ?? null,
      }
    : null;
}

function lengthOf(signal: SignalInput): number | null {
  for (const field of LENGTH_FIELDS) {
    const value = signal.data[field];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function longEnough(rule: SignalRule, signal: SignalInput): boolean {
  if (rule.minSeconds === null) return true;
  const length = lengthOf(signal);
  return length !== null && length >= rule.minSeconds;
}

function ownerOf(signal: SignalInput): string | null {
  return signal.profileId ?? textOf(signal.data['profileId']);
}

function evidenceOf(signal: SignalInput): PlannerEvidence {
  const device = z.uuid().safeParse(signal.subject);
  return {
    source: signal.source,
    deviceId: device.success ? device.data : null,
    summary: textOf(signal.data['summary']) ?? `${signal.source} ${signal.kind}`,
    sessionId: textOf(signal.data['sessionId']) ?? textOf(signal.data['eventId']),
  };
}

function limitOf(view: PlannerOccurrenceView, siblings: readonly PlannerOccurrenceView[]): number {
  const start = Date.parse(view.start ?? '');
  if (view.end !== null && Date.parse(view.end) > start) return Date.parse(view.end);
  const later = siblings
    .map((sibling) => Date.parse(sibling.start ?? ''))
    .filter((moment) => moment > start);
  return Math.min(...later, Number.POSITIVE_INFINITY);
}

function inSpan(
  view: PlannerOccurrenceView,
  siblings: readonly PlannerOccurrenceView[],
  at: number,
  dayEnd: number,
): boolean {
  if (view.all_day || view.start === null) return true;
  return Date.parse(view.start) <= at && at < Math.min(limitOf(view, siblings), dayEnd);
}

function candidatesOf(store: HostStore, signal: SignalInput): PlannerItemRow[] {
  if (signal.source === PLANNER_SIGNAL_SOURCE) return [];
  const owner = ownerOf(signal);
  const ids = owner === null ? store.profiles.list().map((profile) => profile.id) : [owner];
  return ids
    .flatMap((id) => store.plannerItems.list(id, { statuses: ['open'], completion: 'signal' }))
    .filter((item) => {
      const rule = ruleOf(item);
      return (
        rule !== null && signalMatchesMatcher(rule.matcher, signal) && longEnough(rule, signal)
      );
    });
}

function dayOf(store: HostStore, at: number): Day {
  const zone = store.settings.read().time_zone;
  const start = Temporal.Instant.fromEpochMilliseconds(at).toZonedDateTimeISO(zone).startOfDay();
  return { start: start.toInstant(), end: start.add({ days: 1 }).toInstant(), zone };
}

function openViews(
  store: HostStore,
  item: PlannerItemRow,
  day: Day,
  nowMs: number,
): readonly PlannerOccurrenceView[] {
  const overrides =
    item.rrule === null ? [] : store.plannerItems.overrides(item.id, item.profile_id);
  const items = [item, ...overrides];
  return expandOccurrences({
    items,
    stored: store.plannerOccurrences.forItems(items.map((entry) => entry.id)),
    window: { from: day.start, to: day.end, timeZone: day.zone },
    now: Temporal.Instant.fromEpochMilliseconds(nowMs),
  }).filter((view) => view.item_id === item.id && OPEN_STATUSES.has(view.status));
}

function save(
  store: HostStore,
  item: PlannerItemRow,
  view: PlannerOccurrenceView,
  signal: SignalInput,
): PlannerOccurrenceRow {
  const existing = store.plannerOccurrences.find(item.id, view.occurrence_key);
  const row = store.plannerOccurrences.save({
    item_id: item.id,
    occurrence_key: view.occurrence_key,
    status: 'done',
    completed_at: signal.at,
    completed_by: 'signal',
    evidence: evidenceOf(signal),
    moved_start: existing?.moved_start ?? null,
    moved_end: existing?.moved_end ?? null,
  });
  if (item.rrule === null) {
    store.plannerItems.update(item.id, item.profile_id, { status: 'done' });
    completeOpenSteps(store, item, { at: signal.at, by: 'signal', evidence: evidenceOf(signal) });
  }
  log.info('planner.completed_by_signal', {
    itemId: item.id,
    occurrenceKey: view.occurrence_key,
    source: signal.source,
    kind: signal.kind,
    subject: signal.subject,
  });
  return row;
}

interface Moment {
  readonly signal: SignalInput;
  readonly day: Day;
  readonly nowMs: number;
}

function completeItem(
  store: HostStore,
  item: PlannerItemRow,
  { signal, day, nowMs }: Moment,
): Completed[] {
  const rule = ruleOf(item);
  if (rule === null) return [];
  const views = openViews(store, item, day, nowMs);
  const at = Date.parse(signal.at);
  const wanted =
    rule.window === 'day'
      ? views
      : views.filter((view) => inSpan(view, views, at, day.end.epochMilliseconds));
  return wanted.map((view) => ({ item, view, row: save(store, item, view, signal) }));
}

function completedBy(
  store: HostStore,
  { signal, nowMs }: { readonly signal: SignalInput; readonly nowMs: number },
): Completed[] {
  const candidates = candidatesOf(store, signal);
  if (candidates.length === 0) return [];
  const day = dayOf(store, Date.parse(signal.at));
  return candidates.flatMap((item) => completeItem(store, item, { signal, day, nowMs }));
}

export const PLANNER_COMPLETION_READ_UNITS = {
  plannerSignalWanted: storeUnit(
    (store, { signal }: { readonly signal: SignalInput }): boolean =>
      candidatesOf(store, signal).length > 0,
  ),
} as const;

export const PLANNER_COMPLETION_WRITE_UNITS = {
  plannerSignalComplete: storeUnit(completedBy),
} as const;
