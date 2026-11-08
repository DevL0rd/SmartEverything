import {
  PLANNER_OCCURRENCE_SINGLE,
  type PlannerItemRow,
  type PlannerOccurrenceRow,
  type PlannerOccurrenceView,
  type PlannerOccurrenceViewStatus,
} from '@smarteverything/domain';
import {
  baseTiming,
  instantOf,
  isoOf,
  lengthMs,
  movedTiming,
  overdue,
  shiftedTiming,
  spanDays,
  type OccurrenceTiming,
} from './instants';
import { occurrencesBetween, type RecurrenceSeries } from './recurrence';

export interface ExpandWindow {
  readonly from: Temporal.Instant;
  readonly to: Temporal.Instant;
  readonly timeZone: string;
}

export interface ExpandInput {
  readonly items: readonly PlannerItemRow[];
  readonly stored: readonly PlannerOccurrenceRow[];
  readonly window: ExpandWindow;
  readonly now: Temporal.Instant;
}

interface Slot {
  readonly item: PlannerItemRow;
  readonly key: string;
  readonly timing: OccurrenceTiming;
  readonly row: PlannerOccurrenceRow | undefined;
  readonly moved: boolean;
}

interface Context {
  readonly window: ExpandWindow;
  readonly fromDate: Temporal.PlainDate;
  readonly toDate: Temporal.PlainDate;
  readonly rows: ReadonlyMap<string, PlannerOccurrenceRow>;
  readonly rowsOf: ReadonlyMap<string, readonly PlannerOccurrenceRow[]>;
  readonly replaced: ReadonlySet<string>;
}

const DAY_MS = 86_400_000;

function wholeSeconds(value: string): string {
  return value.length === 16 ? `${value}:00` : value;
}

function rowKey(itemId: string, key: string): string {
  return `${itemId}|${key}`;
}

function windowContext(input: ExpandInput): Context {
  const { window } = input;
  const from = window.from.toZonedDateTimeISO(window.timeZone);
  const to = window.to.toZonedDateTimeISO(window.timeZone);
  const midnight = Temporal.PlainTime.from('00:00');
  const toDate =
    Temporal.PlainTime.compare(to.toPlainTime(), midnight) === 0
      ? to.toPlainDate()
      : to.toPlainDate().add({ days: 1 });
  const rows = new Map<string, PlannerOccurrenceRow>();
  const rowsOf = new Map<string, PlannerOccurrenceRow[]>();
  for (const row of input.stored) {
    rows.set(rowKey(row.item_id, row.occurrence_key), row);
    const siblings = rowsOf.get(row.item_id) ?? [];
    siblings.push(row);
    rowsOf.set(row.item_id, siblings);
  }
  const replaced = new Set<string>();
  for (const item of input.items) {
    if (item.series_id !== null && item.original_start !== null) {
      replaced.add(rowKey(item.series_id, wholeSeconds(item.original_start)));
    }
  }
  return { window, fromDate: from.toPlainDate(), toDate, rows, rowsOf, replaced };
}

function isMoved(row: PlannerOccurrenceRow | undefined): boolean {
  return row !== undefined && row.moved_start !== null;
}

function overlaps(timing: OccurrenceTiming, window: ExpandWindow): boolean {
  const { start, end } = timing;
  if (start === null) return false;
  const pointInTime = end === null || Temporal.Instant.compare(end, start) === 0;
  if (pointInTime) {
    return (
      Temporal.Instant.compare(start, window.from) >= 0 &&
      Temporal.Instant.compare(start, window.to) < 0
    );
  }
  return (
    Temporal.Instant.compare(start, window.to) < 0 && Temporal.Instant.compare(end, window.from) > 0
  );
}

function dateInside(timing: OccurrenceTiming, context: Context): boolean {
  if (timing.firstDate === null || timing.lastDate === null) return false;
  return (
    Temporal.PlainDate.compare(timing.firstDate, context.toDate) < 0 &&
    Temporal.PlainDate.compare(timing.lastDate, context.fromDate) >= 0
  );
}

