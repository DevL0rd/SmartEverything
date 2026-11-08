import {
  ApiError,
  PLANNER_ITEM_CREATE,
  parsePlannerRrule,
  type PlannerItemCreate,
  type ResponseOf,
} from '@smarteverything/domain';
import { RRuleTemporal } from 'rrule-temporal';
import {
  WEEK_ORDER,
  cleanTitle,
  extractDate,
  extractMarkers,
  extractRepeat,
  extractTimes,
  type ClockTime,
  type DateToken,
  type RepeatToken,
  type RruleWeekday,
} from './parse-tokens';

export type PlannerParseResult = ResponseOf<'parsePlannerText'>;

export interface ParseCollection {
  readonly id: string;
  readonly name: string;
}

export interface ParseInput {
  readonly text: string;
  readonly collectionId: string;
  readonly collections: readonly ParseCollection[];
  readonly timeZone: string;
  readonly now: Date;
  readonly previewCount: number;
}

interface Schedule {
  readonly date: Temporal.PlainDate;
  readonly times: readonly ClockTime[];
  readonly range: boolean;
}

type Timing = Pick<
  PlannerItemCreate,
  'kind' | 'start_local' | 'end_local' | 'time_zone' | 'all_day' | 'due_date' | 'due_at' | 'rrule'
>;

const UNDATED: Timing = {
  kind: 'task',
  start_local: null,
  end_local: null,
  time_zone: null,
  all_day: false,
  due_date: null,
  due_at: null,
  rrule: null,
};

const FREQUENCY_UNITS = {
  DAILY: 'day',
  WEEKLY: 'week',
  MONTHLY: 'month',
  YEARLY: 'year',
} as const;

const DAY_LABELS: Readonly<Record<RruleWeekday, string>> = {
  MO: 'Mon',
  TU: 'Tue',
  WE: 'Wed',
  TH: 'Thu',
  FR: 'Fri',
  SA: 'Sat',
  SU: 'Sun',
};

const pad = (value: number): string => String(value).padStart(2, '0');

const clockText = (time: ClockTime): string => `${pad(time.hour)}:${pad(time.minute)}`;

const localOf = (date: Temporal.PlainDate, time: ClockTime): string =>
  `${date.toString()}T${clockText(time)}:00`;

function plainDateOf(token: DateToken): Temporal.PlainDate {
  return Temporal.PlainDate.from({ year: token.year, month: token.month, day: token.day });
}

function zonedNow(now: Date, timeZone: string): Temporal.ZonedDateTime {
  return Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO(timeZone);
}

function instantOf(local: string, timeZone: string): string {
  const instant = Temporal.PlainDateTime.from(local)
    .toZonedDateTime(timeZone, { disambiguation: 'compatible' })
    .toInstant();
  return new Date(instant.epochMilliseconds).toISOString();
}

function weekdayOf(date: Temporal.PlainDate): RruleWeekday {
  return WEEK_ORDER[date.dayOfWeek - 1] ?? 'MO';
}

function alignedTo(date: Temporal.PlainDate, days: readonly RruleWeekday[]): Temporal.PlainDate {
  if (days.length === 0) return date;
  let cursor = date;
  while (!days.includes(weekdayOf(cursor))) cursor = cursor.add({ days: 1 });
  return cursor;
}

function anchorDate(
  dated: DateToken | null,
  first: ClockTime | undefined,
  repeat: RepeatToken | null,
  now: Temporal.ZonedDateTime,
): Temporal.PlainDate | null {
  if (dated !== null) return plainDateOf(dated);
  if (repeat === null && first === undefined) return null;
  const today = now.toPlainDate();
  const passed = repeat === null && first !== undefined && minutesOfDay(first) <= minutesOfDay(now);
  return passed ? today.add({ days: 1 }) : today;
}

function minutesOfDay(time: ClockTime | Temporal.ZonedDateTime): number {
  return time.hour * 60 + time.minute;
}

