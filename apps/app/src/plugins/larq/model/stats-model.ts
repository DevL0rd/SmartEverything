import {
  BOTTLE_SIZE_BIN_ML,
  bottleWeekday,
  type BottleBar,
  type BottleComparison,
  type BottleDaily,
  type BottleDailyAverages,
  type BottleStats,
  type BottleStatsRange,
} from '@smarteverything/domain';
import { clockOfMinutes, monthShort, startOfDayKey, weekdayShort } from '../../../format/time';
import { decimal, millilitres } from '../../../format/number';

export const RANGE_OPTIONS: readonly {
  readonly value: BottleStatsRange;
  readonly label: string;
}[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

export type DeltaTone = 'positive' | 'warning' | 'neutral';

export interface Delta {
  readonly text: string;
  readonly tone: DeltaTone;
}

export function deltaOf(comparison: BottleComparison, higherIsBetter = true): Delta {
  const { deltaPct } = comparison;
  if (deltaPct === null) {
    return { text: 'No earlier period', tone: 'neutral' };
  }
  const rounded = Math.round(deltaPct);
  if (rounded === 0) {
    return { text: 'Same as before', tone: 'neutral' };
  }
  const better = higherIsBetter ? rounded > 0 : rounded < 0;
  return {
    text: `${rounded > 0 ? '+' : '−'}${String(Math.abs(rounded))}%`,
    tone: better ? 'positive' : 'warning',
  };
}

interface StatChip {
  readonly label: string;
  readonly value: string;
  readonly delta: Delta;
}

export function chipsOf(stats: BottleStats): readonly StatChip[] {
  const { chips } = stats;
  return [
    {
      label: 'Total',
      value: millilitres(Math.round(chips.total.value)),
      delta: deltaOf(chips.total),
    },
    {
      label: 'Per day',
      value: millilitres(Math.round(chips.perDay.value)),
      delta: deltaOf(chips.perDay),
    },
    { label: 'Drinks', value: decimal(chips.drinks.value), delta: deltaOf(chips.drinks) },
    {
      label: 'Average drink',
      value: millilitres(Math.round(chips.drinkSize.value)),
      delta: deltaOf(chips.drinkSize),
    },
  ];
}

export function barLabelOf(key: string, range: BottleStatsRange): string {
  switch (range) {
    case 'day':
      return Number(key) % 6 === 0 ? key : '';
    case 'week':
      return weekdayShort(startOfDayKey(key)).slice(0, 3);
    case 'month':
      return Number(key.slice(8)) % 5 === 1 ? String(Number(key.slice(8))) : '';
    case 'year':
      return monthShort(startOfDayKey(`${key}-01`)).slice(0, 1);
  }
}

export function barsSummary(bars: readonly BottleBar[], range: BottleStatsRange): string {
  const met = bars.filter((bar) => bar.goalMet).length;
  const total = bars.reduce((sum, bar) => sum + bar.totalMl, 0);
  const unit = range === 'day' ? 'hours' : range === 'year' ? 'months' : 'days';
  return `${millilitres(Math.round(total))} over ${String(bars.length)} ${unit}, goal reached on ${String(met)}.`;
}

export function barsPeak(bars: readonly BottleBar[]): number {
  return Math.max(1, ...bars.map((bar) => Math.max(bar.totalMl, bar.previousMl ?? 0, bar.goalMl)));
}

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export interface HeatCell {
  readonly day: string;
  readonly ml: number;
  readonly level: HeatLevel;
  readonly met: boolean;
  readonly week: number;
  readonly row: number;
}

interface HeatMonth {
  readonly week: number;
  readonly label: string;
}

interface HeatGrid {
  readonly cells: readonly HeatCell[];
  readonly weeks: number;
  readonly months: readonly HeatMonth[];
}

const MONDAY_FIRST = 6;
const WEEKDAYS = 7;

export function heatLevelOf(ml: number, goalMl: number): HeatLevel {
  if (ml <= 0) {
    return 0;
  }
  const share = goalMl > 0 ? ml / goalMl : 1;
  if (share >= 1) {
    return 4;
  }
  return share >= 0.5 ? 3 : share >= 0.25 ? 2 : 1;
}

function monthLabels(cells: readonly HeatCell[], gapWeeks: number): readonly HeatMonth[] {
  const months: HeatMonth[] = [];
  let seen = '';
  for (const cell of cells) {
    const month = cell.day.slice(0, 7);
    if (month === seen) {
      continue;
    }
    seen = month;
    const last = months.at(-1);
    if (last === undefined || cell.week - last.week >= gapWeeks) {
      months.push({ week: cell.week, label: monthShort(startOfDayKey(`${month}-01`)).slice(0, 3) });
    }
  }
  return months;
}

export function heatGrid(heatmap: BottleStats['heatmap'], gapWeeks: number): HeatGrid {
  const first = heatmap[0];
  if (first === undefined) {
    return { cells: [], weeks: 0, months: [] };
  }
  const offset = (bottleWeekday(first.day) + MONDAY_FIRST) % WEEKDAYS;
  const cells = heatmap.map((entry, index): HeatCell => {
    const slot = index + offset;
    return {
      day: entry.day,
      ml: entry.ml,
      level: heatLevelOf(entry.ml, entry.goalMl),
      met: entry.goalMl > 0 && entry.ml >= entry.goalMl,
      week: Math.floor(slot / WEEKDAYS),
      row: slot % WEEKDAYS,
    };
  });
  return { cells, weeks: (cells.at(-1)?.week ?? 0) + 1, months: monthLabels(cells, gapWeeks) };
}

export function heatSummary(heatmap: BottleStats['heatmap']): string {
  const met = heatmap.filter((entry) => entry.goalMl > 0 && entry.ml >= entry.goalMl).length;
  return `Calendar of ${String(heatmap.length)} days, goal reached on ${String(met)}.`;
}

const ROW_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

interface RhythmRow {
  readonly name: (typeof ROW_NAMES)[number];
  readonly shares: readonly number[];
}

export function rhythmRows(rhythm: BottleStats['rhythm']): readonly RhythmRow[] {
  const peak = Math.max(1, ...rhythm.flat());
  return ROW_NAMES.map((name, index) => ({
    name,
    shares: (rhythm[(index + 1) % WEEKDAYS] ?? []).map((ml) => ml / peak),
  }));
}

export function rhythmSummary(rhythm: BottleStats['rhythm']): string {
  const rows = rhythmRows(rhythm);
  let best = { name: '', hour: 0, share: 0 };
  for (const row of rows) {
    row.shares.forEach((share, hour) => {
      if (share > best.share) {
        best = { name: row.name, hour, share };
      }
    });
  }
  return best.share === 0
    ? 'No drinking pattern yet.'
    : `Busiest time: ${best.name} around ${clockOfMinutes(best.hour * 60)}.`;
}

interface SizeBin {
  readonly label: string;
  readonly count: number;
  readonly median: boolean;
}

export function sizeBins(sizes: BottleStats['sizes']): readonly SizeBin[] {
  const medianBin =
    sizes.medianMl === null
      ? -1
      : Math.min(sizes.bins.length - 1, Math.floor(sizes.medianMl / BOTTLE_SIZE_BIN_ML));
  return sizes.bins.map((count, index) => ({
    label: (index * BOTTLE_SIZE_BIN_ML) % 100 === 0 ? String(index * BOTTLE_SIZE_BIN_ML) : '',
    count,
    median: index === medianBin,
  }));
}

type MultipleKey = 'drinks' | 'gap' | 'fills';

export interface Multiple {
  readonly key: MultipleKey;
  readonly title: string;
  readonly values: readonly number[];
  readonly average: number;
  readonly delta: Delta;
  readonly low: string;
  readonly high: string;
  readonly unit: string;
}

interface MultipleSpec {
  readonly key: MultipleKey;
  readonly title: string;
  readonly pick: (day: BottleDaily) => number;
  readonly now: number;
  readonly before: number;
  readonly unit: string;
  readonly higherIsBetter: boolean;
}

const whole = (value: number): string => decimal(value);

function multipleOf(spec: MultipleSpec, daily: readonly BottleDaily[]): Multiple {
  const values = daily.map(spec.pick);
  return {
    key: spec.key,
    title: spec.title,
    values,
    average: spec.now,
    delta: deltaOf(
      {
        value: spec.now,
        previous: spec.before,
        deltaPct: spec.before > 0 ? ((spec.now - spec.before) / spec.before) * 100 : null,
      },
      spec.higherIsBetter,
    ),
    low: whole(Math.min(...values)),
    high: whole(Math.max(...values)),
    unit: spec.unit,
  };
}

export function multiplesOf(stats: BottleStats): readonly Multiple[] {
  const now: BottleDailyAverages = stats.dailyAverages;
  const before: BottleDailyAverages = stats.previousDailyAverages;
  const specs: readonly MultipleSpec[] = [
    {
      key: 'drinks',
      title: 'Drinks per day',
      pick: (day) => day.drinks,
      now: now.drinksPerDay,
      before: before.drinksPerDay,
      unit: 'a day',
      higherIsBetter: true,
    },
    {
      key: 'gap',
      title: 'Longest gap',
      pick: (day) => day.longestGapMin,
      now: now.longestGapMin,
      before: before.longestGapMin,
      unit: 'min',
      higherIsBetter: false,
    },
    {
      key: 'fills',
      title: 'Refills per day',
      pick: (day) => day.fills,
      now: now.fillsPerDay,
      before: before.fillsPerDay,
      unit: 'a day',
      higherIsBetter: true,
    },
  ];
  return specs.map((spec) => multipleOf(spec, stats.daily));
}

export function streakLine(streak: BottleStats['streak']): string {
  if (streak.current === 0) {
    return 'No streak yet. Reach your goal today to start one.';
  }
  const days = `${String(streak.current)} ${streak.current === 1 ? 'day' : 'days'} in a row`;
  return streak.atRisk ? `${days}. Drink to keep it going today.` : days;
}

export function bestsLine(
  bests: BottleStats['bests'],
): readonly { readonly label: string; readonly value: string }[] {
  return [
    ...(bests.bestDay === null
      ? []
      : [
          {
            label: 'Best day',
            value: `${millilitres(Math.round(bests.bestDay.ml))} on ${shortDay(bests.bestDay.day)}`,
          },
        ]),
    ...(bests.bestWeek === null
      ? []
      : [
          {
            label: 'Best week',
            value: `${millilitres(Math.round(bests.bestWeek.ml))} from ${shortDay(bests.bestWeek.from)}`,
          },
        ]),
  ];
}

function shortDay(day: string): string {
  return `${monthShort(startOfDayKey(day))} ${String(Number(day.slice(8)))}`;
}

export function bandOf(
  daily: readonly BottleDaily[],
): readonly { readonly day: string; readonly from: number; readonly to: number }[] {
  return daily.flatMap((entry) =>
    entry.firstMinute === null || entry.lastMinute === null
      ? []
      : [{ day: entry.day, from: entry.firstMinute, to: entry.lastMinute }],
  );
}
