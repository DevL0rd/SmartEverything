import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';

const RESOLUTION_MS = 10;
const NANOSECONDS_PER_MS = 1_000_000;
const TAIL_PERCENTILE = 99;
const NO_LAG: LoopLag = { loopLagMaxMs: 0, loopLagP99Ms: 0 };

export interface LoopLag {
  readonly loopLagMaxMs: number;
  readonly loopLagP99Ms: number;
}

export interface LoopLagWindow {
  readonly finish: () => LoopLag;
  readonly abandon: () => void;
}

function lagMs(nanoseconds: number): number {
  return Math.max(0, Math.round(nanoseconds / NANOSECONDS_PER_MS - RESOLUTION_MS));
}

export function openLoopLagWindow(): LoopLagWindow {
  const histogram: IntervalHistogram = monitorEventLoopDelay({ resolution: RESOLUTION_MS });
  histogram.enable();
  let open = true;
  const close = (): void => {
    if (open) {
      open = false;
      histogram.disable();
    }
  };
  return {
    finish: (): LoopLag => {
      close();
      return histogram.count === 0
        ? NO_LAG
        : {
            loopLagMaxMs: lagMs(histogram.max),
            loopLagP99Ms: lagMs(histogram.percentile(TAIL_PERCENTILE)),
          };
    },
    abandon: close,
  };
}
