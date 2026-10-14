import { z } from 'zod';
import { AI_SUBSCRIPTION_USAGE, type AiSubscriptionUsage } from '@smarteverything/domain';
import type { ComputerEvent } from './provider-state';
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
const CLAUDE_LIMIT = z.object({
  status: z.string(),
  rateLimitType: z.string().optional(),
  utilization: z.number().nonnegative().optional(),
  resetsAt: z.number().optional(),
});
export function subscriptionUsage(
  event: ComputerEvent,
  now: string,
  previous: AiSubscriptionUsage | undefined,
): AiSubscriptionUsage | undefined {
  if (event.kind === 'usage' && 'usage' in event) return codexUsage(event.usage.rate_limits, now);
  if (event.kind !== 'runtime' || event.type !== 'rate_limit_event') return undefined;
  const parsed = CLAUDE_LIMIT.safeParse(event.payload['rate_limit_info']);
  if (!parsed.success) return undefined;
  return claudeUsage(parsed.data, now, previous);
}
function claudeUsage(
  info: z.infer<typeof CLAUDE_LIMIT>,
  now: string,
  previous: AiSubscriptionUsage | undefined,
): AiSubscriptionUsage {
  const id = info.rateLimitType ?? 'unknown';
  const window = {
    id,
    label: id,
    used_percent: info.utilization === undefined ? null : info.utilization * 100,
    resets_at: info.resetsAt === undefined ? null : new Date(info.resetsAt * 1000).toISOString(),
    window_duration_mins: null,
  };
  return AI_SUBSCRIPTION_USAGE.parse({
    runtime: 'claude',
    reported_at: now,
    status: 'reported',
    windows: [
      ...(previous?.runtime === 'claude' ? previous.windows.filter((item) => item.id !== id) : []),
      window,
    ],
  });
}
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
  if (value.rateLimitsByLimitId !== null) return Object.entries(value.rateLimitsByLimitId);
  if (value.rateLimits === null) return [];
  return [['account', value.rateLimits]];
}
