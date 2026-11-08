import { RRuleTemporal } from 'rrule-temporal';
import { z } from 'zod';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;
const UNTIL_PART = /(?:^|;)UNTIL=([^;]*)/;
const FREQ_PART = /(?:^|;)FREQ=([A-Z]+)/;
const UNTIL_INSTANT = /(?:^|;)UNTIL=(\d{8}T\d{6}Z)/;
const WALL_ZONE = 'UTC';
const ALL_DAY_ZONE = WALL_ZONE;
const WALL_FREQUENCIES: ReadonlySet<string> = new Set(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);

export const recurrenceSeriesSchema = z
  .object({
    start: z.string().regex(DATE).or(z.string().regex(DATE_TIME)),
    timeZone: z.string().min(1).nullable(),
    rrule: z
      .string()
      .min(1)
      .regex(/^[A-Z0-9=;,+-]+$/),
    exdates: z.array(z.string().regex(DATE).or(z.string().regex(DATE_TIME))).readonly(),
  })
  .strict()
  .readonly();

export type RecurrenceSeries = z.infer<typeof recurrenceSeriesSchema>;

export type RecurrenceFailure = 'invalid' | 'type-mismatch' | 'impossible';

export interface RecurrenceOccurrence {
  readonly local: string;
  readonly instant: Temporal.Instant | null;
}

export type RecurrenceCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly failure: RecurrenceFailure; readonly message: string };

export class RecurrenceError extends Error {
  readonly failure: RecurrenceFailure;

  constructor(failure: RecurrenceFailure, message: string) {
    super(message);
    this.name = 'RecurrenceError';
    this.failure = failure;
  }
}

interface Compiled {
  readonly rule: RRuleTemporal;
  readonly zone: string;
  readonly allDay: boolean;
  readonly wall: boolean;
}

function basicDate(value: string): string {
  return value.replaceAll('-', '');
}

function basicDateTime(value: string): string {
  const compact = value.replaceAll('-', '').replaceAll(':', '');
  return compact.length === 13 ? `${compact}00` : compact;
}

function untilMatchesType(rrule: string, allDay: boolean): boolean {
  const until = UNTIL_PART.exec(rrule)?.[1];
  if (until === undefined) {
    return true;
  }
  return allDay ? /^\d{8}$/.test(until) : /^\d{8}T\d{6}Z$/.test(until);
}

function wallUntil(rrule: string, zone: string): string {
  const until = UNTIL_INSTANT.exec(rrule)?.[1];
  if (until === undefined) {
    return rrule;
  }
  const local = Temporal.Instant.from(
    `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}T${until.slice(9, 11)}:${until.slice(11, 13)}:${until.slice(13, 15)}Z`,
  )
    .toZonedDateTimeISO(zone)
    .toPlainDateTime();
  const pad = (value: number): string => String(value).padStart(2, '0');
  const text = `${String(local.year).padStart(4, '0')}${pad(local.month)}${pad(local.day)}T${pad(local.hour)}${pad(local.minute)}${pad(local.second)}Z`;
  return rrule.replace(`UNTIL=${until}`, `UNTIL=${text}`);
}

function iCalendarText(
  series: RecurrenceSeries,
  rrule: string,
  allDay: boolean,
  zone: string,
): string {
  const lines = allDay
    ? [`DTSTART;VALUE=DATE:${basicDate(series.start)}`]
    : [`DTSTART;TZID=${zone}:${basicDateTime(series.start)}`];
  lines.push(`RRULE:${rrule}`);
  if (series.exdates.length > 0) {
    const values = series.exdates.map((value) =>
      allDay ? basicDate(value) : basicDateTime(value),
    );
    lines.push(
      allDay ? `EXDATE;VALUE=DATE:${values.join(',')}` : `EXDATE;TZID=${zone}:${values.join(',')}`,
    );
  }
  return lines.join('\n');
}

