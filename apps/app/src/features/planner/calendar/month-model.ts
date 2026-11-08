import {
  appendTo,
  type PlannerCollectionRow,
  type PlannerColourKey,
  type PlannerOccurrenceView,
} from '@smarteverything/domain';
import type { HeatDay } from '../../../components/charts';
import { dateFormat } from '../../../format/locale';
import { joinParts, plural } from '../../../format/text';
import { DAY_MS, MINUTE_MS, clock, localDayKey, zonedStartOfDay } from '../../../format/time';
import { anchorOf } from '../today/river-model';

const WEEK = 7;
const HEAT_LEVELS = 4;
const HIDDEN: ReadonlySet<PlannerOccurrenceView['status']> = new Set(['cancelled', 'proposed']);
const WEEKDAY_NAME = dateFormat({ weekday: 'long', timeZone: 'UTC' });
const MONTH_NAME = dateFormat({ month: 'long', timeZone: 'UTC' });

export interface Window {
  readonly from: string;
  readonly to: string;
}

export type DayMap = ReadonlyMap<string, readonly PlannerOccurrenceView[]>;

export type RowEdge = 'only' | 'first' | 'middle' | 'last';

export interface MonthCell {
  readonly day: string;
  readonly date: number;
  readonly inMonth: boolean;
  readonly today: boolean;
  readonly selected: boolean;
  readonly shown: readonly PlannerOccurrenceView[];
  readonly more: number;
  readonly spoken: string;
}

export interface MonthWeek {
  readonly key: string;
  readonly cells: readonly MonthCell[];
}

export interface AgendaEntry {
  readonly key: string;
  readonly occurrence: PlannerOccurrenceView;
  readonly time: string;
  readonly range: string;
  readonly detail: string;
  readonly calendar: string | null;
  readonly colour: PlannerColourKey | null;
  readonly google: boolean;
  readonly spoken: string;
}

export interface AgendaHead {
  readonly label: string;
  readonly counts: string;
  readonly today: boolean;
}

export type AgendaRow =
  | { readonly kind: 'head'; readonly key: string; readonly head: AgendaHead }
  | {
      readonly kind: 'entry';
      readonly key: string;
      readonly entry: AgendaEntry;
      readonly edge: RowEdge;
    };

export interface HeatMonth {
  readonly month: string;
  readonly name: string;
  readonly days: readonly HeatDay[];
}

export interface YearHeat {
  readonly months: readonly HeatMonth[];
  readonly bookedMinutes: number;
}

function utcOf(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

function keyOfUtc(moment: number): string {
  return new Date(moment).toISOString().slice(0, 10);
}

export function addDays(day: string, by: number): string {
  return keyOfUtc(utcOf(day) + by * DAY_MS);
}

function weekdayOf(day: string): number {
  return (Math.floor(utcOf(day) / DAY_MS) + 3) % WEEK;
}

function daysFrom(first: string, last: string): readonly string[] {
  const length = Math.round((utcOf(last) - utcOf(first)) / DAY_MS) + 1;
  return Array.from({ length: Math.max(0, length) }, (_, index) => addDays(first, index));
}

export function monthOf(day: string): string {
  return day.slice(0, 7);
}

export function shiftMonth(month: string, by: number): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1 + by;
  return keyOfUtc(Date.UTC(year, index, 1)).slice(0, 7);
}

function lastDayOf(month: string): string {
  return addDays(`${shiftMonth(month, 1)}-01`, -1);
}

export function monthBoundsOf(month: string): readonly [string, string] {
  const first = `${month}-01`;
  const last = lastDayOf(month);
  return [addDays(first, -weekdayOf(first)), addDays(last, WEEK - 1 - weekdayOf(last))];
}

export function monthDaysOf(month: string): readonly (readonly string[])[] {
  const days = daysFrom(...monthBoundsOf(month));
  return Array.from({ length: days.length / WEEK }, (_, week) =>
    days.slice(week * WEEK, week * WEEK + WEEK),
  );
}

function windowOf(first: string, end: string, timeZone: string): Window {
  return {
    from: new Date(zonedStartOfDay(first, timeZone)).toISOString(),
    to: new Date(zonedStartOfDay(end, timeZone)).toISOString(),
  };
}

export function monthWindowOf(month: string, timeZone: string): Window {
  const [first, last] = monthBoundsOf(month);
  return windowOf(first, addDays(last, 1), timeZone);
}

export function agendaDaysOf(day: string): readonly [string, string] {
  const month = shiftMonth(monthOf(day), 1);
  const date = Math.min(Number(day.slice(8, 10)), Number(lastDayOf(month).slice(8, 10)));
  return [day, addDays(`${month}-${String(date).padStart(2, '0')}`, -1)];
}

export function agendaWindowOf(day: string, timeZone: string): Window {
  return windowOf(day, addDays(agendaDaysOf(day)[1], 1), timeZone);
}

