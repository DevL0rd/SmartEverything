import { z } from 'zod';
import { SUBSCRIPTION_CREDIT_BALANCE, subscriptionUsagePolicy } from '@smarteverything/domain';
import type { SubscriptionQuotaPolicy } from '@smarteverything/domain';
import type { CodexClient } from './client';
import type { RpcRecord } from './protocol';
import { CodexRuntimeError } from './errors';
const WINDOW = z.object({
  usedPercent: z.number().min(0),
  windowDurationMins: z.number().positive().nullable(),
  resetsAt: z.number().nullable(),
});
const CREDITS = z.object({
  hasCredits: z.boolean(),
  unlimited: z.boolean(),
  balance: SUBSCRIPTION_CREDIT_BALANCE.nullable().default(null),
});
const INDIVIDUAL_LIMIT = z.object({
  limit: z.string(),
  used: z.string(),
  remainingPercent: z.int(),
  resetsAt: z.int(),
});
const SNAPSHOT = z.object({
  limitId: z.string().nullable(),
  limitName: z.string().nullable(),
  normalModelSlug: z.string().nullable(),
  primary: WINDOW.nullable(),
  secondary: WINDOW.nullable(),
  credits: CREDITS.nullable().default(null),
  rateLimitReachedType: z.string().nullable().default(null),
  spendControlReached: z.boolean().nullable().default(null),
  individualLimit: INDIVIDUAL_LIMIT.nullable().default(null),
});
const RESPONSE = z.object({
  ordinaryUsageAllowed: z.boolean().nullable(),
  rateLimits: SNAPSHOT,
  rateLimitsByLimitId: z.record(z.string(), SNAPSHOT).nullable(),
});
export async function readRateLimits(client: CodexClient): Promise<RpcRecord | null> {
  try {
    return RESPONSE.parse(
      await client.request('account/rateLimits/read', {
        supportsLunaReserve: false,
        excludeResetCreditDetails: true,
      }),
    );
  } catch (cause) {
    if (cause instanceof z.ZodError || (cause instanceof CodexRuntimeError && !cause.uncertain))
      return null;
    throw cause;
  }
}
export interface CodexBillingBlock {
  readonly code: string;
  readonly reason: string;
}
export function subscriptionBillingBlock(raw: RpcRecord | null): CodexBillingBlock | null {
  const parsed = RESPONSE.safeParse(raw);
  if (!parsed.success || parsed.data.ordinaryUsageAllowed === null)
    return {
      code: 'native_billing_policy_unknown',
      reason:
        'Codex cannot verify account-bound included usage and credit policy. Subscription inference is blocked.',
    };
  const usage = parsed.data;
  const buckets = [usage.rateLimits, ...Object.values(usage.rateLimitsByLimitId ?? {})];
  if (usage.rateLimits.credits === null)
    return {
      code: 'native_billing_policy_unknown',
      reason:
        'Codex did not report authoritative account credits. Subscription inference is blocked.',
    };
  const state = subscriptionUsagePolicy(
    buckets.flatMap((bucket) => (bucket.credits === null ? [] : [bucket.credits])),
    buckets.map((bucket) => quotaPolicy(bucket, usage.ordinaryUsageAllowed === true)),
  );
  if (state === 'paid_usage_enabled')
    return {
      code: 'native_paid_credits_available',
      reason:
        'Codex reports spendable or unlimited credits. Subscription-only inference is blocked while credits are available.',
    };
  if (state === 'quota_exhausted')
    return {
      code: 'native_quota_exhausted',
      reason:
        'Codex included subscription usage is exhausted or restricted. No credit, reset or API fallback will be used.',
    };
  return null;
}
export function requireSubscriptionBilling(raw: RpcRecord | null): void {
  const blocked = subscriptionBillingBlock(raw);
  if (blocked !== null) throw new CodexRuntimeError(blocked.code, blocked.reason);
}
function quotaPolicy(bucket: z.infer<typeof SNAPSHOT>, allowed: boolean): SubscriptionQuotaPolicy {
  return {
    allowed,
    restricted: bucket.rateLimitReachedType !== null || bucket.spendControlReached === true,
    remainingPercent: bucket.individualLimit?.remainingPercent ?? null,
    usedPercents: [bucket.primary, bucket.secondary].flatMap((window) =>
      window === null ? [] : [window.usedPercent],
    ),
  };
}
export function updatedRateLimits(previous: RpcRecord | null, raw: unknown): RpcRecord {
  const incoming = SNAPSHOT.parse(raw);
  const known = previous === null ? null : RESPONSE.parse(previous);
  const rateLimits = mergeSnapshot(previousSnapshot(known, incoming.limitId), incoming);
  return {
    ...previous,
    ordinaryUsageAllowed: null,
    rateLimits,
    rateLimitsByLimitId:
      rateLimits.limitId === null
        ? (known?.rateLimitsByLimitId ?? null)
        : {
            ...known?.rateLimitsByLimitId,
            [rateLimits.limitId]: rateLimits,
          },
  };
}
function mergeSnapshot(
  previous: z.infer<typeof SNAPSHOT> | undefined,
  incoming: z.infer<typeof SNAPSHOT>,
): z.infer<typeof SNAPSHOT> {
  const available = Object.fromEntries(
    Object.entries(incoming).filter((entry) => entry[1] !== null),
  );
  return SNAPSHOT.parse({ ...incoming, ...previous, ...available });
}

function previousSnapshot(
  known: z.infer<typeof RESPONSE> | null,
  id: string | null,
): z.infer<typeof SNAPSHOT> | undefined {
  if (id === null) return known?.rateLimits;
  const bucket = known?.rateLimitsByLimitId?.[id];
  if (bucket !== undefined) return bucket;
  return known?.rateLimits.limitId === id ? known.rateLimits : undefined;
}
