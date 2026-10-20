import { z } from 'zod';

export const RATE_LIMIT_MEMORY = z.strictObject({
  stamps: z.record(z.string(), z.array(z.number())),
});
export type RateLimitMemory = z.infer<typeof RATE_LIMIT_MEMORY>;

export const EMPTY_RATE_LIMIT: RateLimitMemory = { stamps: {} };

export const RATE_LIMIT_REQUEST = z.strictObject({
  now: z.number().nonnegative(),
  max: z.number().int().min(1),
  windowMs: z.number().positive(),
  key: z.string().default(''),
  excess: z.enum(['drop', 'queue']).default('drop'),
});
export type RateLimitRequest = z.input<typeof RATE_LIMIT_REQUEST>;

export type RateLimitOutcome =
  | { readonly exit: 'pass'; readonly delayMs: number; readonly memory: RateLimitMemory }
  | { readonly exit: 'dropped'; readonly memory: RateLimitMemory };

export function rateLimit(
  memory: RateLimitMemory | undefined,
  input: RateLimitRequest,
): RateLimitOutcome {
  const { now, max, windowMs, key, excess } = RATE_LIMIT_REQUEST.parse(input);
  const before = memory ?? EMPTY_RATE_LIMIT;
  const recent = (before.stamps[key] ?? []).filter((at) => at > now - windowMs).sort(by);
  const slot = recent.length < max ? now : (recent[recent.length - max] ?? now) + windowMs;
  if (slot > now && excess === 'drop') {
    return { exit: 'dropped', memory: { stamps: { ...before.stamps, [key]: recent } } };
  }
  return {
    exit: 'pass',
    delayMs: slot - now,
    memory: { stamps: { ...before.stamps, [key]: [...recent, slot] } },
  };
}

function by(left: number, right: number): number {
  return left - right;
}