function duePoint(timing: OccurrenceTiming, window: ExpandWindow): boolean {
  return (
    timing.due !== null &&
    Temporal.Instant.compare(timing.due, window.from) >= 0 &&
    Temporal.Instant.compare(timing.due, window.to) < 0
  );
}

function inWindow(timing: OccurrenceTiming, context: Context): boolean {
  if (timing.allDay) return dateInside(timing, context);
  return timing.start === null
    ? duePoint(timing, context.window)
    : overlaps(timing, context.window);
}

function singleSlot(item: PlannerItemRow, context: Context): readonly Slot[] {
  const base = baseTiming(item);
  if (base === null) return [];
  const row = context.rows.get(rowKey(item.id, PLANNER_OCCURRENCE_SINGLE));
  const timing = movedTiming(item, base, row);
  if (!inWindow(timing, context)) return [];
  const shifted = isMoved(row);
  const overridden =
    item.original_start !== null &&
    item.start_local !== null &&
    wholeSeconds(item.original_start) !== wholeSeconds(item.start_local);
  return [{ item, key: PLANNER_OCCURRENCE_SINGLE, timing, row, moved: shifted || overridden }];
}

function seriesOf(item: PlannerItemRow, start: string, rrule: string): RecurrenceSeries {
  return { start, timeZone: item.time_zone, rrule, exdates: item.exdates };
}

function keyOf(item: PlannerItemRow, local: string, instant: Temporal.Instant): string {
  return item.all_day ? local : isoOf(instant);
}

function excluded(item: PlannerItemRow, local: string): boolean {
  return item.exdates.some((value) => wholeSeconds(value) === wholeSeconds(local));
}

function expansionWindow(
  master: OccurrenceTiming,
  context: Context,
): { from: Temporal.Instant; to: Temporal.Instant } {
  const pad = master.allDay ? (spanDays(master) + 1) * DAY_MS : (lengthMs(master) ?? 0);
  const { from, to } = context.window;
  return {
    from: from.subtract({ milliseconds: pad + (master.allDay ? DAY_MS : 0) }),
    to: master.allDay ? to.add({ milliseconds: DAY_MS }) : to,
  };
}

function originalSlots(
  item: PlannerItemRow,
  master: OccurrenceTiming,
  context: Context,
): readonly Slot[] {
  if (item.start_local === null || item.rrule === null) return [];
  const span = expansionWindow(master, context);
  const slots: Slot[] = [];
  for (const occurrence of occurrencesBetween(
    seriesOf(item, item.start_local, item.rrule),
    span.from,
    span.to,
  )) {
    if (context.replaced.has(rowKey(item.id, wholeSeconds(occurrence.local)))) continue;
    const start = occurrence.instant ?? instantOf(occurrence.local, null);
    const key = keyOf(item, occurrence.local, start);
    const row = context.rows.get(rowKey(item.id, key));
    const timing = movedTiming(item, shiftedTiming(item, master, start), row);
    if (inWindow(timing, context)) slots.push({ item, key, timing, row, moved: isMoved(row) });
  }
  return slots;
}

function originalLocal(item: PlannerItemRow, key: string): string {
  if (item.all_day) return key;
  return Temporal.Instant.from(key)
    .toZonedDateTimeISO(item.time_zone ?? 'UTC')
    .toPlainDateTime()
    .toString({ smallestUnit: 'second' });
}

function movedInSlots(
  item: PlannerItemRow,
  master: OccurrenceTiming,
  context: Context,
  produced: ReadonlySet<string>,
): readonly Slot[] {
  const slots: Slot[] = [];
  for (const row of context.rowsOf.get(item.id) ?? []) {
    const stays = row.moved_start === null || row.occurrence_key === PLANNER_OCCURRENCE_SINGLE;
    if (stays || produced.has(row.occurrence_key)) continue;
    if (excluded(item, originalLocal(item, row.occurrence_key))) continue;
    const start = item.all_day
      ? instantOf(row.occurrence_key, null)
      : Temporal.Instant.from(row.occurrence_key);
    const timing = movedTiming(item, shiftedTiming(item, master, start), row);
    if (inWindow(timing, context))
      slots.push({ item, key: row.occurrence_key, timing, row, moved: true });
  }
  return slots;
}

