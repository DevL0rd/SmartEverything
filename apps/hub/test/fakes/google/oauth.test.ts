import { describe, expect, it } from 'vitest';
import {
  REDIRECT_URI,
  authorizationUrl,
  exchangeBody,
  link,
  pkcePair,
  refreshBody,
  session,
  textOf,
  tokenRequest,
} from './helpers';
import { createFakeGoogle } from './index';
import { SCOPES } from './scopes';

const EMAIL = 'owner@example.test';

describe('fake Google OAuth', () => {
  it('exchanges a code with the matching PKCE verifier and serves userinfo', async () => {
    const google = createFakeGoogle();
    const tokens = await link(google, EMAIL);
    expect(tokens.refresh_token).toBeDefined();
    expect(tokens.expires_in).toBe(3599);
    expect(tokens.scope.split(' ')).toContain(SCOPES.email);
    const info = await session(google, tokens.access_token).get(
      'https://openidconnect.googleapis.com/v1/userinfo',
    );
    expect(info.body).toMatchObject({ email: EMAIL, email_verified: true });
  });

  it('rejects a wrong verifier and a reused code', async () => {
    const google = createFakeGoogle();
    const { verifier, challenge } = pkcePair();
    const first = google.oauth.consent(authorizationUrl({ challenge }), EMAIL);
    const wrong = await tokenRequest(google, exchangeBody(first.code, pkcePair().verifier));
    expect(wrong.status).toBe(400);
    expect(wrong.body).toMatchObject({ error: 'invalid_grant' });
    const retry = await tokenRequest(google, exchangeBody(first.code, verifier));
    expect(retry.body).toMatchObject({ error: 'invalid_grant' });
    const second = google.oauth.consent(authorizationUrl({ challenge }), EMAIL);
    const reused = await tokenRequest(google, exchangeBody(second.code, verifier));
    expect(reused.status).toBe(200);
    const again = await tokenRequest(google, exchangeBody(second.code, verifier));
    expect(again.body).toMatchObject({ error: 'invalid_grant' });
  });

  it('requires the registered client secret and the same redirect uri', async () => {
    const google = createFakeGoogle();
    const { verifier, challenge } = pkcePair();
    const consent = google.oauth.consent(authorizationUrl({ challenge }), EMAIL);
    const noSecret = exchangeBody(consent.code, verifier);
    noSecret.delete('client_secret');
    expect((await tokenRequest(google, noSecret)).body).toMatchObject({ error: 'invalid_request' });
    const other = exchangeBody(consent.code, verifier);
    other.set('redirect_uri', `${REDIRECT_URI}/other`);
    expect((await tokenRequest(google, other)).body).toMatchObject({
      error: 'redirect_uri_mismatch',
    });
  });

  it('refreshes an access token and reports invalid_grant after revocation', async () => {
    const google = createFakeGoogle();
    const tokens = await link(google, EMAIL);
    const form = refreshBody(tokens.refresh_token ?? '');
    const refreshed = await tokenRequest(google, form);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body['refresh_token']).toBeUndefined();
    google.oauth.revokeRefreshToken(tokens.refresh_token ?? '');
    const dead = await tokenRequest(google, form);
    expect(dead.status).toBe(400);
    expect(dead.body).toMatchObject({ error: 'invalid_grant' });
    const stale = await session(google, textOf(refreshed, 'access_token')).get(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
    );
    expect(stale.status).toBe(401);
  });

  it('expires refresh tokens after the testing-mode lifetime', async () => {
    const day = 24 * 60 * 60 * 1000;
    const google = createFakeGoogle({ refreshTokenLifetimeMs: 7 * day });
    const tokens = await link(google, EMAIL);
    const form = refreshBody(tokens.refresh_token ?? '');
    google.clock.advance(6 * day);
    expect((await tokenRequest(google, form)).status).toBe(200);
    google.clock.advance(2 * day);
    expect((await tokenRequest(google, form)).body).toMatchObject({ error: 'invalid_grant' });
  });

  it('issues a refresh token again only with prompt=consent and keeps granted scopes', async () => {
    const google = createFakeGoogle();
    const first = await link(google, EMAIL, ['openid', 'email', SCOPES.tasks]);
    expect(first.refresh_token).toBeDefined();
    const { verifier, challenge } = pkcePair();
    const quiet = google.oauth.consent(
      authorizationUrl({ challenge, scopes: [SCOPES.calendarEvents], prompt: false }),
      EMAIL,
    );
    const quietTokens = await tokenRequest(google, exchangeBody(quiet.code, verifier));
    expect(quietTokens.body['refresh_token']).toBeUndefined();
    expect(textOf(quietTokens, 'scope').split(' ')).toEqual(
      expect.arrayContaining([SCOPES.tasks, SCOPES.calendarEvents]),
    );
    const loud = google.oauth.consent(
      authorizationUrl({ challenge, scopes: [SCOPES.calendarEvents] }),
      EMAIL,
    );
    const loudTokens = await tokenRequest(google, exchangeBody(loud.code, verifier));
    expect(loudTokens.body['refresh_token']).toBeDefined();
  });

  it('silently revokes the oldest refresh token past the per-client cap', async () => {
    const google = createFakeGoogle({ refreshTokensPerClient: 2 });
    const first = await link(google, EMAIL);
    await link(google, EMAIL);
    await link(google, EMAIL);
    expect(google.oauth.refreshTokens(EMAIL)).toHaveLength(2);
    expect(google.oauth.refreshTokens(EMAIL)).not.toContain(first.refresh_token);
  });

  it('answers 401 after the access token lifetime and 403 for a missing scope', async () => {
    const google = createFakeGoogle();
    const full = await link(google, EMAIL);
    google.clock.advance(3600 * 1000);
    const expired = await session(google, full.access_token).get(
      'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
    );
    expect(expired.status).toBe(401);
    const narrow = await link(google, 'narrow@example.test', ['openid', 'email', SCOPES.tasks]);
    const denied = await session(google, narrow.access_token).get(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
    );
    expect(denied.status).toBe(403);
  });

  it('redirects a denied consent with access_denied and the state', () => {
    const google = createFakeGoogle();
    const { challenge } = pkcePair();
    const redirect = new URL(google.oauth.deny(authorizationUrl({ challenge, state: 'abc' })));
    expect(redirect.searchParams.get('error')).toBe('access_denied');
    expect(redirect.searchParams.get('state')).toBe('abc');
    expect(redirect.searchParams.get('code')).toBeNull();
  });

  it('serves a registered public client without a secret and drops expired access tokens', async () => {
    const google = createFakeGoogle();
    google.oauth.registerClient('public.apps.googleusercontent.com', null);
    const { verifier, challenge } = pkcePair();
    const url = new URL(authorizationUrl({ challenge }));
    url.searchParams.set('client_id', 'public.apps.googleusercontent.com');
    const consent = google.oauth.consent(url.toString(), EMAIL);
    const form = exchangeBody(consent.code, verifier);
    form.set('client_id', 'public.apps.googleusercontent.com');
    form.delete('client_secret');
    const tokens = await tokenRequest(google, form);
    expect(tokens.status).toBe(200);
    const api = session(google, textOf(tokens, 'access_token'));
    expect((await api.get('https://tasks.googleapis.com/tasks/v1/users/@me/lists')).status).toBe(
      200,
    );
    google.oauth.expireAccessTokens();
    expect((await api.get('https://tasks.googleapis.com/tasks/v1/users/@me/lists')).status).toBe(
      401,
    );
  });

  it('rejects an authorization request without PKCE', () => {
    const google = createFakeGoogle();
    const url = new URL(authorizationUrl({ challenge: 'x' }));
    url.searchParams.delete('code_challenge');
    expect(() => google.oauth.consent(url.toString(), EMAIL)).toThrow('code_challenge');
  });
});
