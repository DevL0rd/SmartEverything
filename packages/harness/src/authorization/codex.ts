import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import type { OAuthAuth, ProviderAuthInteraction } from '@earendil-works/pi-ai';
import { CODEX_SUBSCRIPTION_CREDENTIAL } from '../credentials/contracts';
import type { CodexSubscriptionCredential } from '../credentials/contracts';
import type { SubscriptionCredentials } from '../credentials/service';
import { SubscriptionProviderError } from '../providers/errors';
import {
  codexIdentityCandidate,
  assertCodexIdentityCandidate,
  CodexIdentityChangedError,
} from './codex-identity';

export class CodexAuthorization {
  private readonly oauth: OAuthAuth;
  constructor(private readonly credentials: SubscriptionCredentials) {
    const oauth = openaiCodexProvider().auth.oauth;
    if (oauth === undefined)
      throw new SubscriptionProviderError(
        'PROVIDER_UNAVAILABLE',
        'Pinned Pi has no Codex OAuth flow.',
      );
    this.oauth = oauth;
  }
  async login(
    routeId: string,
    interaction: ProviderAuthInteraction,
    subscriberProfileId?: string,
  ): Promise<void> {
    const previous = await this.credentials.read(routeId);
    const token = await this.oauth.login(interaction);
    interaction.signal.throwIfAborted();
    const accountId = z.string().min(1).parse(token['accountId']);
    const credential = CODEX_SUBSCRIPTION_CREDENTIAL.parse({
      access: token.access,
      refresh: token.refresh,
      expires: token.expires,
      kind: 'codex-subscription',
      routeId,
      hostId: this.credentials.hostId,
      generation: randomUUID(),
      ...(subscriberProfileId === undefined ? {} : { subscriberProfileId }),
      accountId,
      identityCandidate: codexIdentityCandidate(token.access, accountId),
    });
    await this.credentials.modify(
      routeId,
      (current) => {
        interaction.signal.throwIfAborted();
        if (current?.generation !== previous?.generation)
          throw new SubscriptionProviderError(
            'AUTH_INVALID',
            'Codex account changed during authorization.',
          );
        return Promise.resolve({ credential, result: undefined });
      },
      interaction.signal,
    );
  }
  async refresh(
    credential: CodexSubscriptionCredential,
    signal: AbortSignal,
  ): Promise<CodexSubscriptionCredential> {
    const enrolled = assertCodexIdentityCandidate(
      credential.access,
      credential.accountId,
      credential.identityCandidate,
    );
    const token = await this.oauth.refresh(
      {
        type: 'oauth',
        access: credential.access,
        refresh: credential.refresh,
        expires: credential.expires,
      },
      signal,
    );
    signal.throwIfAborted();
    if (token['accountId'] !== credential.accountId) throw new CodexIdentityChangedError();
    const candidate = assertCodexIdentityCandidate(token.access, credential.accountId, enrolled);
    return CODEX_SUBSCRIPTION_CREDENTIAL.parse({
      ...credential,
      generation: randomUUID(),
      identityCandidate: candidate,
      access: token.access,
      refresh: token.refresh,
      expires: token.expires,
    });
  }
}