function endDateOf(schedule: Schedule): Temporal.PlainDate {
  const [start, end] = schedule.times;
  const crosses =
    start !== undefined && end !== undefined && minutesOfDay(end) < minutesOfDay(start);
  return crosses ? schedule.date.add({ days: 1 }) : schedule.date;
}

function datedTiming(schedule: Schedule, timeZone: string): Timing {
  const [start, end] = schedule.times;
  if (start === undefined) return { ...UNDATED, due_date: schedule.date.toString() };
  if (schedule.range && end !== undefined) {
    return {
      ...UNDATED,
      kind: 'event',
      start_local: localOf(schedule.date, start),
      end_local: localOf(endDateOf(schedule), end),
      time_zone: timeZone,
    };
  }
  const local = localOf(schedule.date, start);
  return {
    ...UNDATED,
    due_date: schedule.date.toString(),
    due_at: instantOf(local, timeZone),
  };
}

function repeatingTiming(schedule: Schedule, timeZone: string, rrule: string): Timing {
  const [start, end] = schedule.times;
  if (start === undefined) {
    return { ...UNDATED, start_local: schedule.date.toString(), all_day: true, rrule };
  }
  const event = schedule.range && end !== undefined;
  return {
    ...UNDATED,
    kind: event ? 'event' : 'task',
    start_local: localOf(schedule.date, start),
    end_local: event ? localOf(endDateOf(schedule), end) : null,
    time_zone: timeZone,
    rrule,
  };
}

function rejection(message: string): ApiError {
  return new ApiError('invalid_request', message);
}

function positionsOf(times: readonly ClockTime[]): {
  readonly hours: readonly number[];
  readonly minutes: readonly number[];
  readonly positions: readonly number[];
} {
  const hours = [...new Set(times.map((time) => time.hour))].sort((a, b) => a - b);
  const minutes = [...new Set(times.map((time) => time.minute))].sort((a, b) => a - b);
  const grid = hours.flatMap((hour) => minutes.map((minute) => hour * 60 + minute));
  const positions = times.map((time) => grid.indexOf(minutesOfDay(time)) + 1);
  return { hours, minutes, positions: grid.length === times.length ? [] : positions };
}

function timeParts(repeat: RepeatToken, times: readonly ClockTime[]): readonly string[] {
  if (times.length < 2) return [];
  const { hours, minutes, positions } = positionsOf(times);
  if (positions.length > 0 && repeat.freq !== 'DAILY') {
    throw rejection(
      'Several times on different minutes work only with a daily repeat; add them as separate items.',
    );
  }
  return [
    `BYHOUR=${hours.join(',')}`,
    `BYMINUTE=${minutes.join(',')}`,
    ...(positions.length > 0 ? [`BYSETPOS=${positions.join(',')}`] : []),
  ];
}

function rruleOf(repeat: RepeatToken, times: readonly ClockTime[]): string {
  const parts = [
    `FREQ=${repeat.freq}`,
    ...(repeat.interval > 1 ? [`INTERVAL=${String(repeat.interval)}`] : []),
    ...(repeat.days.length > 0 ? [`BYDAY=${repeat.days.join(',')}`] : []),
    ...timeParts(repeat, times),
  ];
  const text = parts.join(';');
  const checked = parsePlannerRrule(text);
  if (!checked.success) throw rejection(`That repeat is not valid: ${checked.message}.`);
  return text;
}

function repeatText(
  repeat: RepeatToken,
  clocks: { readonly times: readonly ClockTime[]; readonly range: boolean },
): string {
  const { times, range } = clocks;
  const unit = FREQUENCY_UNITS[repeat.freq];
  const days = repeat.days;
  const every = repeat.interval > 1 ? `Every ${String(repeat.interval)} ${unit}s` : `Every ${unit}`;
  const weekdays = days.join(',') === 'MO,TU,WE,TH,FR';
  const weekend = days.join(',') === 'SA,SU';
  let head = every;
  if (weekdays) head = 'Every weekday';
  else if (weekend) head = 'Every weekend';
  else if (days.length > 0) head = `${every} on ${days.map((day) => DAY_LABELS[day]).join(', ')}`;
  if (times.length === 0) return head;
  const spoken = times.map(clockText).join(range ? ' to ' : ' and ');
  return `${head} ${range ? 'from' : 'at'} ${spoken}`;
}

