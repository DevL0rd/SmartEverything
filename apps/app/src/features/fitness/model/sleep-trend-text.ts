import { minuteClock } from '../../../components/charts/night-bars-model';
import {
  hoursMinutes,
  monthShort,
  shortDate,
  startOfDayKey,
  weekdayShort,
} from '../../../format/time';
import type { SleepPattern } from './sleep';
import { PREVIOUS_WORDS, type MonthRow, type SleepTrend, type StageMix } from './sleep-trend';
import type { Range } from './window';

export interface TrendStat {
  readonly label: string;
  readonly value: string;
  readonly note?: string;
}

const MINUTES_STEP = 5;

function nightsOf(count: number, total: number): string {
  return `${String(count)} of ${String(total)} nights`;
}

export function scheduleStatsOf(pattern: SleepPattern): readonly TrendStat[] {
  return [
    { label: 'Usual bedtime', value: minuteClock(pattern.usualBedtime) },
    { label: 'Usual wake-up', value: minuteClock(pattern.usualWake) },
    { label: 'Average asleep', value: hoursMinutes(pattern.averageAsleep) },
    {
      label: 'On schedule',
      value: `${String(Math.round(pattern.regularity * 100))}% · ${nightsOf(pattern.regularNights, pattern.nights)}`,
    },
  ];
}

export function spreadLineOf(spread: number, recorded: number, total: number): string {
  const varies =
    spread < MINUTES_STEP
      ? `Bedtime varies by under ${String(MINUTES_STEP)} minutes`
      : `Bedtime varies by about ${String(spread)} minutes`;
  return `${varies} · ${String(recorded)} of ${String(total)} nights recorded`;
}

function bestOf(
  trend: SleepTrend,
  months: readonly MonthRow[] | null,
  range: Range,
): TrendStat | null {
  if (months !== null) {
    const recorded = months.flatMap((month) =>
      month.average === null ? [] : [{ start: month.start, average: month.average }],
    );
    const best = recorded.reduce<(typeof recorded)[number] | null>(
      (top, month) => (top === null || month.average > top.average ? month : top),
      null,
    );
    return best === null
      ? null
      : {
          label: 'Best month',
          value: `${monthShort(best.start)} · ${hoursMinutes(best.average)}`,
          note: 'per night',
        };
  }
  if (trend.best === null) {
    return null;
  }
  const at = startOfDayKey(trend.best.day);
  const date =
    range === 'month' ? shortDate(at) : `${weekdayShort(at)} ${String(new Date(at).getDate())}`;
  return { label: 'Best night', value: `${date} · ${hoursMinutes(trend.best.minutes)}` };
}

export function trendStatsOf(
  trend: SleepTrend,
  months: readonly MonthRow[] | null,
  range: Range,
): readonly TrendStat[] {
  const { average, comparison } = trend;
  const best = bestOf(trend, months, range);
  return [
    ...(average === null
      ? []
      : [
          {
            label: 'Average per night',
            value: hoursMinutes(average.minutes),
            note: nightsOf(average.nights, average.of),
          },
        ]),
    { label: 'Total asleep', value: hoursMinutes(trend.total) },
    ...(comparison === null
      ? []
      : [
          {
            label: `Per night vs ${PREVIOUS_WORDS[range]}`,
            value:
              comparison.deltaMinutes === 0
                ? 'Same'
                : `${hoursMinutes(Math.abs(comparison.deltaMinutes))} ${comparison.deltaMinutes > 0 ? 'more' : 'less'}`,
          },
        ]),
    ...(best === null ? [] : [best]),
  ];
}

export function mixLineOf(mix: StageMix): string {
  const share = (value: number): string => `${String(Math.round(value * 100))}%`;
  return `Deep ${share(mix.deep)} · Light ${share(mix.light)} · REM ${share(mix.rem)} on average`;
}
