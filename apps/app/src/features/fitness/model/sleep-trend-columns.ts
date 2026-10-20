import type { MixColumn, MixNight, WindowColumn, WindowNight } from '../../../components/charts';
import { minutesOfDay, startOfDayKey } from '../../../format/time';
import type { SleepPattern } from './sleep';
import type { MonthRow, NightRow, SleepTrend } from './sleep-trend';

const DAY_MINUTES = 24 * 60;

export interface UsualTimes {
  readonly bed: number;
  readonly wake: number;
}

export function usualOf(pattern: SleepPattern | null): UsualTimes | null {
  return pattern === null ? null : { bed: pattern.usualBedtime, wake: pattern.usualWake };
}

function dayWindowColumn(row: NightRow): WindowColumn {
  const { night } = row;
  const nap = row.naps[0];
  const windowNight: WindowNight | null =
    night === null
      ? null
      : {
          bed: minutesOfDay(night.bedtime),
          wake: minutesOfDay(night.wake),
          asleepMinutes: night.asleepMinutes,
        };
  return {
    key: row.day,
    at: startOfDayKey(row.day),
    night: windowNight,
    nap:
      nap === undefined ? null : { start: minutesOfDay(nap.bedtime), end: minutesOfDay(nap.wake) },
  };
}

function monthWindowColumn(month: MonthRow): WindowColumn {
  const { bedtime, wake, average } = month;
  const key = String(month.start);
  if (bedtime === null || wake === null || average === null) {
    return { key, at: month.start, night: null, nap: null };
  }
  return {
    key,
    at: month.start,
    night: { bed: bedtime % DAY_MINUTES, wake, asleepMinutes: average },
    nap: null,
  };
}

export function windowColumnsOf(
  trend: SleepTrend,
  months: readonly MonthRow[] | null,
): readonly WindowColumn[] {
  return months === null ? trend.rows.map(dayWindowColumn) : months.map(monthWindowColumn);
}

function dayMixColumn(row: NightRow): MixColumn {
  const { night } = row;
  return {
    key: row.day,
    at: startOfDayKey(row.day),
    night:
      night === null
        ? null
        : {
            asleep: night.asleepMinutes,
            stages: night.hasStages
              ? { deep: night.totals.deep, light: night.totals.light, rem: night.totals.rem }
              : null,
          },
  };
}

function monthMixNight(month: MonthRow): MixNight | null {
  if (month.average === null) {
    return null;
  }
  const { average, mix } = month;
  return {
    asleep: average,
    stages:
      mix === null
        ? null
        : { deep: mix.deep * average, light: mix.light * average, rem: mix.rem * average },
  };
}

export function mixColumnsOf(
  trend: SleepTrend,
  months: readonly MonthRow[] | null,
): readonly MixColumn[] {
  return months === null
    ? trend.rows.map(dayMixColumn)
    : months.map((month) => ({
        key: String(month.start),
        at: month.start,
        night: monthMixNight(month),
      }));
}
