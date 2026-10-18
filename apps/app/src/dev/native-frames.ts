import { requireOptionalNativeModule } from 'expo';
import { z } from 'zod';

const WINDOW_COUNTS = z.object({
  frames: z.number(),
  slow16: z.number(),
  slow: z.number(),
  slow100: z.number(),
  worstMs: z.number(),
});

export interface FrameCounts {
  readonly frames: number;
  readonly slow16: number;
  readonly slow33: number;
  readonly slow100: number;
  readonly worstMs: number;
}

interface FrameStatsModule {
  startFrameStats?: () => boolean;
  stopFrameStats?: () => void;
  takeFrameStats?: () => unknown;
}

const diagnostics = requireOptionalNativeModule<FrameStatsModule>('Diagnostics');
let users = 0;

export function frameStatsAvailable(): boolean {
  return diagnostics?.takeFrameStats !== undefined;
}

export function acquireFrameStats(): () => void {
  if (users === 0) {
    diagnostics?.startFrameStats?.();
  }
  users += 1;
  let released = false;
  return (): void => {
    if (released) {
      return;
    }
    released = true;
    users -= 1;
    if (users === 0) {
      diagnostics?.stopFrameStats?.();
    }
  };
}

export function takeFrameCounts(): FrameCounts | null {
  const read = diagnostics?.takeFrameStats;
  if (read === undefined) {
    return null;
  }
  const counts = WINDOW_COUNTS.parse(read());
  return {
    frames: counts.frames,
    slow16: counts.slow16,
    slow33: counts.slow,
    slow100: counts.slow100,
    worstMs: counts.worstMs,
  };
}
