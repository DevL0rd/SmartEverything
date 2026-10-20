import type { Counters } from '@smarteverything/ipp';
import type { PrinterRecord } from './records';

export interface CounterReading {
  readonly delta: number;
  readonly next: PrinterRecord['counters'];
}

export function counterDelta(
  previous: PrinterRecord['counters'],
  counters: Counters,
  restarted: boolean,
): CounterReading {
  const next =
    counters.pages === null && counters.color === null && counters.mono === null
      ? null
      : { pages: counters.pages, color: counters.color, mono: counters.mono };
  if (previous === null || next === null || previous.pages === null || next.pages === null) {
    return { delta: 0, next };
  }
  if (restarted || next.pages < previous.pages) return { delta: 0, next };
  return { delta: next.pages - previous.pages, next };
}
