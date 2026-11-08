import { z } from 'zod';
import { subscriptionQuotaExhausted } from '@smarteverything/domain';
import type { SubscriptionQuotaPolicy } from '@smarteverything/domain';
import type { CodexClient } from './client';
import type { RpcRecord } from './protocol';
import { CodexRuntimeError } from './errors';
const WINDOW = z.object({
  usedPercent: z.number().min(0),
  windowDurationMins: z.number().positive().nullable().default(null),
  resetsAt: z.number().nullable().default(null),
});
const INDIVIDUAL_LIMIT = z.object({
  limit: z.string(),
  used: z.string(),
  remainingPercent: z.int(),
  resetsAt: z.int(),
});
const SNAPSHOT = z.object({
  limitId: z.string().nullable().default(null),
  limitName: z.string().nullable().default(null),
  normalModelSlug: z.string().nullable().default(null),
  primary: WINDOW.nullable().default(null),
  secondary: WINDOW.nullable().default(null),
  credits: z.json().default(null),
  rateLimitReachedType: z.string().nullable().default(null),
  spendControlReached: z.boolean().nullable().default(null),
  individualLimit: INDIVIDUAL_LIMIT.nullable().default(null),
});
const RESPONSE = z.object({
  ordinaryUsageAllowed: z.boolean().nullable().default(null),
  rateLimits: SNAPSHOT,
  rateLimitsByLimitId: z.record(z.string(), SNAPSHOT).nullable().default(null),
});
export async function readRateLimits(
  client: Pick<CodexClient, 'request'>,
): Promise<RpcRecord | null> {
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
      reason: 'Codex cannot verify usage availability for this account.',
    };
  const usage = parsed.data;
  const buckets = [usage.rateLimits, ...Object.values(usage.rateLimitsByLimitId ?? {})];
  if (
    subscriptionQuotaExhausted(
      buckets.map((bucket) => quotaPolicy(bucket, usage.ordinaryUsageAllowed === true)),
    )
  )
    return {
      code: 'native_quota_exhausted',
      reason: 'Codex reports that usage is exhausted or restricted for this account.',
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
