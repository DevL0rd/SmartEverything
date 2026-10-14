import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type {
  ChatgptSubscriptionCredential,
  SubscriptionCredential,
  ChatgptRegistration,
} from '../credentials/contracts';
import { SUBSCRIPTION_ROUTE_ID, CHATGPT_SUBSCRIPTION_CREDENTIAL } from '../credentials/contracts';
import type { SubscriptionCredentials } from '../credentials/service';
import { SubscriptionProviderError } from '../providers/errors';
import { SiwcIdentity } from './siwc-identity';
import {
  SIWC_AUTHORIZE,
  SIWC_TOKEN,
  SIWC_RESOURCE,
  SIWC_SCOPES,
  SIWC_TOKEN_RESPONSE,
  SIWC_ISSUER,
  SIWC_DISCOVERY,
  assertPlanScope,
} from './siwc-contracts';
import type { SiwcTokens } from './siwc-contracts';
import { subscriptionJson } from './http';

const ATTEMPT_LIFETIME_MS = 10 * 60 * 1000;
const MAX_PENDING_ATTEMPTS = 10;
const CALLBACK_URI = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === 'http:' &&
    url.hostname === '127.0.0.1' &&
    url.pathname === '/auth/callback' &&
    url.search === '' &&
    url.hash === '' &&
    url.username === '' &&
    url.password === ''
  );
});
interface SiwcAttempt {
  readonly routeId: string;
  readonly redirectUri: string;
  readonly verifier: string;
  readonly state: string;
  readonly nonce: string;
  readonly expires: number;
  readonly previous: ChatgptRegistration | undefined;
  readonly subscriberProfileId?: string;
  readonly expectedGeneration: string | undefined;
}

export class SiwcAuthorization {
  private readonly attempts = new Map<string, SiwcAttempt>();
  private readonly identity: SiwcIdentity;

  constructor(
    private readonly credentials: SubscriptionCredentials,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.identity = new SiwcIdentity(fetcher);
  }

  async begin(
    routeId: string,
    redirectUri: string,
    subscriberProfileId?: string,
  ): Promise<{ readonly attemptId: string; readonly url: string }> {
    SUBSCRIPTION_ROUTE_ID.parse(routeId);
    CALLBACK_URI.parse(redirectUri);
    this.pruneAttempts();
    const stored = await this.credentials.read(routeId);
    if (stored !== undefined && stored.kind !== 'chatgpt-subscription')
      throw new SubscriptionProviderError(
        'AUTH_INVALID',
        'Selected route has a different OAuth provider.',
      );
    const attempt: SiwcAttempt = {
      routeId,
      redirectUri,
      ...(subscriberProfileId === undefined ? {} : { subscriberProfileId }),
      previous: stored ?? (await this.credentials.registration(routeId)),
      expectedGeneration: stored?.generation,
      verifier: randomBytes(32).toString('base64url'),
      state: randomBytes(32).toString('base64url'),
      nonce: randomBytes(32).toString('base64url'),
      expires: Date.now() + ATTEMPT_LIFETIME_MS,
    };
    const attemptId = randomUUID();
    this.attempts.set(attemptId, attempt);
    const params = new URLSearchParams({
      client_id:
        attempt.previous === undefined ? 'dynamic_agent_client' : attempt.previous.clientId,
      ext_agent_host_id: `urn:uuid:${this.credentials.hostId}`,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: SIWC_SCOPES,
      resource: SIWC_RESOURCE,
      state: attempt.state,
      nonce: attempt.nonce,
      code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(attempt.verifier).digest('base64url'),
    });
    if (attempt.previous === undefined) params.set('agent_name_hint', 'SmartEverything');
    return { attemptId, url: `${SIWC_AUTHORIZE}?${params.toString()}` };
  }

  cancel(attemptId: string): void {
    this.attempts.delete(attemptId);
  }

  private pruneAttempts(): void {
    for (const [id, attempt] of this.attempts)
      if (attempt.expires < Date.now()) this.attempts.delete(id);
    if (this.attempts.size >= MAX_PENDING_ATTEMPTS)
      throw new SubscriptionProviderError(
        'AUTH_BUSY',
        'Too many pending ChatGPT authorization attempts. Cancel an earlier attempt.',
      );
  }

