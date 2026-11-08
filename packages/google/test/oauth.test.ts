import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildAuthorizationUrl,
  buildCodeExchangeBody,
  buildRefreshBody,
  challengeFor,
  missingScopes,
  pkceFromRandomBytes,
  SCOPE_CALENDAR_EVENTS,
  SCOPE_TASKS,
} from '../src';

describe('pkce', () => {
  it('matches the RFC 7636 appendix B vector', () => {
    expect(challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('derives a verifier of 43 characters from 32 random bytes and the S256 challenge', () => {
    const pair = pkceFromRandomBytes(new Uint8Array(32).fill(7));
    expect(pair.verifier).toHaveLength(43);
    expect(pair.challenge).toBe(createHash('sha256').update(pair.verifier).digest('base64url'));
  });

  it('refuses a verifier outside the allowed length or alphabet', () => {
    expect(() => challengeFor('short')).toThrow(RangeError);
    expect(() => challengeFor(`${'a'.repeat(42)}!`)).toThrow(RangeError);
    expect(() => challengeFor('a'.repeat(129))).toThrow(RangeError);
  });
});

describe('authorization url', () => {
  const url = new URL(
    buildAuthorizationUrl({
      clientId: 'client',
      redirectUri: 'http://127.0.0.1:4000',
      scopes: [SCOPE_CALENDAR_EVENTS, SCOPE_TASKS],
      state: 'state-1',
      codeChallenge: 'challenge',
      loginHint: 'a@b.c',
    }),
  );

  it('asks for offline access, consent, incremental scopes and S256', () => {
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('include_granted_scopes')).toBe('true');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe(
      `openid email ${SCOPE_CALENDAR_EVENTS} ${SCOPE_TASKS}`,
    );
    expect(url.searchParams.get('login_hint')).toBe('a@b.c');
  });
});

describe('token bodies', () => {
  it('sends the verifier on exchange and omits an absent secret', () => {
    const body = new URLSearchParams(
      buildCodeExchangeBody(
        { clientId: 'c' },
        { code: 'code', codeVerifier: 'v', redirectUri: 'http://127.0.0.1:1' },
      ),
    );
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code_verifier')).toBe('v');
    expect(body.has('client_secret')).toBe(false);
  });

  it('refreshes with the secret when one exists', () => {
    const body = new URLSearchParams(buildRefreshBody({ clientId: 'c', clientSecret: 's' }, 'r'));
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('client_secret')).toBe('s');
  });

  it('lists scopes the grant lacks', () => {
    expect(missingScopes(`openid ${SCOPE_TASKS}`, [SCOPE_TASKS, SCOPE_CALENDAR_EVENTS])).toEqual([
      SCOPE_CALENDAR_EVENTS,
    ]);
  });
});
