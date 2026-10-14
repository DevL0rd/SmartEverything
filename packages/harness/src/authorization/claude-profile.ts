import { z } from 'zod';
import { CLAUDE_ACCOUNT_IDENTITY, CLAUDE_SUBSCRIPTION_CREDENTIAL } from '../credentials/contracts';
import type { ClaudeSubscriptionCredential } from '../credentials/contracts';
import { SubscriptionProviderError } from '../providers/errors';
import { subscriptionJson } from './http';

const PROFILE_TIMEOUT_MS = 10_000;
const PROFILE = z.object({
  account: z.object({ uuid: z.uuid() }),
  organization: z.object({ uuid: z.uuid() }),
});
const PROFILE_SNAPSHOT = z.strictObject({
  identity: CLAUDE_ACCOUNT_IDENTITY,
  generation: z.uuid(),
  hostId: z.uuid(),
  checkedAt: z.number().int().positive(),
});
export type ClaudeProfileSnapshot = z.infer<typeof PROFILE_SNAPSHOT>;
export interface ClaudeProfilePort {
  read(
    credential: ClaudeSubscriptionCredential,
    signal: AbortSignal,
  ): Promise<ClaudeProfileSnapshot>;
}
export class ClaudeAccountChangedError extends SubscriptionProviderError {
  constructor() {
    super('AUTH_INVALID', 'Claude authenticated account or organization changed. Sign in again.');
  }
}
export class ClaudeOAuthProfile implements ClaudeProfilePort {
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  async read(
    credential: ClaudeSubscriptionCredential,
    signal: AbortSignal,
  ): Promise<ClaudeProfileSnapshot> {
    const selected = CLAUDE_SUBSCRIPTION_CREDENTIAL.parse(credential);
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(PROFILE_TIMEOUT_MS)]);
    bounded.throwIfAborted();
    const profile = PROFILE.parse(
      await subscriptionJson(this.fetcher, 'https://api.anthropic.com/api/oauth/profile', {
        signal: bounded,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${selected.access}`,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'User-Agent': 'SmartEverything',
        },
      }),
    );
    bounded.throwIfAborted();
    return {
      identity: { accountId: profile.account.uuid, organizationId: profile.organization.uuid },
      generation: selected.generation,
      hostId: selected.hostId,
      checkedAt: Date.now(),
    };
  }
}
export function assertClaudeProfile(
  credential: ClaudeSubscriptionCredential,
  raw: ClaudeProfileSnapshot,
  startedAt: number,
): ClaudeProfileSnapshot {
  const snapshot = PROFILE_SNAPSHOT.parse(raw);
  if (
    snapshot.generation !== credential.generation ||
    snapshot.hostId !== credential.hostId ||
    snapshot.checkedAt < startedAt ||
    snapshot.checkedAt > Date.now()
  )
    throw new SubscriptionProviderError(
      'AUTH_INVALID',
      'Claude profile proof is stale or changed.',
    );
  if (
    credential.identity !== undefined &&
    (snapshot.identity.accountId !== credential.identity.accountId ||
      snapshot.identity.organizationId !== credential.identity.organizationId)
  )
    throw new ClaudeAccountChangedError();
  return snapshot;
}
