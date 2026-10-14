import { z } from 'zod';
import { SUBSCRIPTION_CREDIT_BALANCE, subscriptionUsagePolicy } from '@smarteverything/domain';
import type { SubscriptionQuotaPolicy } from '@smarteverything/domain';
import { CODEX_SUBSCRIPTION_CREDENTIAL } from '../credentials/contracts';
import type { CodexSubscriptionCredential } from '../credentials/contracts';
import { assertCodexIdentityCandidate } from '../authorization/codex-identity';
import { subscriptionJson } from '../authorization/http';
import { SubscriptionProviderError } from './errors';
import { codexAccessVersion } from './codex-admission';
import type { SubscriptionBillingSnapshot } from './billing';

const USAGE_TIMEOUT_MS = 10_000;
const CODEX_WINDOW = z.object({
  used_percent: z.int32().nonnegative(),
  limit_window_seconds: z.int32(),
  reset_after_seconds: z.int32(),
  reset_at: z.int32(),
});
const CODEX_LIMIT = z.object({
  allowed: z.boolean(),
  limit_reached: z.boolean(),
  primary_window: CODEX_WINDOW.nullish(),
  secondary_window: CODEX_WINDOW.nullish(),
});
const CODEX_INDIVIDUAL_LIMIT = z.object({
  source: z.string().nullish(),
  limit: z.string(),
  used: z.string(),
  remaining: z.string(),
  used_percent: z.int32(),
  remaining_percent: z.int32(),
  reset_after_seconds: z.int32(),
  reset_at: z.int32(),
});
const CODEX_USAGE = z.object({
  account_id: z.string().min(1),
  user_id: z.string().min(1).nullish(),
  credits: z.object({
    has_credits: z.boolean(),
    unlimited: z.boolean(),
    balance: SUBSCRIPTION_CREDIT_BALANCE.nullish(),
  }),
  rate_limit: CODEX_LIMIT,
  spend_control: z
    .object({ reached: z.boolean(), individual_limit: CODEX_INDIVIDUAL_LIMIT.nullish() })
    .nullish(),
  rate_limit_reached_type: z
    .object({
      type: z.enum([
        'rate_limit_reached',
        'workspace_owner_credits_depleted',
        'workspace_member_credits_depleted',
        'workspace_owner_usage_limit_reached',
        'workspace_member_usage_limit_reached',
      ]),
    })
    .nullish(),
  additional_rate_limits: z
    .array(
      z.object({
        limit_name: z.string(),
        metered_feature: z.string(),
        normal_model_slug: z.string().nullish(),
        rate_limit: CODEX_LIMIT.nullish(),
      }),
    )
    .nullish(),
});
export async function codexBilling(
  credential: CodexSubscriptionCredential,
  signal: AbortSignal,
  fetcher: typeof fetch,
): Promise<Pick<SubscriptionBillingSnapshot, 'state' | 'message' | 'codexProof'>> {
  const frozen = Object.freeze(CODEX_SUBSCRIPTION_CREDENTIAL.parse(credential));
  const candidate = Object.freeze(
    assertCodexIdentityCandidate(frozen.access, frozen.accountId, frozen.identityCandidate),
  );
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(USAGE_TIMEOUT_MS)]);
  bounded.throwIfAborted();
  const usage = CODEX_USAGE.parse(
    await subscriptionJson(fetcher, 'https://chatgpt.com/backend-api/wham/usage', {
      method: 'GET',
      signal: bounded,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${frozen.access}`,
        'ChatGPT-Account-Id': frozen.accountId,
        'Cache-Control': 'no-cache',
      },
    }),
  );
  bounded.throwIfAborted();
  if (usage.account_id !== candidate.accountId || usage.user_id !== candidate.userId)
    throw new SubscriptionProviderError(
      'PLAN_ONLY_UNVERIFIED',
      'Codex ordinary usage does not match the own enrolled account and user.',
    );
  return {
    ...codexAssessment(usage),
    codexProof: {
      identityCandidate: candidate,
      routeId: frozen.routeId,
      accessVersion: codexAccessVersion(frozen.access),
      completedAt: Date.now(),
    },
  };
}

function codexAssessment(
  usage: z.infer<typeof CODEX_USAGE>,
): Pick<SubscriptionBillingSnapshot, 'state' | 'message'> {
  const state = subscriptionUsagePolicy(
    [
      {
        hasCredits: usage.credits.has_credits,
        unlimited: usage.credits.unlimited,
        balance: usage.credits.balance ?? null,
      },
    ],
    codexQuotas(usage),
  );
  if (state === 'paid_usage_enabled')
    return {
      state,
      message:
        'Codex reports spendable or unlimited credits. Subscription-only inference is blocked while credits are available.',
    };
  if (state === 'quota_exhausted')
    return {
      state,
      message:
        'Codex included subscription usage is exhausted or restricted. No credit or API route will be used.',
    };
  return {
    state,
    message:
      'Codex reports no spendable credits and included usage allowed for the selected enrolled account. A fresh authenticated ordinary usage response matches both the own enrolled access-credential account and user candidates. This timestamped snapshot is rechecked before every request; later provider settings or account changes cannot be atomically excluded.',
  };
}

function codexQuotas(usage: z.infer<typeof CODEX_USAGE>): readonly SubscriptionQuotaPolicy[] {
  const primary = quotaPolicy(usage.rate_limit);
  return [
    {
      ...primary,
      restricted:
        primary.restricted ||
        (usage.rate_limit_reached_type !== null && usage.rate_limit_reached_type !== undefined) ||
        usage.spend_control?.reached === true,
      remainingPercent: usage.spend_control?.individual_limit?.remaining_percent ?? null,
    },
    ...(usage.additional_rate_limits ?? []).map((entry) => quotaPolicy(entry.rate_limit)),
  ];
}

function quotaPolicy(
  limit: z.infer<typeof CODEX_LIMIT> | null | undefined,
): SubscriptionQuotaPolicy {
  return {
    allowed: limit?.allowed ?? true,
    restricted: limit?.limit_reached === true,
    remainingPercent: null,
    usedPercents: [limit?.primary_window, limit?.secondary_window].flatMap((window) =>
      window === null || window === undefined ? [] : [window.used_percent],
    ),
  };
}
