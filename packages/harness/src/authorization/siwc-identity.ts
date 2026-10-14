import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose';
import type { JWTVerifyGetKey } from 'jose';
import {
  SIWC_DISCOVERY,
  SIWC_ISSUER,
  SIWC_IDENTITY,
  SIWC_REFRESH_IDENTITY,
} from './siwc-contracts';
import { subscriptionJson } from './http';
import { SubscriptionProviderError } from '../providers/errors';

export class SiwcIdentity {
  constructor(private readonly fetcher: typeof fetch) {}

  async verify(
    idToken: string,
    clientId: string,
    signal: AbortSignal,
    nonce?: string,
  ): Promise<{ readonly subject: string; readonly email?: string }> {
    try {
      signal.throwIfAborted();
      const keys = await this.keySet(signal);
      const { payload } = await jwtVerify(idToken, keys, {
        issuer: SIWC_ISSUER,
        audience: clientId,
        requiredClaims: ['sub', 'exp', 'iat'],
        clockTolerance: 5,
      });
      signal.throwIfAborted();
      const identity =
        nonce === undefined ? SIWC_REFRESH_IDENTITY.parse(payload) : SIWC_IDENTITY.parse(payload);
      if (nonce !== undefined && payload['nonce'] !== nonce)
        throw new SubscriptionProviderError(
          'AUTH_INVALID',
          'ChatGPT identity nonce does not match this authorization attempt.',
        );
      return {
        subject: identity.sub,
        ...(identity.email === undefined ? {} : { email: identity.email }),
      };
    } catch (error) {
      signal.throwIfAborted();
      throw new SubscriptionProviderError(
        'AUTH_INVALID',
        `ChatGPT identity verification failed (${error instanceof Error ? error.name : 'unknown'}).`,
      );
    }
  }

  private async keySet(signal: AbortSignal): Promise<JWTVerifyGetKey> {
    const discovery = SIWC_DISCOVERY.parse(
      await subscriptionJson(this.fetcher, `${SIWC_ISSUER}/.well-known/openid-configuration`, {
        signal,
      }),
    );
    signal.throwIfAborted();
    return createRemoteJWKSet(new URL(discovery.jwks_uri), {
      [customFetch]: (input, options) =>
        this.fetcher(input, {
          ...options,
          signal: AbortSignal.any([signal, options.signal]),
        }),
    });
  }
}