function parseSeries(input: RecurrenceSeries): { series: RecurrenceSeries; allDay: boolean } {
  const parsed = recurrenceSeriesSchema.safeParse(input);
  if (!parsed.success) {
    throw new RecurrenceError('invalid', parsed.error.message);
  }
  const series = parsed.data;
  const allDay = DATE.test(series.start);
  if (allDay !== (series.timeZone === null)) {
    throw new RecurrenceError(
      'type-mismatch',
      'An all-day start has no time zone and a timed start needs one',
    );
  }
  if (series.exdates.some((value) => DATE.test(value) !== allDay)) {
    throw new RecurrenceError('type-mismatch', 'EXDATE must have the same value type as the start');
  }
  if (!untilMatchesType(series.rrule, allDay)) {
    throw new RecurrenceError('type-mismatch', 'UNTIL must have the same value type as the start');
  }
  return { series, allDay };
}

function compile(input: RecurrenceSeries): Compiled {
  const { series, allDay } = parseSeries(input);
  const zone = series.timeZone ?? ALL_DAY_ZONE;
  const wall = !allDay && WALL_FREQUENCIES.has(FREQ_PART.exec(series.rrule)?.[1] ?? '');
  try {
    Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(zone);
    const rule = new RRuleTemporal({
      rruleString: iCalendarText(
        series,
        wall ? wallUntil(series.rrule, zone) : series.rrule,
        allDay,
        wall ? WALL_ZONE : zone,
      ),
      strict: true,
    });
    return { rule, zone, allDay, wall };
  } catch (error) {
    throw new RecurrenceError('invalid', error instanceof Error ? error.message : String(error));
  }
}

function assertOccurs(compiled: Compiled): void {
  try {
    if (compiled.rule.next(compiled.rule.options().dtstart, true) !== null) {
      return;
    }
  } catch (error) {
    throw new RecurrenceError(
      'impossible',
      `The rule never produces an occurrence: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  throw new RecurrenceError('impossible', 'The rule never produces an occurrence');
}

function toOccurrence(value: Temporal.ZonedDateTime, allDay: boolean): RecurrenceOccurrence {
  if (allDay) {
    return { local: value.toPlainDate().toString(), instant: null };
  }
  return {
    local: value.toPlainDateTime().toString({ smallestUnit: 'second' }),
    instant: value.toInstant(),
  };
}

function toRuleTime(instant: Temporal.Instant, compiled: Compiled): Temporal.ZonedDateTime {
  const local = instant.toZonedDateTimeISO(compiled.zone);
  return compiled.wall ? local.toPlainDateTime().toZonedDateTime(WALL_ZONE) : local;
}

function toActual(value: Temporal.ZonedDateTime, compiled: Compiled): Temporal.ZonedDateTime {
  return compiled.wall ? value.toPlainDateTime().toZonedDateTime(compiled.zone) : value;
}

export function checkSeries(series: RecurrenceSeries): RecurrenceCheck {
  try {
    assertOccurs(compile(series));
    return { ok: true };
  } catch (error) {
    if (error instanceof RecurrenceError) {
      return { ok: false, failure: error.failure, message: error.message };
    }
    throw error;
  }
}

export function nextOccurrence(
  series: RecurrenceSeries,
  after: Temporal.Instant,
  inclusive = false,
): RecurrenceOccurrence | null {
  const compiled = compile(series);
  let found = compiled.rule.next(toRuleTime(after, compiled), inclusive);
  while (found !== null) {
    const actual = toActual(found, compiled);
    const order = Temporal.Instant.compare(actual.toInstant(), after);
    if (order > 0 || (inclusive && order === 0)) {
      return toOccurrence(actual, compiled.allDay);
    }
    found = compiled.rule.next(found, false);
  }
  return null;
}

export function occurrencesBetween(
  series: RecurrenceSeries,
  from: Temporal.Instant,
  to: Temporal.Instant,
): readonly RecurrenceOccurrence[] {
  const compiled = compile(series);
  const margin = compiled.wall ? { days: 1 } : { days: 0 };
  return compiled.rule
    .between(
      toRuleTime(from, compiled).subtract(margin),
      toRuleTime(to, compiled).add(margin),
      true,
    )
    .map((value) => toActual(value, compiled))
    .filter(
      (value) =>
        value.toInstant().epochNanoseconds >= from.epochNanoseconds &&
        value.toInstant().epochNanoseconds < to.epochNanoseconds,
    )
    .map((value) => toOccurrence(value, compiled.allDay));
}
