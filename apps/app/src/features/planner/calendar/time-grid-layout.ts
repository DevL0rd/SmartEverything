import {
  minuteOfClock,
  type PlannerAlarmRow,
  type PlannerCollectionRow,
  type PlannerColourKey,
  type PlannerOccurrenceView,
  type PlannerPreferences,
} from '@smarteverything/domain';
import { zonedDateFormat } from '../../../format/locale';
import { compareText } from '../../../format/text';
import {
  HOUR_MS,
  clock,
  clockOfMinutes,
  dayBoundsOf,
  localDayKey,
  shiftDay,
  startOfDayKey,
  weekdayShort,
  zonedInstant,
} from '../../../format/time';

export const DAY_MINUTES = 1440;

export const HOUR_HEIGHT = { touch: 52, pointer: 44 } as const;

export const MIN_BLOCK_HEIGHT = 22;

const WALL_FORMAT = zonedDateFormat(
  { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
  'en-GB',
);

const DAY_NUMBER = zonedDateFormat({ day: 'numeric' });

export type WorkingHours = PlannerPreferences['general']['working_hours'];

export interface GridSpan {
  readonly key: string;
  readonly occurrence: PlannerOccurrenceView;
  readonly from: number;
  readonly to: number;
}

export interface GridBlock extends GridSpan {
  readonly lane: number;
  readonly lanes: number;
  readonly width: number;
  readonly colour: PlannerColourKey | null;
  readonly time: string;
  readonly proposed: boolean;
  readonly readOnly: boolean;
}

export interface AllDayEntry {
  readonly key: string;
  readonly occurrence: PlannerOccurrenceView;
  readonly colour: PlannerColourKey | null;
  readonly readOnly: boolean;
}

export interface GridDay {
  readonly date: string;
  readonly weekday: string;
  readonly number: string;
  readonly today: boolean;
  readonly working: { readonly from: number; readonly to: number } | null;
  readonly blocks: readonly GridBlock[];
  readonly allDay: readonly AllDayEntry[];
}

export interface AlarmPin {
  readonly key: string;
  readonly alarmId: string;
  readonly date: string;
  readonly minute: number;
  readonly time: string;
  readonly label: string | null;
}

export interface GridInput {
  readonly days: readonly string[];
  readonly timeZone: string;
  readonly today: string;
  readonly occurrences: readonly PlannerOccurrenceView[];
  readonly collections: readonly PlannerCollectionRow[];
  readonly workingHours: WorkingHours | null;
  readonly readOnlyOf: (occurrence: PlannerOccurrenceView) => boolean;
  readonly minMinutes: number;
}

export function wallMinuteOf(at: number, timeZone: string): number {
  const parts = WALL_FORMAT(timeZone).formatToParts(new Date(at));
  const field = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((entry) => entry.type === type);
    if (part === undefined) throw new Error(`The time zone formatter returned no ${type}`);
    return Number(part.value);
  };
  return (field('hour') % 24) * 60 + field('minute');
}

export function keyOf(occurrence: PlannerOccurrenceView): string {
  return `${occurrence.item_id}:${occurrence.occurrence_key}`;
}

function startOf(occurrence: PlannerOccurrenceView): string | null {
  return occurrence.start ?? occurrence.due_at;
}

function shown(occurrence: PlannerOccurrenceView): boolean {
  return occurrence.status !== 'cancelled';
}

function spanOn(
  occurrence: PlannerOccurrenceView,
  bounds: { readonly start: number; readonly end: number },
  timeZone: string,
): GridSpan | null {
  const begin = startOf(occurrence);
  if (begin === null || occurrence.all_day || !shown(occurrence)) return null;
  const at = Date.parse(begin);
  const until = occurrence.end === null ? at : Math.max(at, Date.parse(occurrence.end));
  const touches = until === at ? at >= bounds.start : until > bounds.start;
  if (at >= bounds.end || !touches) return null;
  const from = at <= bounds.start ? 0 : wallMinuteOf(at, timeZone);
  const to = until >= bounds.end ? DAY_MINUTES : Math.max(from, wallMinuteOf(until, timeZone));
  return { key: keyOf(occurrence), occurrence, from, to };
}

