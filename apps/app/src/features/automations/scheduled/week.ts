import { appendTo, localClock, type Place, type ScheduleRow } from '@smarteverything/domain';
import { localDayKey } from '../../../format/time';
import { sameJson } from '../../../store/same-json';
import {
  upcomingRuns,
  type ScheduledV3,
  type Upcoming,
  type Window,
} from '../model/consumers/week-schedule';
import { dayWindow } from './place';
import { titleOf, upcomingOf } from './view';

const WEEK = 7;

export interface OneOff {
  readonly key: string;
  readonly scheduleId: string;
  readonly title: string;
  readonly at: Date;
}

function timesOf(row: ScheduleRow): readonly string[] {
  if (row.state === 'waiting') {
    return row.next_at === null ? [] : [row.next_at];
  }
  return row.occurrences.slice(row.occurrence);
}

function oneOffRuns(rows: readonly ScheduleRow[], window: Window): OneOff[] {
  return upcomingOf(rows)
    .flatMap((row) =>
      timesOf(row).map((at) => ({
        key: `${row.id}:${at}`,
        scheduleId: row.id,
        title: titleOf(row),
        at: new Date(at),
      })),
    )
    .filter((run) => run.at >= window.start && run.at < window.end)
    .sort((left, right) => left.at.getTime() - right.at.getTime());
}

export interface TimedRule {
  readonly id: string;
  readonly name: string;
  readonly scheduled: ScheduledV3 | null;
}

export interface Day {
  readonly key: string;
  readonly start: Date;
  readonly runs: readonly Upcoming[];
  readonly oneOffs: readonly OneOff[];
}

interface WeekKey {
  readonly weekStart: number;
  readonly rules: readonly TimedRule[];
  readonly scheduled: readonly ScheduleRow[];
  readonly place: Place;
}

function groupedByDay<Run extends { readonly at: Date }>(
  runs: readonly Run[],
  timeZone: string,
): ReadonlyMap<string, Run[]> {
  const grouped = new Map<string, Run[]>();
  for (const run of runs) {
    appendTo(grouped, localDayKey(run.at, timeZone), run);
  }
  return grouped;
}

let lastWeek: { readonly key: WeekKey; readonly days: readonly Day[] } | null = null;

export function weekOf(
  value: Date,
  rules: readonly TimedRule[],
  scheduled: readonly ScheduleRow[],
  place: Place,
): readonly Day[] {
  const back = -((localClock(value, place.timeZone).weekday + 6) % WEEK);
  const window = dayWindow(value, place.timeZone, back, WEEK);
  const key = { weekStart: window.start.getTime(), rules, scheduled, place };
  if (lastWeek !== null && sameJson(lastWeek.key, key)) {
    return lastWeek.days;
  }
  const runs = upcomingRuns(rules, window, place);
  const oneOffs = oneOffRuns(scheduled, window);
  const runsByDay = groupedByDay(runs, place.timeZone);
  const oneOffsByDay = groupedByDay(oneOffs, place.timeZone);
  const days = Array.from({ length: WEEK }, (_, index) => {
    const start = dayWindow(value, place.timeZone, back + index).start;
    const dayKey = localDayKey(start, place.timeZone);
    return {
      key: dayKey,
      start,
      runs: runsByDay.get(dayKey) ?? [],
      oneOffs: oneOffsByDay.get(dayKey) ?? [],
    };
  });
  lastWeek = { key, days };
  return days;
}
