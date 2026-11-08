import { z } from 'zod';

export const WATCHDOG_TICK_MS = 1000;
export const LAG_WARN_MS = 1000;
export const STACK_AFTER_MS = 5000;
export const STACK_WAIT_MS = 3000;
export const HEALTH_EVERY_TICKS = 300;
export const RESPAWN_MS = 5000;

export const BEAT_SEQUENCE = 0;
export const BEAT_STOPPING = 1;
export const BEAT_SLOTS = 2;

export const WATCHDOG_DATA = z.strictObject({
  beat: z.instanceof(SharedArrayBuffer),
  name: z.string().min(1),
  logPath: z.string().min(1),
  release: z.string().min(1),
  tickMs: z.number().positive(),
  stackAfterMs: z.number().positive(),
  exitAfterMs: z.number().positive(),
});

export type WatchdogData = z.output<typeof WATCHDOG_DATA>;

export const WATCHDOG_MESSAGE = z.strictObject({
  kind: z.literal('stalled'),
  stalledMs: z.number().nonnegative(),
  frames: z.array(z.string()),
});

export type WatchdogMessage = z.output<typeof WATCHDOG_MESSAGE>;
