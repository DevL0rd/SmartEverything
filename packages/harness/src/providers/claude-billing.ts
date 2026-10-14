import { z } from 'zod';
import { CLAUDE_SUBSCRIPTION_CREDENTIAL } from '../credentials/contracts';
import type { ClaudeSubscriptionCredential } from '../credentials/contracts';
import { assertClaudeProfile } from '../authorization/claude-profile';
import type { ClaudeProfilePort } from '../authorization/claude-profile';
import { subscriptionJson } from '../authorization/http';
import { SubscriptionProviderError } from './errors';
import type { SubscriptionBillingSnapshot } from './billing';

const USAGE_TIMEOUT_MS = 5_000;
const CLAUDE_WINDOW = z.object({
  utilization: z.number().min(0),
  resets_at: z.string().nullable(),
});
const CLAUDE_USAGE = z.object({
  extra_usage: z.object({ is_enabled: z.boolean() }),
  five_hour: CLAUDE_WINDOW,
  seven_day: CLAUDE_WINDOW,
});
export async function claudeBilling(
  credential: ClaudeSubscriptionCredential,
  signal: AbortSignal,
  profile: ClaudeProfilePort,
  fetcher: typeof fetch,
): Promise<Pick<SubscriptionBillingSnapshot, 'state' | 'message' | 'identity'>> {
  const frozen = Object.freeze(CLAUDE_SUBSCRIPTION_CREDENTIAL.parse(credential));
  if (frozen.identity === undefined)
    throw new SubscriptionProviderError(
      'AUTH_REQUIRED',
      'Claude enrolled account identity is unavailable. Refresh the supplying host status.',
    );
  Object.freeze(frozen.identity);
  const startedAt = Date.now();
  signal.throwIfAborted();
  assertClaudeProfile(frozen, await profile.read(frozen, signal), startedAt);
  signal.throwIfAborted();
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(USAGE_TIMEOUT_MS)]);
  const usage = CLAUDE_USAGE.parse(
    await subscriptionJson(fetcher, 'https://api.anthropic.com/api/oauth/usage', {
      signal: bounded,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${frozen.access}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'Cache-Control': 'no-cache',
      },
    }),
  );
  bounded.throwIfAborted();
  const afterUsage = Date.now();
  const after = assertClaudeProfile(frozen, await profile.read(frozen, signal), afterUsage);
  signal.throwIfAborted();
  return { ...claudeAssessment(usage), identity: after.identity };
}
function claudeAssessment(
  usage: z.infer<typeof CLAUDE_USAGE>,
): Pick<SubscriptionBillingSnapshot, 'state' | 'message'> {
  if (usage.extra_usage.is_enabled)
    return {
      state: 'paid_usage_enabled',
      message:
        'Claude paid extra usage is enabled. Disable it in Claude Settings → Usage before using this route.',
    };
  if (usage.five_hour.utilization >= 100 || usage.seven_day.utilization >= 100)
    return {
      state: 'quota_exhausted',
      message:
        'Claude included subscription usage is exhausted. This route will not use extra usage.',
    };
  return {
    state: 'disabled',
    message:
      'Claude reports paid extra usage disabled and included quota available for the enrolled account and organization, verified before and after ordinary usage. This snapshot is rechecked before every request; later provider settings or account changes cannot be atomically excluded.',
  };
}
