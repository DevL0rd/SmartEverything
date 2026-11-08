import { z } from 'zod';
import {
  AI_SUBSCRIPTION_USAGE,
  weeklySubscriptionWindow,
  type AiSubscriptionUsage,
} from '@smarteverything/domain';
import type { CodexJob } from './job';
import type { RpcRecord } from './protocol';
import { updatedRateLimits } from './rate-limits';
const WINDOW = z.object({
  usedPercent: z.number().nonnegative(),
  windowDurationMins: z.number().positive().nullable(),
  resetsAt: z.number().nullable(),
});
const LIMIT = z.object({
  limitId: z.string().nullable(),
  limitName: z.string().nullable(),
  primary: WINDOW.nullable(),
  secondary: WINDOW.nullable(),
});
const RATE_LIMITS = z.object({
  rateLimits: LIMIT.nullable(),
  rateLimitsByLimitId: z.record(z.string(), LIMIT).nullable(),
});
export function codexUsage(raw: unknown, now: string): AiSubscriptionUsage {
  const parsed = RATE_LIMITS.safeParse(raw);
  if (!parsed.success)
    return { runtime: 'codex', reported_at: now, status: 'unavailable', windows: [] };
  const limits = reportedLimits(parsed.data);
  const windows = limits.flatMap(([key, limit]) =>
    ['primary', 'secondary'].flatMap((slot) => {
      const value = slot === 'primary' ? limit.primary : limit.secondary;
      if (value === null) return [];
      return [
        {
          id: JSON.stringify([key, slot]),
          label: `${limit.limitName ?? key} · ${slot}`,
          used_percent: value.usedPercent,
          resets_at: value.resetsAt === null ? null : new Date(value.resetsAt * 1000).toISOString(),
          window_duration_mins: value.windowDurationMins,
        },
      ];
    }),
  );
  return AI_SUBSCRIPTION_USAGE.parse({
    runtime: 'codex',
    reported_at: now,
    status: windows.length === 0 ? 'unavailable' : 'reported',
    windows,
  });
}

function reportedLimits(
  value: z.infer<typeof RATE_LIMITS>,
): readonly (readonly [string, z.infer<typeof LIMIT>])[] {
  const keyed = value.rateLimitsByLimitId ?? {};
  if (value.rateLimits === null) return Object.entries(keyed);
  return Object.entries({ [value.rateLimits.limitId ?? 'account']: value.rateLimits, ...keyed });
}

export class CodexSubscriptionUsage {
  raw: RpcRecord | null = null;
  observation: AiSubscriptionUsage | undefined;

  constructor(private readonly now: () => string) {}

  observe(limits: RpcRecord | null): AiSubscriptionUsage {
    const observation = codexUsage(limits, this.now());
    this.raw = limits;
    this.observation = observation;
    return observation;
  }

  update(limits: unknown, jobs: Iterable<CodexJob>): void {
    this.raw = updatedRateLimits(this.raw, limits);
    const observation = codexUsage({ rateLimits: limits, rateLimitsByLimitId: null }, this.now());
    if (weeklySubscriptionWindow(observation) !== undefined) this.observation = observation;
    for (const job of jobs)
      if (job.active)
        job.publishRateObservation(updatedRateLimits(job.usage.rate_limits, limits), observation);
  }
}
