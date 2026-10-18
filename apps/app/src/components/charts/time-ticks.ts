import { scaleTime } from 'd3-scale';
import { dateFormat } from '../../format/locale';
import { DAY_MS, HOUR_MS, MINUTE_MS, shortClock } from '../../format/time';
import type { ChartRange, Extent, Tick } from './scale';

const MAX_FIT_TICKS = 6;
const MIN_FIT_SPAN = 30 * MINUTE_MS;

type TickStyle = 'clock' | 'weekday' | 'date' | 'month';

interface TickRule {
  readonly count: number;
  readonly style: TickStyle;
}

const TICK_RULE: Readonly<Record<ChartRange, TickRule>> = {
  '24h': { count: 4, style: 'clock' },
  day: { count: 4, style: 'clock' },
  '7d': { count: 7, style: 'weekday' },
  week: { count: 7, style: 'weekday' },
  '30d': { count: 5, style: 'date' },
  month: { count: 5, style: 'date' },
  year: { count: 12, style: 'month' },
};

function tickLabel(date: Date, style: TickStyle): string {
  if (style === 'clock') {
    return shortClock(date);
  }
  if (style === 'weekday') {
    return dateFormat({ weekday: 'short' }).format(date);
  }
  if (style === 'date') {
    return dateFormat({ day: 'numeric', month: 'short' }).format(date);
  }
  return dateFormat({ month: 'short' }).format(date);
}

function ticksOf(
  window: Extent,
  count: number,
  style: (dates: readonly Date[]) => TickStyle,
): Tick[] {
  const dates = scaleTime().domain([window.min, window.max]).ticks(count);
  const use = style(dates);
  return dates.map((date) => ({ at: date.getTime(), label: tickLabel(date, use) }));
}

export function rangeTicks(window: Extent, range: ChartRange): Tick[] {
  const rule = TICK_RULE[range];
  return ticksOf(window, rule.count, () => rule.style);
}

export function fitWindow(times: Extent): Extent {
  const span = times.max - times.min;
  if (span >= MIN_FIT_SPAN) {
    return times;
  }
  const pad = (MIN_FIT_SPAN - span) / 2;
  return { min: times.min - pad, max: times.max + pad };
}

function fitStyle(dates: readonly Date[]): TickStyle {
  const [first, second] = dates;
  const daily =
    first !== undefined &&
    second !== undefined &&
    second.getTime() - first.getTime() > DAY_MS - 2 * HOUR_MS;
  return daily ? 'date' : 'clock';
}

export function fitTicks(window: Extent): Tick[] {
  return ticksOf(window, MAX_FIT_TICKS, fitStyle);
}
