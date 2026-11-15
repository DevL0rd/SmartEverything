import {
  PLANNER_OCCURRENCE_SINGLE,
  type PlannerItemRow,
  type PlannerOccurrenceView,
} from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { instantOf } from '../instants';
import { expandOccurrences } from '../occurrences';

export type SearchOccurrenceStore = Pick<Store, 'plannerItems' | 'plannerOccurrences'>;

export interface Reference {
  readonly now: Temporal.Instant;
  readonly zone: string;
  readonly today: Temporal.Instant;
}

export interface Found {
  readonly view: PlannerOccurrenceView;
  readonly reading: 'next' | 'last';
}

const EARLIEST = Temporal.Instant.from('0001-01-01T00:00:00Z');

const LATEST = Temporal.Instant.from('9999-12-31T00:00:00Z');

const FIRST_DAYS = 400;

const WHOLE_RANGE_DAYS = 3_000_000;

const GROWTH = 4;

export function referenceOf(now: Temporal.Instant, zone: string): Reference {
  const date = now.toZonedDateTimeISO(zone).toPlainDate();
  return { now, zone, today: instantOf(date.toString(), null) };
}

function stopOf(view: PlannerOccurrenceView): Temporal.Instant | null {
  if (view.end !== null) return Temporal.Instant.from(view.end);
  if (view.start !== null) return Temporal.Instant.from(view.start);
  if (view.due_at !== null) return Temporal.Instant.from(view.due_at);
  if (view.due_date === null) return null;
  return instantOf(Temporal.PlainDate.from(view.due_date).add({ days: 1 }).toString(), null);
}

export function endedAt(view: PlannerOccurrenceView, reference: Reference): boolean {
  const stop = stopOf(view);
  if (stop === null) return false;
  const threshold = view.all_day ? reference.today : reference.now;
  return Temporal.Instant.compare(stop, threshold) <= 0;
}

function series(
  store: SearchOccurrenceStore,
  item: PlannerItemRow,
): { readonly items: PlannerItemRow[]; readonly ids: string[] } {
  const items =
    item.rrule === null
      ? [item]
      : [item, ...store.plannerItems.overrides(item.id, item.profile_id)];
  return { items, ids: items.map((each) => each.id) };
}

function viewsIn(
  store: SearchOccurrenceStore,
  item: PlannerItemRow,
  window: { readonly from: Temporal.Instant; readonly to: Temporal.Instant },
  reference: Reference,
): PlannerOccurrenceView[] {
  const loaded = series(store, item);
  return expandOccurrences({
    items: loaded.items,
    stored: store.plannerOccurrences.forItems(loaded.ids),
    window: { ...window, timeZone: reference.zone },
    now: reference.now,
  }).filter((view) => view.status !== 'skipped');
}

function threshold(reference: Reference, item: PlannerItemRow): Temporal.Instant {
  return item.all_day ? reference.today : reference.now;
}

function nextOf(
  store: SearchOccurrenceStore,
  item: PlannerItemRow,
  reference: Reference,
): PlannerOccurrenceView | undefined {
  const from = threshold(reference, item);
  const finish = item.series_end === null ? LATEST : Temporal.Instant.from(item.series_end);
  let days = item.rrule === null ? WHOLE_RANGE_DAYS : FIRST_DAYS;
  for (;;) {
    const reach = from.add({ hours: days * 24 });
    const to = Temporal.Instant.compare(reach, LATEST) > 0 ? LATEST : reach;
    const found = viewsIn(store, item, { from, to }, reference).find(
      (view) => !endedAt(view, reference),
    );
    if (found !== undefined || Temporal.Instant.compare(to, finish) >= 0) return found;
    days *= GROWTH;
  }
}

function lastOf(
  store: SearchOccurrenceStore,
  item: PlannerItemRow,
  reference: Reference,
): PlannerOccurrenceView | undefined {
  const to = threshold(reference, item);
  const began = item.start === null ? EARLIEST : Temporal.Instant.from(item.start);
  let days = item.rrule === null ? WHOLE_RANGE_DAYS : FIRST_DAYS;
  for (;;) {
    const reach = to.subtract({ hours: days * 24 });
    const from = Temporal.Instant.compare(reach, EARLIEST) < 0 ? EARLIEST : reach;
    const found = viewsIn(store, item, { from, to }, reference)
      .filter((view) => endedAt(view, reference))
      .at(-1);
    if (found !== undefined || Temporal.Instant.compare(from, began) <= 0) return found;
    days *= GROWTH;
  }
}

function undatedStatus(item: PlannerItemRow, done: boolean): PlannerOccurrenceView['status'] {
  if (item.status === 'cancelled') return 'cancelled';
  return done ? 'done' : 'open';
}

function undatedView(
  store: SearchOccurrenceStore,
  item: PlannerItemRow,
): PlannerOccurrenceView | undefined {
  if (item.status === 'proposed') return undefined;
  const row = store.plannerOccurrences
    .forItems([item.id])
    .find((each) => each.occurrence_key === PLANNER_OCCURRENCE_SINGLE);
  const done = item.status === 'done' || row?.status === 'done';
  const completion =
    done && row !== undefined
      ? { completed_at: row.completed_at, completed_by: row.completed_by, evidence: row.evidence }
      : { completed_at: null, completed_by: null, evidence: null };
  return {
    item_id: item.id,
    occurrence_key: PLANNER_OCCURRENCE_SINGLE,
    collection_id: item.collection_id,
    kind: item.kind,
    title: item.title,
    location: item.location,
    priority: item.priority,
    all_day: false,
    start: null,
    end: null,
    due_at: null,
    due_date: null,
    status: undatedStatus(item, done),
    recurring: false,
    moved: false,
    ...completion,
    attachments: item.attachments,
    google_state: item.google?.state ?? null,
  };
}

function isUndated(item: PlannerItemRow): boolean {
  return item.start_local === null && item.due_at === null && item.due_date === null;
}

export function occurrenceOf(
  store: SearchOccurrenceStore,
  item: PlannerItemRow,
  reference: Reference,
  when: 'all' | 'upcoming' | 'past',
): Found | undefined {
  if (isUndated(item)) {
    const view = undatedView(store, item);
    if (view === undefined) return undefined;
    const open = view.status === 'open';
    if (open ? when === 'past' : when === 'upcoming') return undefined;
    return { view, reading: open ? 'next' : 'last' };
  }
  const next = when === 'past' ? undefined : nextOf(store, item, reference);
  if (next !== undefined) return { view: next, reading: 'next' };
  if (when === 'upcoming') return undefined;
  const last = lastOf(store, item, reference);
  return last === undefined ? undefined : { view: last, reading: 'last' };
}

export function startKey(view: PlannerOccurrenceView): number {
  const at = view.start ?? view.due_at;
  if (at !== null) return Date.parse(at);
  return view.due_date === null ? 0 : Date.parse(`${view.due_date}T00:00:00Z`);
}

export function stopKey(view: PlannerOccurrenceView): number {
  const stop = stopOf(view);
  return stop === null ? 0 : stop.epochMilliseconds;
}
