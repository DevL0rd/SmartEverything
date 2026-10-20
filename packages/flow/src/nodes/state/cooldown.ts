import { z } from 'zod';

export const COOLDOWN_MEMORY = z.strictObject({
  passedAt: z.record(z.string(), z.number().nonnegative()),
});
export type CooldownMemory = z.infer<typeof COOLDOWN_MEMORY>;

export const EMPTY_COOLDOWN: CooldownMemory = { passedAt: {} };

export const COOLDOWN_REQUEST = z.strictObject({
  now: z.number().nonnegative(),
  periodMs: z.number().nonnegative(),
  key: z.string().default(''),
});
export type CooldownRequest = z.input<typeof COOLDOWN_REQUEST>;

export type CooldownOutcome =
  | { readonly exit: 'pass'; readonly memory: CooldownMemory }
  | { readonly exit: 'blocked'; readonly remainingMs: number; readonly memory: CooldownMemory };

function stillCooling(
  passedAt: Readonly<Record<string, number>>,
  now: number,
  periodMs: number,
): Record<string, number> {
  return Object.fromEntries(Object.entries(passedAt).filter(([, at]) => now - at < periodMs));
}

export function cooldown(memory: CooldownMemory, input: CooldownRequest): CooldownOutcome {
  const { now, periodMs, key } = COOLDOWN_REQUEST.parse(input);
  const last = memory.passedAt[key];
  if (last !== undefined && now - last < periodMs) {
    return { exit: 'blocked', remainingMs: periodMs - (now - last), memory };
  }
  const kept = stillCooling(memory.passedAt, now, periodMs);
  return { exit: 'pass', memory: { passedAt: { ...kept, [key]: now } } };
}
