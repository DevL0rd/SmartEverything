import { randomUUID } from 'node:crypto';
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic';
import type { OAuthAuth, ProviderAuthInteraction } from '@earendil-works/pi-ai';
import { CLAUDE_SUBSCRIPTION_CREDENTIAL } from '../credentials/contracts';
import type { ClaudeSubscriptionCredential } from '../credentials/contracts';
import type { SubscriptionCredentials } from '../credentials/service';
import { SubscriptionProviderError } from '../providers/errors';
import {
  ClaudeOAuthProfile,
  assertClaudeProfile,
  ClaudeAccountChangedError,
} from './claude-profile';
import type { ClaudeProfilePort } from './claude-profile';

const CLAUDE_ENROLLMENT_BINDING = CLAUDE_SUBSCRIPTION_CREDENTIAL.omit({
  identity: true,
  refresh: true,
  expires: true,
}).strip();

export class ClaudeAuthorization {
  private readonly oauth: OAuthAuth;

  constructor(
    private readonly credentials: SubscriptionCredentials,
    private readonly profile: ClaudeProfilePort = new ClaudeOAuthProfile(),
  ) {
    const oauth = anthropicProvider().auth.oauth;
    if (oauth === undefined)
      throw new SubscriptionProviderError(
        'PROVIDER_UNAVAILABLE',
        'Pinned Pi provider has no Claude subscription OAuth implementation.',
      );
    this.oauth = oauth;
  }

  async login(
    routeId: string,
    interaction: ProviderAuthInteraction,
    subscriberProfileId?: string,
  ): Promise<void> {
    const previous = await this.credentials.read(routeId);
    let state: string | null = null;
    const guarded: ProviderAuthInteraction = {
      signal: interaction.signal,
      notify: (event) => {
        if (event.type === 'auth_url') state = new URL(event.url).searchParams.get('state');
        interaction.notify(event);
      },
      prompt: async (prompt) => {
        const answer = await interaction.prompt(prompt);
        if (prompt.type === 'manual_code') this.assertManualState(answer, state);
        return answer;
      },
    };
    try {
      const token = await this.oauth.login(guarded);
      const credential = await this.identified(
        CLAUDE_SUBSCRIPTION_CREDENTIAL.parse({
          kind: 'claude-subscription',
          routeId,
          hostId: this.credentials.hostId,
          generation: randomUUID(),
          access: token.access,
          refresh: token.refresh,
          expires: token.expires,
          ...(subscriberProfileId === undefined ? {} : { subscriberProfileId }),
        }),
        interaction.signal,
      );
      interaction.signal.throwIfAborted();
      await this.store(credential, previous?.generation, interaction.signal);
    } catch (error) {
      if (interaction.signal.aborted) interaction.signal.throwIfAborted();
      throw new SubscriptionProviderError(
        'AUTH_INVALID',
        `Claude subscription authorization failed (${error instanceof Error ? error.name : 'unknown'}).`,
      );
    }
  }

  private store(
    credential: ClaudeSubscriptionCredential,
    expectedGeneration: string | undefined,
    signal: AbortSignal,
  ): Promise<void> {
    return this.credentials.modify(
      credential.routeId,
      (current) => {
        signal.throwIfAborted();
        if (current?.generation !== expectedGeneration)
          throw new SubscriptionProviderError(
            'AUTH_INVALID',
            'Subscription route changed during Claude authorization.',
          );
        return Promise.resolve({ credential, result: undefined });
      },
      signal,
    );
  }
  async refresh(
    credential: ClaudeSubscriptionCredential,
    signal: AbortSignal,
  ): Promise<ClaudeSubscriptionCredential> {
    try {
      const token = await this.oauth.refresh(
        {
          type: 'oauth',
          access: credential.access,
          refresh: credential.refresh,
          expires: credential.expires,
        },
        signal,
      );
      const next = CLAUDE_SUBSCRIPTION_CREDENTIAL.parse({
        ...credential,
        access: token.access,
        refresh: token.refresh,
        expires: token.expires,
      });
      return await this.identified(next, signal);
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof SubscriptionProviderError) throw error;
      throw new SubscriptionProviderError(
        'AUTH_INVALID',
        `Claude subscription refresh failed (${error instanceof Error ? error.name : 'unknown'}).`,
      );
    }
  }

  async bindIdentity(
    credential: ClaudeSubscriptionCredential,
    signal: AbortSignal,
  ): Promise<ClaudeSubscriptionCredential> {
    const selected = CLAUDE_SUBSCRIPTION_CREDENTIAL.parse(credential);
    const identified = await this.identified(selected, signal);
    return this.credentials.modify(
      selected.routeId,
      (current) => {
        signal.throwIfAborted();
        if (current?.kind !== 'claude-subscription')
          throw new SubscriptionProviderError(
            'AUTH_INVALID',
            'Claude enrollment provider changed during profile discovery.',
          );
        if (
          JSON.stringify(CLAUDE_ENROLLMENT_BINDING.parse(current)) !==
          JSON.stringify(CLAUDE_ENROLLMENT_BINDING.parse(selected))
        )
          throw new SubscriptionProviderError(
            'AUTH_INVALID',
            'Claude enrollment or initiating principal changed during profile discovery.',
          );
        this.assertIdentity(current, identified);
        const bound =
          current.identity === undefined
            ? CLAUDE_SUBSCRIPTION_CREDENTIAL.parse({ ...current, identity: identified.identity })
            : current;
        return Promise.resolve({ credential: bound, result: bound });
      },
      signal,
    );
  }

  private assertIdentity(
    current: ClaudeSubscriptionCredential,
    identified: ClaudeSubscriptionCredential,
  ): void {
    if (current.identity === undefined) return;
    if (
      current.identity.accountId !== identified.identity?.accountId ||
      current.identity.organizationId !== identified.identity.organizationId
    )
      throw new ClaudeAccountChangedError();
  }

  private async identified(
    credential: ClaudeSubscriptionCredential,
    signal: AbortSignal,
  ): Promise<ClaudeSubscriptionCredential> {
    const startedAt = Date.now();
    signal.throwIfAborted();
    const profile = assertClaudeProfile(
      credential,
      await this.profile.read(credential, signal),
      startedAt,
    );
    signal.throwIfAborted();
    return CLAUDE_SUBSCRIPTION_CREDENTIAL.parse({ ...credential, identity: profile.identity });
  }

  private assertManualState(answer: string, expected: string | null): void {
    let state: string | null;
    if (answer.includes('#')) state = answer.split('#')[1] ?? null;
    else state = new URL(answer).searchParams.get('state');
    if (expected === null || state !== expected)
      throw new SubscriptionProviderError(
        'AUTH_INVALID',
        'Claude manual authorization requires the original state with the code.',
      );
  }
}
