import { dayLabel, shortClock } from '../../format/time';

interface Extent {
  readonly min: number;
  readonly max: number;
}

interface Tick {
  readonly at: number;
  readonly label: string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const STEPS: readonly number[] = [
  5 * MINUTE,
  15 * MINUTE,
  30 * MINUTE,
  HOUR,
  3 * HOUR,
  6 * HOUR,
  12 * HOUR,
  DAY,
  7 * DAY,
];
const MAX_TICKS = 6;
const MIN_SPAN = 30 * MINUTE;

export function fitWindow(times: Extent): Extent {
  const span = times.max - times.min;
  if (span >= MIN_SPAN) {
    return times;
  }
  const pad = (MIN_SPAN - span) / 2;
  return { min: times.min - pad, max: times.max + pad };
}

function stepFor(span: number): number {
  return STEPS.find((step) => span / step <= MAX_TICKS) ?? DAY * 30;
}

export function fitTicks(window: Extent): Tick[] {
  const step = stepFor(window.max - window.min);
  const offset = new Date(window.min).getTimezoneOffset() * MINUTE;
  const first = Math.ceil((window.min - offset) / step) * step + offset;
  const ticks: Tick[] = [];
  for (let at = first; at <= window.max; at += step) {
    ticks.push({ at, label: step >= DAY ? dayLabel(new Date(at), at) : shortClock(new Date(at)) });
  }
  return ticks;
}
