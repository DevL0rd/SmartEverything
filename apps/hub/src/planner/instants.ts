import {
  parsePlannerRrule,
  type PlannerItemRow,
  type PlannerOccurrenceRow,
  type PlannerRrule,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import { occurrencesBetween, RecurrenceError, type RecurrenceSeries } from './recurrence';

export type PlannerTiming = Pick<
  PlannerItemRow,
  'start_local' | 'end_local' | 'time_zone' | 'all_day' | 'rrule'
>;

export interface PlannerInstants {
  readonly start: string | null;
  readonly end: string | null;
  readonly series_end: string | null;
}

const NO_INSTANTS: PlannerInstants = { start: null, end: null, series_end: null };

const LATEST = Temporal.Instant.fromEpochMilliseconds(8_640_000_000_000_000 - 3 * 86_400_000);

export function instantOf(local: string, zone: string | null): Temporal.Instant {
  if (zone === null) return Temporal.PlainDate.from(local).toZonedDateTime('UTC').toInstant();
  return Temporal.PlainDateTime.from(local)
    .toZonedDateTime(zone, { disambiguation: 'compatible' })
    .toInstant();
}

export function isoOf(instant: Temporal.Instant): string {
  return new Date(instant.epochMilliseconds).toISOString();
}

function untilOf(
  timing: PlannerTiming,
  until: NonNullable<PlannerRrule['until']>,
): Temporal.Instant {
  if (until.kind === 'date') return instantOf(until.value, null).add({ hours: 24 });
  return until.utc
    ? Temporal.Instant.from(`${until.value}Z`)
    : instantOf(until.value, timing.time_zone);
}

function lastOfCount(timing: PlannerTiming, start: Temporal.Instant): Temporal.Instant | null {
  if (timing.start_local === null || timing.rrule === null) return null;
  const series: RecurrenceSeries = {
    start: timing.start_local,
    timeZone: timing.time_zone,
    rrule: timing.rrule,
    exdates: [],
  };
  try {
    const last = occurrencesBetween(series, start, LATEST).at(-1);
    return last === undefined ? start : instantOf(last.local, timing.time_zone);
  } catch (cause) {
    if (cause instanceof RecurrenceError) throw new RangeError(cause.message, { cause });
    throw cause;
  }
}

function seriesEndOf(
  timing: PlannerTiming,
  start: Temporal.Instant,
  end: Temporal.Instant | null,
): Temporal.Instant | null {
  if (timing.rrule === null) return null;
  const rule = parsePlannerRrule(timing.rrule);
  if (!rule.success) return null;
  const length = end === null ? 0 : end.epochMilliseconds - start.epochMilliseconds;
  if (rule.data.until !== null) {
    return untilOf(timing, rule.data.until).add({ milliseconds: length });
  }
  if (rule.data.count === null) return null;
  const last = lastOfCount(timing, start);
  return last === null ? null : last.add({ milliseconds: length });
}

export function instantsOf(timing: PlannerTiming): PlannerInstants {
  if (timing.start_local === null) return NO_INSTANTS;
  const start = instantOf(timing.start_local, timing.time_zone);
  const end = timing.end_local === null ? null : instantOf(timing.end_local, timing.time_zone);
  const seriesEnd = seriesEndOf(timing, start, end);
  return {
    start: isoOf(start),
    end: end === null ? null : isoOf(end),
    series_end: seriesEnd === null ? null : isoOf(seriesEnd),
  };
}

function differs(item: PlannerItemRow, instants: PlannerInstants): boolean {
  return (
    item.start !== instants.start ||
    item.end !== instants.end ||
    item.series_end !== instants.series_end
  );
}

export function recomputeInstants(store: Pick<Store, 'profiles' | 'plannerItems'>): number {
  let changed = 0;
  for (const profile of store.profiles.list()) {
    for (const item of store.plannerItems.list(profile.id)) {
      const instants = instantsOf(item);
      if (!differs(item, instants)) continue;
      store.plannerItems.update(item.id, profile.id, instants);
      changed += 1;
    }
  }
  return changed;
}

export interface OccurrenceTiming {
  readonly allDay: boolean;
  readonly start: Temporal.Instant | null;
  readonly end: Temporal.Instant | null;
  readonly firstDate: Temporal.PlainDate | null;
  readonly lastDate: Temporal.PlainDate | null;
  readonly due: Temporal.Instant | null;
  readonly dueDate: Temporal.PlainDate | null;
}

export function dayTiming(
  item: PlannerItemRow,
  first: Temporal.PlainDate,
  last: Temporal.PlainDate,
  dated: boolean,
): OccurrenceTiming {
  return {
    allDay: true,
    start: dated ? instantOf(first.toString(), null) : null,
    end: dated ? instantOf(last.add({ days: 1 }).toString(), null) : null,
    firstDate: first,
    lastDate: last,
    due: null,
    dueDate: item.kind === 'task' ? last : null,
  };
}

function dueOf(
  item: PlannerItemRow,
  start: Temporal.Instant,
  end: Temporal.Instant | null,
  single: boolean,
): Temporal.Instant | null {
  if (item.kind !== 'task') return null;
  if (single && item.due_at !== null) return Temporal.Instant.from(item.due_at);
  if (end !== null) return end;
  return item.estimate_minutes === null ? start : start.add({ minutes: item.estimate_minutes });
}

export function timedTiming(
  item: PlannerItemRow,
  start: Temporal.Instant,
  end: Temporal.Instant | null,
  single: boolean,
): OccurrenceTiming {
  return {
    allDay: false,
    start,
    end,
    firstDate: null,
    lastDate: null,
    due: dueOf(item, start, end, single),
    dueDate: null,
  };
}

export function baseTiming(item: PlannerItemRow): OccurrenceTiming | null {
  if (item.start_local !== null) {
    if (item.all_day) {
      const first = Temporal.PlainDate.from(item.start_local);
      return dayTiming(
        item,
        first,
        Temporal.PlainDate.from(item.end_local ?? item.start_local),
        true,
      );
    }
    const start = instantOf(item.start_local, item.time_zone);
    const end = item.end_local === null ? null : instantOf(item.end_local, item.time_zone);
    return timedTiming(item, start, end, true);
  }
  if (item.due_at !== null) {
    const due = Temporal.Instant.from(item.due_at);
    return { ...timedTiming(item, due, null, true), start: null };
  }
  if (item.due_date !== null) {
    const date = Temporal.PlainDate.from(item.due_date);
    return dayTiming(item, date, date, false);
  }
  return null;
}

export function spanDays(timing: OccurrenceTiming): number {
  if (timing.firstDate === null || timing.lastDate === null) return 0;
  return timing.firstDate.until(timing.lastDate, { largestUnit: 'days' }).days;
}

export function lengthMs(timing: OccurrenceTiming): number | null {
  if (timing.start === null || timing.end === null) return null;
  return timing.end.epochMilliseconds - timing.start.epochMilliseconds;
}

export function shiftedTiming(
  item: PlannerItemRow,
  master: OccurrenceTiming,
  start: Temporal.Instant,
): OccurrenceTiming {
  if (master.allDay) {
    const first = start.toZonedDateTimeISO('UTC').toPlainDate();
    return dayTiming(item, first, first.add({ days: spanDays(master) }), master.start !== null);
  }
  const length = lengthMs(master);
  return timedTiming(
    item,
    start,
    length === null ? null : start.add({ milliseconds: length }),
    false,
  );
}

export function movedTiming(
  item: PlannerItemRow,
  base: OccurrenceTiming,
  row: PlannerOccurrenceRow | undefined,
): OccurrenceTiming {
  const movedStart = row?.moved_start ?? null;
  const movedEnd = row?.moved_end ?? null;
  if (movedStart === null) return base;
  const start = Temporal.Instant.from(movedStart);
  if (movedEnd === null || base.allDay) return shiftedTiming(item, base, start);
  return timedTiming(item, start, Temporal.Instant.from(movedEnd), false);
}

export function overdue(timing: OccurrenceTiming, zone: string, now: Temporal.Instant): boolean {
  if (timing.due !== null) return Temporal.Instant.compare(now, timing.due) >= 0;
  if (timing.dueDate === null) return false;
  const closes = timing.dueDate.add({ days: 1 }).toZonedDateTime(zone).toInstant();
  return Temporal.Instant.compare(now, closes) >= 0;
}