  async complete(attemptId: string, callbackUrl: string, signal: AbortSignal): Promise<void> {
    const attempt = this.attempts.get(attemptId);
    this.attempts.delete(attemptId);
    if (attempt === undefined || attempt.expires < Date.now())
      throw new SubscriptionProviderError(
        'AUTH_INVALID',
        'ChatGPT authorization attempt is expired, cancelled or already consumed.',
      );
    signal.throwIfAborted();
    const callback = this.callback(attempt, callbackUrl);
    const clientId = this.clientId(attempt, callback);
    const code = z.string().min(1).parse(callback.searchParams.get('code'));
    const tokens = SIWC_TOKEN_RESPONSE.parse(
      await subscriptionJson(this.fetcher, SIWC_TOKEN, {
        method: 'POST',
        signal,
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          code,
          code_verifier: attempt.verifier,
          redirect_uri: attempt.redirectUri,
          resource: SIWC_RESOURCE,
        }),
      }),
    );
    const idToken = z.string().min(1).parse(tokens.id_token);
    const identity = await this.identity.verify(idToken, clientId, signal, attempt.nonce);
    signal.throwIfAborted();
    if (attempt.previous !== undefined && identity.subject !== attempt.previous.subject)
      throw new SubscriptionProviderError(
        'AUTH_INVALID',
        'ChatGPT account identity changed during reauthorization.',
      );
    const credential = this.record(attempt, tokens, { ...identity, clientId, idToken });
    await this.credentials.modify(
      attempt.routeId,
      (current) => {
        signal.throwIfAborted();
        if (current?.generation !== attempt.expectedGeneration)
          throw new SubscriptionProviderError(
            'AUTH_INVALID',
            'Selected account changed while authorization was in progress.',
          );
        return Promise.resolve({ credential, result: undefined });
      },
      signal,
    );
  }

  async signOut(
    routeId: string,
    signal: AbortSignal,
  ): Promise<{ readonly remoteRevocationConfirmed: boolean }> {
    const previous = await this.credentials.modify(routeId, (current) => {
      if (current === undefined)
        return Promise.resolve({ credential: undefined, result: undefined });
      if (current.kind !== 'chatgpt-subscription')
        throw new SubscriptionProviderError(
          'AUTH_INVALID',
          'Selected route is not a ChatGPT registration.',
        );
      return Promise.resolve({ credential: undefined, result: current });
    });
    if (previous === undefined) return { remoteRevocationConfirmed: true };
    return { remoteRevocationConfirmed: await this.revoke(previous, signal) };
  }

  private async revoke(
    credential: ChatgptSubscriptionCredential,
    signal: AbortSignal,
  ): Promise<boolean> {
    try {
      const discovery = SIWC_DISCOVERY.parse(
        await subscriptionJson(this.fetcher, `${SIWC_ISSUER}/.well-known/openid-configuration`, {
          signal,
        }),
      );
      const response = await this.fetcher(discovery.revocation_endpoint, {
        method: 'POST',
        signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
        redirect: 'error',
        body: new URLSearchParams({
          token: credential.refresh,
          token_type_hint: 'refresh_token',
          client_id: credential.clientId,
        }),
      });
      return response.status === 200;
    } catch (error) {
      if (signal.aborted) signal.throwIfAborted();
      if (error instanceof Error) return false;
      throw new SubscriptionProviderError(
        'PROVIDER_UNAVAILABLE',
        'ChatGPT remote revocation failed with an unknown failure.',
      );
    }
  }

  private callback(attempt: SiwcAttempt, callbackUrl: string): URL {
    const callback = new URL(callbackUrl);
    if (
      `${callback.origin}${callback.pathname}` !== attempt.redirectUri ||
      callback.searchParams.getAll('state').length !== 1 ||
      callback.searchParams.get('state') !== attempt.state ||
      callback.searchParams.getAll('code').length > 1 ||
      callback.searchParams.getAll('client_id').length > 1
    )
      throw new SubscriptionProviderError(
        'AUTH_INVALID',
        'ChatGPT callback URI or state did not match.',
      );
    if (callback.searchParams.has('error'))
      throw new SubscriptionProviderError('AUTH_DENIED', 'ChatGPT authorization was declined.');
    return callback;
  }

  async refresh(
    credential: ChatgptSubscriptionCredential,
    signal: AbortSignal,
  ): Promise<ChatgptSubscriptionCredential> {
    const tokens = SIWC_TOKEN_RESPONSE.parse(
      await subscriptionJson(this.fetcher, SIWC_TOKEN, {
        method: 'POST',
        signal,
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: credential.clientId,
          refresh_token: credential.refresh,
          resource: SIWC_RESOURCE,
        }),
      }),
    );
    const identity =
      tokens.id_token === undefined
        ? undefined
        : await this.identity.verify(tokens.id_token, credential.clientId, signal);
    if (identity !== undefined && identity.subject !== credential.subject)
      throw new SubscriptionProviderError(
        'AUTH_INVALID',
        'ChatGPT refresh changed account identity.',
      );
    return CHATGPT_SUBSCRIPTION_CREDENTIAL.parse({
      ...credential,
      access: tokens.access_token,
      refresh: tokens.refresh_token,
      expires: Date.now() + tokens.expires_in * 1000,
      scopes: assertPlanScope(tokens.scope),
      ...(tokens.id_token === undefined ? {} : { idToken: tokens.id_token }),
      ...(tokens.earliest_refresh_at === undefined
        ? {}
        : { earliestRefreshAt: tokens.earliest_refresh_at }),
    });
  }

  private clientId(attempt: SiwcAttempt, callback: URL): string {
    const received = callback.searchParams.get('client_id');
    if (attempt.previous !== undefined) {
      if (received !== null && received !== attempt.previous.clientId)
        throw new SubscriptionProviderError(
          'AUTH_INVALID',
          'ChatGPT callback changed the selected client registration.',
        );
      return attempt.previous.clientId;
    }
    return CHATGPT_SUBSCRIPTION_CREDENTIAL.shape.clientId.parse(received);
  }

  private record(
    attempt: SiwcAttempt,
    tokens: SiwcTokens,
    identity: {
      readonly clientId: string;
      readonly subject: string;
      readonly idToken: string;
      readonly email?: string;
    },
  ): SubscriptionCredential {
    return CHATGPT_SUBSCRIPTION_CREDENTIAL.parse({
      kind: 'chatgpt-subscription',
      ...(attempt.subscriberProfileId === undefined
        ? {}
        : { subscriberProfileId: attempt.subscriberProfileId }),
      routeId: attempt.routeId,
      hostId: this.credentials.hostId,
      generation: randomUUID(),
      access: tokens.access_token,
      refresh: tokens.refresh_token,
      expires: Date.now() + tokens.expires_in * 1000,
      issuer: SIWC_ISSUER,
      ...identity,
      scopes: assertPlanScope(tokens.scope),
      ...(tokens.earliest_refresh_at === undefined
        ? {}
        : { earliestRefreshAt: tokens.earliest_refresh_at }),
    });
  }
}