export function yearWindowOf(year: string, timeZone: string): Window {
  return windowOf(`${year}-01-01`, `${String(Number(year) + 1)}-01-01`, timeZone);
}

function timedSpanOf(
  start: string,
  end: string | null,
  timeZone: string,
): readonly [string, string] {
  const from = Date.parse(start);
  const until = end === null ? from : Math.max(from, Date.parse(end) - 1);
  return [localDayKey(from, timeZone), localDayKey(until, timeZone)];
}

function spanOf(view: PlannerOccurrenceView, timeZone: string): readonly [string, string] | null {
  if (view.all_day && view.start !== null) {
    const first = keyOfUtc(Date.parse(view.start));
    const last = view.end === null ? first : addDays(keyOfUtc(Date.parse(view.end)), -1);
    return [first, last < first ? first : last];
  }
  if (view.start !== null) return timedSpanOf(view.start, view.end, timeZone);
  if (view.due_at !== null) return timedSpanOf(view.due_at, null, timeZone);
  return view.due_date === null ? null : [view.due_date, view.due_date];
}

export function occurrenceDaysOf(
  view: PlannerOccurrenceView,
  timeZone: string,
  within: readonly [string, string],
): readonly string[] {
  const span = spanOf(view, timeZone);
  if (span === null) return [];
  const [first, last] = span;
  return daysFrom(first > within[0] ? first : within[0], last < within[1] ? last : within[1]);
}

function placeOf(view: PlannerOccurrenceView): number {
  if (view.all_day) return 0;
  return anchorOf(view) === null ? 2 : 1;
}

function byDayOrder(left: PlannerOccurrenceView, right: PlannerOccurrenceView): number {
  const place = placeOf(left) - placeOf(right);
  if (place !== 0) return place;
  return (anchorOf(left) ?? 0) - (anchorOf(right) ?? 0);
}

export function dayMapOf(
  occurrences: readonly PlannerOccurrenceView[],
  timeZone: string,
  within: readonly [string, string],
): DayMap {
  const days = new Map<string, PlannerOccurrenceView[]>();
  for (const view of occurrences) {
    if (HIDDEN.has(view.status)) continue;
    for (const day of occurrenceDaysOf(view, timeZone, within)) {
      appendTo(days, day, view);
    }
  }
  for (const list of days.values()) list.sort(byDayOrder);
  return days;
}

function monthNameOf(month: string): string {
  return MONTH_NAME.format(new Date(utcOf(`${month}-01`)));
}

export function dayLabelOf(day: string, withMonth: boolean): string {
  const name = `${WEEKDAY_NAME.format(new Date(utcOf(day)))} ${String(Number(day.slice(8, 10)))}`;
  return withMonth ? `${name} ${monthNameOf(monthOf(day))}` : name;
}

export function countsOf(occurrences: readonly PlannerOccurrenceView[]): string {
  if (occurrences.length === 0) return 'Nothing planned';
  const events = occurrences.filter((view) => view.kind === 'event').length;
  const tasks = occurrences.length - events;
  return joinParts([
    events === 0 ? null : plural(events, 'event'),
    tasks === 0 ? null : plural(tasks, 'task'),
  ]);
}

export interface MonthInput {
  readonly month: string;
  readonly today: string;
  readonly selected: string | null;
  readonly days: DayMap;
  readonly fits: number;
}

function cellOf(day: string, input: MonthInput): MonthCell {
  const all = input.days.get(day) ?? [];
  return {
    day,
    date: Number(day.slice(8, 10)),
    inMonth: monthOf(day) === input.month,
    today: day === input.today,
    selected: day === input.selected,
    shown: all.slice(0, input.fits),
    more: Math.max(0, all.length - input.fits),
    spoken: `${dayLabelOf(day, true)}, ${countsOf(all)}`,
  };
}

export function monthWeeksOf(input: MonthInput): readonly MonthWeek[] {
  return monthDaysOf(input.month).map((week, index) => ({
    key: `${input.month}:${String(index)}`,
    cells: week.map((day) => cellOf(day, input)),
  }));
}

function timesOf(
  view: PlannerOccurrenceView,
  day: string,
  timeZone: string,
): { readonly time: string; readonly until: string | null } {
  if (view.all_day) return { time: 'All day', until: null };
  if (view.start === null) {
    return { time: view.due_at === null ? 'Any time' : clock(view.due_at, timeZone), until: null };
  }
  const [first, last] = timedSpanOf(view.start, view.end, timeZone);
  const until = view.end === null || last !== day ? null : clock(view.end, timeZone);
  if (first === day) return { time: clock(view.start, timeZone), until };
  return until === null
    ? { time: 'All day', until: null }
    : { time: `Until ${until}`, until: null };
}

