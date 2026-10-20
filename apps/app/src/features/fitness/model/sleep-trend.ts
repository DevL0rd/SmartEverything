import { appendTo } from '@smarteverything/domain';
import { dayKeyOf, hoursMinutes, minutesOfDay, shiftDay } from '../../../format/time';
import { daysIn, previousWindow, type Range, type Window } from './window';
import {
  eveningMinutes,
  median,
  patternOf,
  splitNights,
  type SleepDay,
  type SleepNight,
  type SleepPattern,
} from './sleep';

export interface NightRow {
  readonly day: string;
  readonly night: SleepNight | null;
  readonly naps: readonly SleepNight[];
}

export function nightRowsOf(nights: readonly SleepNight[], window: Window): readonly NightRow[] {
  const byDay = new Map<string, SleepNight[]>();
  for (const night of nights) {
    appendTo(byDay, night.day, night);
  }
  return Array.from({ length: daysIn(window) }, (_, index) => {
    const day = shiftDay(window.firstDay, index);
    return { day, ...splitNights(byDay.get(day) ?? [], day) };
  });
}

function recordedOf(rows: readonly NightRow[]): readonly SleepNight[] {
  return rows.flatMap((row) => (row.night === null ? [] : [row.night]));
}

export interface Average {
  readonly minutes: number;
  readonly nights: number;
  readonly of: number;
}

export function averageOf(rows: readonly NightRow[]): Average | null {
  const recorded = recordedOf(rows);
  if (recorded.length === 0) {
    return null;
  }
  const total = recorded.reduce((sum, night) => sum + night.asleepMinutes, 0);
  return { minutes: total / recorded.length, nights: recorded.length, of: rows.length };
}

export function totalAsleepOf(rows: readonly NightRow[]): number {
  return recordedOf(rows).reduce((sum, night) => sum + night.asleepMinutes, 0);
}

export interface Comparison {
  readonly deltaMinutes: number;
  readonly text: string;
}

export const PREVIOUS_WORDS: Readonly<Record<Range, string>> = {
  day: 'yesterday',
  week: 'last week',
  month: 'last month',
  year: 'last year',
};

export function comparisonOf(
  current: readonly NightRow[],
  previous: readonly NightRow[],
  range: Range,
): Comparison | null {
  const now = averageOf(current);
  const before = averageOf(previous);
  if (now === null || before === null) {
    return null;
  }
  const deltaMinutes = Math.round(now.minutes) - Math.round(before.minutes);
  const when = PREVIOUS_WORDS[range];
  if (deltaMinutes === 0) {
    return { deltaMinutes, text: `Same per night as ${when}` };
  }
  const direction = deltaMinutes > 0 ? 'more' : 'less';
  return {
    deltaMinutes,
    text: `${hoursMinutes(Math.abs(deltaMinutes))} ${direction} per night than ${when}`,
  };
}

export interface BestNight {
  readonly day: string;
  readonly minutes: number;
}

export function bestNightOf(rows: readonly NightRow[]): BestNight | null {
  let best: BestNight | null = null;
  for (const row of rows) {
    if (row.night !== null && (best === null || row.night.asleepMinutes > best.minutes)) {
      best = { day: row.day, minutes: row.night.asleepMinutes };
    }
  }
  return best;
}

export interface StageMix {
  readonly deep: number;
  readonly light: number;
  readonly rem: number;
}

export function stageMixOf(rows: readonly NightRow[]): StageMix | null {
  const staged = recordedOf(rows).filter((night) => night.hasStages && night.asleepMinutes > 0);
  const asleep = staged.reduce((sum, night) => sum + night.asleepMinutes, 0);
  if (asleep === 0) {
    return null;
  }
  const share = (stage: 'deep' | 'light' | 'rem'): number =>
    staged.reduce((sum, night) => sum + night.totals[stage], 0) / asleep;
  return { deep: share('deep'), light: share('light'), rem: share('rem') };
}

const SPREAD_STEP_MINUTES = 5;

export function bedtimeSpreadOf(pattern: SleepPattern): number {
  return Math.round(pattern.bedtimeSpread / SPREAD_STEP_MINUTES) * SPREAD_STEP_MINUTES;
}

export function patternOfRows(rows: readonly NightRow[]): SleepPattern | null {
  const days: SleepDay[] = rows.flatMap((row) =>
    row.night === null
      ? []
      : [
          {
            day: row.day,
            main: row.night,
            naps: row.naps,
            asleepMinutes: [row.night, ...row.naps].reduce(
              (sum, night) => sum + night.asleepMinutes,
              0,
            ),
          },
        ],
  );
  return patternOf(days);
}

export interface SleepTrend {
  readonly rows: readonly NightRow[];
  readonly recorded: number;
  readonly average: Average | null;
  readonly total: number;
  readonly comparison: Comparison | null;
  readonly best: BestNight | null;
  readonly mix: StageMix | null;
  readonly pattern: SleepPattern | null;
  readonly bedtimeSpread: number | null;
}

export function trendOf(
  nights: readonly SleepNight[],
  previousNights: readonly SleepNight[],
  window: Window,
): SleepTrend {
  const rows = nightRowsOf(nights, window);
  const pattern = patternOfRows(rows);
  return {
    rows,
    recorded: recordedOf(rows).length,
    average: averageOf(rows),
    total: totalAsleepOf(rows),
    comparison: comparisonOf(
      rows,
      nightRowsOf(previousNights, previousWindow(window)),
      window.range,
    ),
    best: bestNightOf(rows),
    mix: stageMixOf(rows),
    pattern,
    bedtimeSpread: pattern === null ? null : bedtimeSpreadOf(pattern),
  };
}

export interface MonthRow {
  readonly start: number;
  readonly end: number;
  readonly recorded: number;
  readonly bedtime: number | null;
  readonly wake: number | null;
  readonly average: number | null;
  readonly mix: StageMix | null;
}

export function monthRowsOf(nights: readonly SleepNight[], window: Window): readonly MonthRow[] {
  return window.buckets.map((bucket) => {
    const rows = nightRowsOf(nights, {
      ...window,
      range: 'month',
      start: bucket.start,
      end: bucket.end,
      firstDay: dayKeyOf(bucket.start),
    });
    const recorded = recordedOf(rows);
    const average = averageOf(rows);
    return {
      start: bucket.start,
      end: bucket.end,
      recorded: recorded.length,
      bedtime:
        recorded.length === 0 ? null : median(recorded.map((n) => eveningMinutes(n.bedtime))),
      wake: recorded.length === 0 ? null : median(recorded.map((n) => minutesOfDay(n.wake))),
      average: average === null ? null : average.minutes,
      mix: stageMixOf(rows),
    };
  });
}
