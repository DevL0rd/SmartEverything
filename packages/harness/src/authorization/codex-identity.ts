import { decodeJwt } from 'jose';
import { z } from 'zod';
import { CODEX_IDENTITY_CANDIDATE, CODEX_IDENTITY_ID } from '../credentials/codex-identity';
import type { CodexIdentityCandidate } from '../credentials/codex-identity';
import { SubscriptionProviderError } from '../providers/errors';

const ACCESS_ENVELOPE = z
  .string()
  .max(32768)
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
const ACCESS_IDENTITY = z.object({
  'https://api.openai.com/auth': z.object({
    chatgpt_account_id: CODEX_IDENTITY_ID,
    chatgpt_user_id: CODEX_IDENTITY_ID.optional(),
    user_id: CODEX_IDENTITY_ID.optional(),
    chatgpt_account_is_fedramp: z.boolean().optional(),
  }),
});

export class CodexIdentityChangedError extends SubscriptionProviderError {
  constructor() {
    super(
      'AUTH_INVALID',
      'Codex own account or user identity is unavailable or changed. Sign in again.',
    );
  }
}

class CodexRouteUnsupportedError extends SubscriptionProviderError {
  constructor() {
    super('AUTH_DENIED', 'Own Codex subscription transport does not support FedRAMP accounts.');
  }
}

export function codexIdentityCandidate(access: string, accountId: string): CodexIdentityCandidate {
  try {
    const claims = ACCESS_IDENTITY.parse(decodeJwt(ACCESS_ENVELOPE.parse(access)));
    const identity = claims['https://api.openai.com/auth'];
    if (identity.chatgpt_account_is_fedramp === true) throw new CodexRouteUnsupportedError();
    if (
      identity.chatgpt_account_id !== accountId ||
      (identity.chatgpt_user_id !== undefined &&
        identity.user_id !== undefined &&
        identity.chatgpt_user_id !== identity.user_id)
    )
      throw new CodexIdentityChangedError();
    return CODEX_IDENTITY_CANDIDATE.parse({
      accountId: identity.chatgpt_account_id,
      userId: identity.chatgpt_user_id ?? identity.user_id,
    });
  } catch (cause) {
    if (cause instanceof SubscriptionProviderError) throw cause;
    if (!(cause instanceof Error)) throw cause;
    throw new CodexIdentityChangedError();
  }
}

export function assertCodexIdentityCandidate(
  access: string,
  accountId: string,
  enrolled: CodexIdentityCandidate | undefined,
): CodexIdentityCandidate {
  const candidate = codexIdentityCandidate(access, accountId);
  if (candidate.accountId !== enrolled?.accountId || candidate.userId !== enrolled.userId)
    throw new CodexIdentityChangedError();
  return candidate;
}