export function timedSpansOn(
  occurrences: readonly PlannerOccurrenceView[],
  date: string,
  timeZone: string,
): readonly GridSpan[] {
  const bounds = dayBoundsOf(date, timeZone);
  return occurrences.flatMap((occurrence) => {
    const span = spanOn(occurrence, bounds, timeZone);
    return span === null ? [] : [span];
  });
}

function bySpan(left: GridSpan, right: GridSpan): number {
  return left.from - right.from || right.to - left.to || compareText(left.key, right.key);
}

interface Laned {
  readonly span: GridSpan;
  readonly end: number;
  readonly lane: number;
}

function clustersOf(spans: readonly GridSpan[], minMinutes: number): readonly Laned[][] {
  const clusters: Laned[][] = [];
  let reach = -Infinity;
  for (const span of [...spans].sort(bySpan)) {
    const end = Math.max(span.to, span.from + minMinutes);
    const current = clusters.at(-1);
    if (current === undefined || span.from >= reach) {
      clusters.push([{ span, end, lane: 0 }]);
    } else {
      current.push({ span, end, lane: laneFor(current, span.from) });
    }
    reach = span.from >= reach ? end : Math.max(reach, end);
  }
  return clusters;
}

function laneFor(cluster: readonly Laned[], from: number): number {
  const ends = new Map<number, number>();
  for (const placed of cluster) {
    ends.set(placed.lane, Math.max(ends.get(placed.lane) ?? -Infinity, placed.end));
  }
  for (let lane = 0; lane <= ends.size; lane += 1) {
    if ((ends.get(lane) ?? -Infinity) <= from) return lane;
  }
  return ends.size;
}

function overlaps(left: Laned, right: Laned): boolean {
  return left.span.from < right.end && right.span.from < left.end;
}

function widthOf(placed: Laned, cluster: readonly Laned[], lanes: number): number {
  let width = 1;
  for (let lane = placed.lane + 1; lane < lanes; lane += 1) {
    const blocked = cluster.some((other) => other.lane === lane && overlaps(placed, other));
    if (blocked) break;
    width += 1;
  }
  return width;
}

export interface LanedSpan extends GridSpan {
  readonly lane: number;
  readonly lanes: number;
  readonly width: number;
}

export function laneSpans(spans: readonly GridSpan[], minMinutes: number): readonly LanedSpan[] {
  return clustersOf(spans, minMinutes).flatMap((cluster) => {
    const lanes = Math.max(...cluster.map((placed) => placed.lane)) + 1;
    return cluster.map((placed) => ({
      ...placed.span,
      lane: placed.lane,
      lanes,
      width: widthOf(placed, cluster, lanes),
    }));
  });
}

export function blockTimeOf(occurrence: PlannerOccurrenceView, timeZone: string): string {
  const begin = startOf(occurrence);
  if (begin === null) return '';
  const from = clock(begin, timeZone);
  return occurrence.end === null || occurrence.end === begin
    ? from
    : `${from} to ${clock(occurrence.end, timeZone)}`;
}

function coloursOf(
  collections: readonly PlannerCollectionRow[],
): ReadonlyMap<string, PlannerColourKey> {
  return new Map(collections.map((row) => [row.id, row.colour] as const));
}

function lastDayOf(occurrence: PlannerOccurrenceView, first: string, timeZone: string): string {
  if (occurrence.end === null) return first;
  const last = localDayKey(Date.parse(occurrence.end) - 1, timeZone);
  return last < first ? first : last;
}

export function allDayOn(
  occurrence: PlannerOccurrenceView,
  date: string,
  timeZone: string,
): boolean {
  if (!occurrence.all_day || !shown(occurrence)) return false;
  const begin = startOf(occurrence);
  const first = begin === null ? occurrence.due_date : localDayKey(begin, timeZone);
  if (first === null) return false;
  return date >= first && date <= lastDayOf(occurrence, first, timeZone);
}

export function workingWindowOn(
  date: string,
  hours: WorkingHours | null,
): { readonly from: number; readonly to: number } | null {
  if (hours === null) return null;
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const from = minuteOfClock(hours.start);
  const to = minuteOfClock(hours.end);
  return hours.days.includes(weekday) && to > from ? { from, to } : null;
}

