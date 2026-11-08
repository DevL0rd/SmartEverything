import { z } from 'zod';
import { AI_SUBSCRIPTION_USAGE, subscriptionQuotaExhausted } from '@smarteverything/domain';
import type { AiSubscriptionUsage, SubscriptionQuotaPolicy } from '@smarteverything/domain';
import { CODEX_SUBSCRIPTION_CREDENTIAL } from '../credentials/contracts';
import type { CodexSubscriptionCredential } from '../credentials/contracts';
import { assertCodexIdentityCandidate } from '../authorization/codex-identity';
import { subscriptionJson } from '../authorization/http';
import { SubscriptionProviderError } from './errors';
import { codexAccessVersion } from './codex-admission';
import type { SubscriptionBillingSnapshot } from './billing';

const USAGE_TIMEOUT_MS = 10_000;
const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_SECOND = 1000;
const CODEX_WINDOW = z.object({
  used_percent: z.number().nonnegative(),
  limit_window_seconds: z.int().positive().nullable().catch(null),
  reset_at: z.int().positive().nullable().catch(null),
});
const ROUTE_RESET = AI_SUBSCRIPTION_USAGE.shape.windows.element.shape.resets_at.catch(null);
const CODEX_LIMIT = z.object({
  allowed: z.boolean(),
  limit_reached: z.boolean(),
});
const CODEX_USAGE = z.object({
  account_id: z.string().min(1),
  user_id: z.string().min(1).nullish(),
  rate_limit: CODEX_LIMIT.extend({
    primary_window: CODEX_WINDOW.nullable().catch(null),
    secondary_window: CODEX_WINDOW.nullable().catch(null),
  }),
  spend_control: z.object({ reached: z.boolean() }).nullish(),
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
): Promise<Pick<SubscriptionBillingSnapshot, 'state' | 'message' | 'codexProof' | 'usage'>> {
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
  const completedAt = Date.now();
  const snapshot = codexUsage(usage.rate_limit, completedAt);
  return {
    ...codexAssessment(usage),
    ...(snapshot === undefined ? {} : { usage: snapshot }),
    codexProof: {
      identityCandidate: candidate,
      routeId: frozen.routeId,
      accessVersion: codexAccessVersion(frozen.access),
      completedAt,
    },
  };
}

function codexUsage(
  limit: z.infer<typeof CODEX_USAGE>['rate_limit'],
  observedAt: number,
): AiSubscriptionUsage | undefined {
  const slots = [
    { id: 'primary', label: 'Primary window', value: limit.primary_window },
    { id: 'secondary', label: 'Secondary window', value: limit.secondary_window },
  ];
  const windows = slots.flatMap(({ id, label, value }) => {
    if (value === null) return [];
    return [
      {
        id,
        label,
        used_percent: value.used_percent,
        resets_at: codexReset(value.reset_at),
        window_duration_mins:
          value.limit_window_seconds === null
            ? null
            : value.limit_window_seconds / SECONDS_PER_MINUTE,
      },
    ];
  });
  if (windows.length === 0) return undefined;
  return {
    runtime: 'codex',
    reported_at: new Date(observedAt).toISOString(),
    status: 'reported',
    windows,
  };
}

function codexReset(seconds: number | null): string | null {
  if (seconds === null) return null;
  const date = new Date(seconds * MILLISECONDS_PER_SECOND);
  return Number.isNaN(date.getTime()) ? null : ROUTE_RESET.parse(date.toISOString());
}

function codexAssessment(
  usage: z.infer<typeof CODEX_USAGE>,
): Pick<SubscriptionBillingSnapshot, 'state' | 'message'> {
  if (subscriptionQuotaExhausted(codexQuotas(usage)))
    return {
      state: 'quota_exhausted',
      message: 'Codex reports that usage is exhausted or restricted for this account.',
    };
  return {
    state: 'disabled',
    message:
      'Codex reports usage available for the enrolled account. A fresh authenticated usage response matches the enrolled account and user. Usage is rechecked before every request.',
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
  };
}