export function agendaEntryOf(
  view: PlannerOccurrenceView,
  day: string,
  collections: readonly PlannerCollectionRow[],
  timeZone: string,
): AgendaEntry {
  const collection = collections.find((row) => row.id === view.collection_id);
  const { time, until } = timesOf(view, day, timeZone);
  const calendar = collection?.name ?? null;
  const detail = joinParts([
    calendar,
    view.kind === 'task' ? 'task' : null,
    until === null ? null : `until ${until}`,
    view.location,
  ]);
  const google = view.google_state !== null;
  return {
    key: `${view.item_id}:${view.occurrence_key}`,
    occurrence: view,
    time,
    range: until === null ? time : `${time} to ${until}`,
    detail,
    calendar,
    colour: collection?.colour ?? null,
    google,
    spoken: joinParts([time, view.title, detail, google ? 'from Google' : null]),
  };
}

function edgeOf(index: number, length: number): RowEdge {
  if (length === 1) return 'only';
  if (index === 0) return 'first';
  return index === length - 1 ? 'last' : 'middle';
}

export function matchesQuery(entry: AgendaEntry, query: string): boolean {
  const wanted = query.trim().toLowerCase();
  if (wanted === '') return true;
  return [entry.occurrence.title, entry.occurrence.location, entry.calendar].some(
    (part) => part?.toLowerCase().includes(wanted) === true,
  );
}

export interface AgendaInput {
  readonly days: DayMap;
  readonly window: readonly [string, string];
  readonly today: string;
  readonly collections: readonly PlannerCollectionRow[];
  readonly timeZone: string;
  readonly query: string;
}

function headOf(day: string, input: AgendaInput, entries: readonly AgendaEntry[]): AgendaHead {
  const today = day === input.today;
  const label = dayLabelOf(day, monthOf(day) !== monthOf(input.window[0]));
  return {
    label: today ? `Today, ${label}` : label,
    counts: countsOf(entries.map((entry) => entry.occurrence)),
    today,
  };
}

export function agendaRowsOf(input: AgendaInput): readonly AgendaRow[] {
  return daysFrom(input.window[0], input.window[1]).flatMap((day): AgendaRow[] => {
    const entries = (input.days.get(day) ?? [])
      .map((view) => agendaEntryOf(view, day, input.collections, input.timeZone))
      .filter((entry) => matchesQuery(entry, input.query));
    if (entries.length === 0) return [];
    return [
      { kind: 'head', key: `head:${day}`, head: headOf(day, input, entries) },
      ...entries.map((entry, index) => ({
        kind: 'entry' as const,
        key: `entry:${day}:${entry.key}`,
        entry,
        edge: edgeOf(index, entries.length),
      })),
    ];
  });
}

function bookedSpans(
  view: PlannerOccurrenceView,
  timeZone: string,
): readonly (readonly [string, number])[] {
  if (view.kind !== 'event' || view.all_day || view.start === null || view.end === null) return [];
  const start = Date.parse(view.start);
  const end = Date.parse(view.end);
  return daysFrom(...timedSpanOf(view.start, view.end, timeZone)).map((day) => {
    const from = Math.max(start, zonedStartOfDay(day, timeZone));
    const to = Math.min(end, zonedStartOfDay(addDays(day, 1), timeZone));
    return [day, Math.max(0, to - from) / MINUTE_MS] as const;
  });
}

export function bookedByDayOf(
  occurrences: readonly PlannerOccurrenceView[],
  timeZone: string,
): ReadonlyMap<string, number> {
  const minutes = new Map<string, number>();
  for (const view of occurrences) {
    if (HIDDEN.has(view.status)) continue;
    for (const [day, span] of bookedSpans(view, timeZone)) {
      minutes.set(day, (minutes.get(day) ?? 0) + span);
    }
  }
  return minutes;
}

function levelOf(value: number, peak: number): number {
  if (value <= 0 || peak === 0) return 0;
  return Math.max(1, Math.min(HEAT_LEVELS, Math.ceil((value / peak) * HEAT_LEVELS)));
}

function heatDayOf(day: string, minutes: number, peak: number): HeatDay {
  return { day, pages: Math.round(minutes / 6) / 10, level: levelOf(minutes, peak), covered: true };
}

export function yearHeatOf(
  year: string,
  occurrences: readonly PlannerOccurrenceView[],
  timeZone: string,
): YearHeat {
  const booked = bookedByDayOf(occurrences, timeZone);
  const inYear = [...booked].filter(([day]) => day.startsWith(`${year}-`));
  const peak = inYear.reduce((top, [, minutes]) => Math.max(top, minutes), 0);
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`;
    return {
      month,
      name: monthNameOf(month),
      days: daysFrom(`${month}-01`, lastDayOf(month)).map((day) =>
        heatDayOf(day, booked.get(day) ?? 0, peak),
      ),
    };
  });
  return { months, bookedMinutes: inYear.reduce((sum, [, minutes]) => sum + minutes, 0) };
}