function gridDayOf(input: GridInput, date: string): GridDay {
  const colours = coloursOf(input.collections);
  const colourOf = (occurrence: PlannerOccurrenceView): PlannerColourKey | null =>
    colours.get(occurrence.collection_id) ?? null;
  const spans = laneSpans(timedSpansOn(input.occurrences, date, input.timeZone), input.minMinutes);
  const noon = startOfDayKey(date) + 12 * HOUR_MS;
  return {
    date,
    weekday: weekdayShort(noon),
    number: DAY_NUMBER(null).format(new Date(noon)),
    today: date === input.today,
    working: workingWindowOn(date, input.workingHours),
    blocks: spans.map((span) => ({
      ...span,
      colour: colourOf(span.occurrence),
      time: blockTimeOf(span.occurrence, input.timeZone),
      proposed: span.occurrence.status === 'proposed',
      readOnly: input.readOnlyOf(span.occurrence),
    })),
    allDay: input.occurrences
      .filter((occurrence) => allDayOn(occurrence, date, input.timeZone))
      .map((occurrence) => ({
        key: keyOf(occurrence),
        occurrence,
        colour: colourOf(occurrence),
        readOnly: input.readOnlyOf(occurrence),
      })),
  };
}

export function gridDaysOf(input: GridInput): readonly GridDay[] {
  return input.days.map((date) => gridDayOf(input, date));
}

export function daysFrom(first: string, count: number): readonly string[] {
  return Array.from({ length: count }, (_, index) => shiftDay(first, index));
}

type AlarmTiming = Pick<PlannerAlarmRow, 'time' | 'days' | 'once_on' | 'skip_on' | 'enabled'>;

function weekdayOfKey(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function nextLooseDate(alarm: AlarmTiming, now: number, timeZone: string): string {
  const today = localDayKey(now, timeZone);
  const passed = zonedInstant(today, minuteOfClock(alarm.time), timeZone) <= now;
  const first = passed ? shiftDay(today, 1) : today;
  return first === alarm.skip_on ? shiftDay(first, 1) : first;
}

export function alarmRingsOn(
  alarm: AlarmTiming,
  date: string,
  now: number,
  timeZone: string,
): boolean {
  if (!alarm.enabled || date === alarm.skip_on) return false;
  if (alarm.once_on !== null) return alarm.once_on === date;
  if (alarm.days.length > 0) return alarm.days.includes(weekdayOfKey(date));
  return nextLooseDate(alarm, now, timeZone) === date;
}

export function alarmPinsOf(
  alarms: readonly PlannerAlarmRow[],
  days: readonly string[],
  now: number,
  timeZone: string,
): readonly AlarmPin[] {
  return days.flatMap((date) =>
    alarms
      .filter((alarm) => alarmRingsOn(alarm, date, now, timeZone))
      .map((alarm) => ({
        key: `${alarm.id}:${date}`,
        alarmId: alarm.id,
        date,
        minute: minuteOfClock(alarm.time),
        time: clockOfMinutes(minuteOfClock(alarm.time)),
        label: alarm.label,
      }))
      .sort((left, right) => left.minute - right.minute || compareText(left.key, right.key)),
  );
}

export function samePins(left: readonly AlarmPin[], right: readonly AlarmPin[]): boolean {
  return (
    left.length === right.length &&
    left.every((pin, index) => {
      const other = right[index];
      return other?.key === pin.key && other.minute === pin.minute && other.label === pin.label;
    })
  );
}

export interface NowPlace {
  readonly index: number;
  readonly minute: number;
}

export function nowPlaceOf(
  days: readonly string[],
  now: number,
  timeZone: string,
): NowPlace | null {
  const index = days.indexOf(localDayKey(now, timeZone));
  return index < 0 ? null : { index, minute: wallMinuteOf(now, timeZone) };
}

export function sameNow(left: NowPlace | null, right: NowPlace | null): boolean {
  return left?.index === right?.index && left?.minute === right?.minute;
}

export function yOf(minute: number, hourHeight: number): number {
  return (minute / 60) * hourHeight;
}

export function topStyle(top: number): { readonly top: number } {
  return { top };
}

export function bandStyle(
  from: number,
  to: number,
  hourHeight: number,
): { readonly top: number; readonly height: number } {
  const top = yOf(from, hourHeight);
  return { top, height: yOf(to, hourHeight) - top };
}

export function minMinutesFor(hourHeight: number): number {
  return (MIN_BLOCK_HEIGHT / hourHeight) * 60;
}