function recurringSlots(item: PlannerItemRow, context: Context): readonly Slot[] {
  const master = baseTiming(item);
  if (master === null) return [];
  const originals = originalSlots(item, master, context);
  const produced = new Set(originals.map((slot) => slot.key));
  return [...originals, ...movedInSlots(item, master, context, produced)];
}

function slotsOf(item: PlannerItemRow, context: Context): readonly Slot[] {
  return item.rrule === null ? singleSlot(item, context) : recurringSlots(item, context);
}

function rowStatus(row: PlannerOccurrenceRow | undefined): PlannerOccurrenceViewStatus | null {
  if (row?.status === 'done' || row?.status === 'skipped') return row.status;
  return row?.status === 'missed' && row.moved_start === null ? 'missed' : null;
}

function settledStatus(slot: Slot): PlannerOccurrenceViewStatus | null {
  const { item, row } = slot;
  if (item.status === 'cancelled' || item.status === 'proposed') return item.status;
  const stored = rowStatus(row);
  if (stored !== null) return stored;
  return item.rrule === null && item.status === 'done' ? 'done' : null;
}

function statusOf(slot: Slot, zone: string, now: Temporal.Instant): PlannerOccurrenceViewStatus {
  const settled = settledStatus(slot);
  if (settled !== null) return settled;
  return overdue(slot.timing, zone, now) ? 'missed' : 'open';
}

function isoOrNull(instant: Temporal.Instant | null): string | null {
  return instant === null ? null : isoOf(instant);
}

function timingFields(
  timing: OccurrenceTiming,
): Pick<PlannerOccurrenceView, 'all_day' | 'start' | 'end' | 'due_at' | 'due_date'> {
  return {
    all_day: timing.allDay,
    start: isoOrNull(timing.start),
    end: isoOrNull(timing.end),
    due_at: isoOrNull(timing.due),
    due_date: timing.dueDate === null ? null : timing.dueDate.toString(),
  };
}

function completionFields(
  row: PlannerOccurrenceRow | undefined,
  done: boolean,
): Pick<PlannerOccurrenceView, 'completed_at' | 'completed_by' | 'evidence'> {
  if (!done || row === undefined) return { completed_at: null, completed_by: null, evidence: null };
  return {
    completed_at: row.completed_at,
    completed_by: row.completed_by,
    evidence: row.evidence,
  };
}

function viewOf(slot: Slot, zone: string, now: Temporal.Instant): PlannerOccurrenceView {
  const { item } = slot;
  const status = statusOf(slot, zone, now);
  return {
    item_id: item.id,
    occurrence_key: slot.key,
    collection_id: item.collection_id,
    kind: item.kind,
    title: item.title,
    location: item.location,
    priority: item.priority,
    ...timingFields(slot.timing),
    status,
    recurring: item.rrule !== null || item.series_id !== null,
    moved: slot.moved,
    ...completionFields(slot.row, status === 'done'),
    attachments: item.attachments,
    google_state: item.google === null ? null : item.google.state,
  };
}

function sortKey(slot: Slot, zone: string): number {
  const { timing } = slot;
  if (timing.firstDate !== null) {
    return timing.firstDate.toZonedDateTime(zone).epochMilliseconds;
  }
  return (timing.start ?? timing.due)?.epochMilliseconds ?? 0;
}

export function expandOccurrences(input: ExpandInput): readonly PlannerOccurrenceView[] {
  const context = windowContext(input);
  const zone = input.window.timeZone;
  const slots = input.items.flatMap((item) => slotsOf(item, context));
  return slots
    .map((slot) => ({ slot, at: sortKey(slot, zone) }))
    .sort(
      (a, b) =>
        a.at - b.at ||
        Number(b.slot.timing.allDay) - Number(a.slot.timing.allDay) ||
        a.slot.item.position - b.slot.item.position ||
        a.slot.item.id.localeCompare(b.slot.item.id) ||
        a.slot.key.localeCompare(b.slot.key),
    )
    .map(({ slot }) => viewOf(slot, zone, input.now));
}