function occurrenceInstants(timing: Timing, previewCount: number, now: Date): string[] {
  const { start_local: start, rrule, time_zone: zone } = timing;
  if (rrule === null || start === null) return [];
  const dtstart =
    zone === null
      ? `DTSTART;VALUE=DATE:${start.replaceAll('-', '')}`
      : `DTSTART;TZID=${zone}:${start.replaceAll('-', '').replaceAll(':', '')}`;
  const rule = new RRuleTemporal({ rruleString: `${dtstart}\nRRULE:${rrule}` });
  const after =
    zone === null ? new Date(Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`) - 1) : now;
  const found: string[] = [];
  let cursor: Date = after;
  while (found.length < previewCount) {
    const next = rule.next(cursor);
    if (next === null) break;
    cursor = new Date(next.epochMilliseconds);
    found.push(cursor.toISOString());
  }
  return found;
}

function collectionFor(
  hashes: readonly string[],
  collections: readonly ParseCollection[],
  fallback: string,
): { readonly collectionId: string; readonly tags: readonly string[] } {
  const named = (hash: string): ParseCollection | undefined =>
    collections.find((collection) => collection.name.toLowerCase() === hash.toLowerCase());
  const chosen = hashes.map(named).find((collection) => collection !== undefined);
  return {
    collectionId: chosen?.id ?? fallback,
    tags: hashes.filter((hash) => named(hash) === undefined || named(hash) !== chosen),
  };
}

function timingFor(schedule: Schedule, repeat: RepeatToken | null, timeZone: string): Timing {
  if (repeat === null) return datedTiming(schedule, timeZone);
  const clocks = schedule.range ? schedule.times.slice(0, 1) : schedule.times;
  return repeatingTiming(schedule, timeZone, rruleOf(repeat, clocks));
}

function clocksOf(
  typed: { readonly times: readonly ClockTime[]; readonly range: boolean },
  dated: { readonly time: ClockTime | null; readonly end: ClockTime | null },
): { readonly times: readonly ClockTime[]; readonly range: boolean } {
  if (typed.times.length > 0) return typed;
  const times = [dated.time, dated.end].flatMap((time) => (time === null ? [] : [time]));
  return { times, range: dated.end !== null };
}

export function parsePlannerText(input: ParseInput): PlannerParseResult {
  const markers = extractMarkers(input.text);
  const repeated = extractRepeat(markers.rest);
  const timed = extractTimes(repeated.rest);
  const dated = extractDate(timed.rest, input);
  const title = cleanTitle(dated.rest);
  if (title === '') throw rejection('Write what to add besides the date, time and markers.');
  const clocks = clocksOf(timed.found, dated.found);
  const repeat = repeated.found;
  const anchor = anchorDate(
    dated.found.date,
    clocks.times[0],
    repeat,
    zonedNow(input.now, input.timeZone),
  );
  const timing =
    anchor === null
      ? UNDATED
      : timingFor(
          { ...clocks, date: alignedTo(anchor, repeat?.days ?? []) },
          repeat,
          input.timeZone,
        );
  const placed = collectionFor(markers.found.hashes, input.collections, input.collectionId);
  const draft = PLANNER_ITEM_CREATE.parse({
    ...timing,
    collection_id: placed.collectionId,
    title,
    priority: markers.found.priority,
    tags: placed.tags,
  });
  return {
    draft,
    next_occurrences: occurrenceInstants(timing, input.previewCount, input.now),
    repeat_text: repeat === null ? null : repeatText(repeat, clocks),
  };
}
