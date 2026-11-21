import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { Logger } from '@smarteverything/logging';
import { lagMs, LOOP_DELAY_RESOLUTION_MS } from '../metrics/loop-delay';

export const LOOP_BLOCK_WARN_MS = 50;
const WINDOW_MS = 1000;
const TAIL_PERCENTILE = 99;

export interface LoopBlockMonitorOptions {
  readonly log: Logger;
  readonly warnMs?: number;
  readonly windowMs?: number;
}

export interface LoopBlockMonitor {
  readonly stop: () => void;
}

export function startLoopBlockMonitor(options: LoopBlockMonitorOptions): LoopBlockMonitor {
  const warnMs = options.warnMs ?? LOOP_BLOCK_WARN_MS;
  const windowMs = options.windowMs ?? WINDOW_MS;
  const histogram = monitorEventLoopDelay({ resolution: LOOP_DELAY_RESOLUTION_MS });
  histogram.enable();
  let openedAt = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    if (histogram.count > 0) {
      const maxMs = lagMs(histogram.max);
      if (maxMs >= warnMs)
        options.log.warn('loop.blocked', {
          maxMs,
          p99Ms: lagMs(histogram.percentile(TAIL_PERCENTILE)),
          meanMs: lagMs(histogram.mean),
          windowMs: Math.round(now - openedAt),
          thresholdMs: warnMs,
        });
    }
    histogram.reset();
    openedAt = now;
  }, windowMs);
  timer.unref();
  return {
    stop: (): void => {
      clearInterval(timer);
      histogram.disable();
    },
  };
}
