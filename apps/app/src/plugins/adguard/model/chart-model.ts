import type { AdGuardStats } from '@smarteverything/domain';
import { niceTicks } from '../../../components/charts/scale';
import { count, percent } from '../../../format/number';
import { clock, DAY_MS, HOUR_MS, hourOf, shortDate } from '../../../format/time';

type Unit = AdGuardStats['timeUnit'];

export interface HourBar {
  readonly key: string;
  readonly at: number;
  readonly label: string;
  readonly allowed: number;
  readonly blocked: number;
  readonly total: number;
}

export interface AxisTick {
  readonly index: number;
  readonly label: string;
}

const HOURS_PER_TICK = 6;
const DAYS_PER_TICK = 7;
const NEAR_END = 3;

function bucketStart(at: string, unit: Unit, back: number): number {
  const date = new Date(at);
  if (unit === 'hours') {
    date.setMinutes(0, 0, 0);
    return date.getTime() - back * HOUR_MS;
  }
  date.setHours(12, 0, 0, 0);
  return date.getTime() - back * DAY_MS;
}

function labelOf(at: number, unit: Unit): string {
  return unit === 'hours' ? clock(at) : shortDate(at);
}

export function hourlyStack(stats: AdGuardStats, at: string): readonly HourBar[] {
  const last = stats.history.length - 1;
  return stats.history.map((total, index) => {
    const blocked = stats.historyBlocked[index] ?? 0;
    const start = bucketStart(at, stats.timeUnit, last - index);
    return {
      key: String(start),
      at: start,
      label: labelOf(start, stats.timeUnit),
      allowed: total - blocked,
      blocked,
      total,
    };
  });
}

export function tooltipOf(bar: HourBar): string {
  if (bar.total === 0) {
    return `${bar.label} · No lookups`;
  }
  return `${bar.label} · ${count(bar.total)} lookups · ${count(bar.blocked)} blocked (${percent(Math.round((bar.blocked / bar.total) * 100) / 100)})`;
}

export function spokenBar(bar: HourBar): string {
  return `${bar.label}, ${count(bar.total)} lookups, ${count(bar.blocked)} blocked`;
}

export function summaryOf(bars: readonly HourBar[], unit: Unit): string | null {
  const busiest = bars.reduce<HourBar | null>(
    (best, bar) => (best === null || bar.total > best.total ? bar : best),
    null,
  );
  if (busiest === null) {
    return null;
  }
  const blocked = bars.reduce((sum, bar) => sum + bar.blocked, 0);
  return `Busiest ${unit === 'hours' ? 'hour' : 'day'} was ${busiest.label} with ${count(busiest.total)} lookups; ${count(blocked)} blocked in total.`;
}

export function axisTicks(bars: readonly HourBar[], unit: Unit): readonly AxisTick[] {
  const last = bars.length - 1;
  const onStep = (bar: HourBar, back: number): boolean =>
    unit === 'hours' ? hourOf(new Date(bar.at)) % HOURS_PER_TICK === 0 : back % DAYS_PER_TICK === 0;
  const inner = bars.flatMap((bar, index): AxisTick[] => {
    const back = last - index;
    return back >= NEAR_END && onStep(bar, back) ? [{ index, label: bar.label }] : [];
  });
  return last < 0 ? [] : [...inner, { index: last, label: unit === 'hours' ? 'now' : 'today' }];
}

export function valueTicks(bars: readonly HourBar[]): readonly number[] {
  const peak = Math.max(1, ...bars.map((bar) => bar.total));
  return niceTicks({ min: 0, max: peak });
}
