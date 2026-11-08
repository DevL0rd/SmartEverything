import { z } from 'zod';
export * from './ai-subscription-policy';
export const AI_SUBSCRIPTION_USAGE = z.strictObject({
  runtime: z.enum(['claude', 'codex']),
  reported_at: z.iso.datetime({ offset: true }),
  status: z.enum(['reported', 'unavailable']),
  windows: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(300),
        label: z.string().min(1).max(300),
        used_percent: z.number().nonnegative().nullable(),
        resets_at: z.iso.datetime({ offset: true }).nullable(),
        window_duration_mins: z.number().positive().nullable(),
      }),
    )
    .max(200),
});
export type AiSubscriptionUsage = z.infer<typeof AI_SUBSCRIPTION_USAGE>;

export const SUBSCRIPTION_WEEK_MINUTES = 7 * 24 * 60;

interface WindowIdentity {
  readonly id: string;
  readonly window_duration_mins: number | null;
}

const CODEX_ACCOUNT_SLOTS = ['primary', 'secondary'] as const;
const CODEX_ACCOUNT_BUCKETS = ['codex', 'account'] as const;
const CODEX_ACCOUNT_IDS = [
  CODEX_ACCOUNT_SLOTS,
  ...CODEX_ACCOUNT_BUCKETS.map((bucket) =>
    CODEX_ACCOUNT_SLOTS.map((slot) => JSON.stringify([bucket, slot])),
  ),
];

export function weeklySubscriptionWindow<T extends WindowIdentity>(
  usage:
    | { readonly runtime: AiSubscriptionUsage['runtime']; readonly windows: readonly T[] }
    | undefined,
): T | undefined {
  if (usage === undefined) return undefined;
  if (usage.runtime === 'claude')
    return usage.windows.find(
      ({ id, window_duration_mins: minutes }) =>
        id === 'seven_day' && (minutes === null || minutes === SUBSCRIPTION_WEEK_MINUTES),
    );
  const weekly = usage.windows.filter(
    ({ window_duration_mins }) => window_duration_mins === SUBSCRIPTION_WEEK_MINUTES,
  );
  for (const ids of CODEX_ACCOUNT_IDS) {
    const matches = weekly.filter((window) => ids.some((id) => id === window.id));
    if (matches.length > 0) return matches.length === 1 ? matches[0] : undefined;
  }
  return undefined;
}

export const AI_SUBSCRIPTION_USAGE_NOTICE = z.strictObject({
  type: z.literal('ai_subscription_usage_changed'),
  profile_id: z.uuid(),
  source: z.enum(['native', 'route']),
});
