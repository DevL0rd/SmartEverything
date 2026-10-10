import { describe, expect, it } from 'vitest';
import { SmartThingsResponseError } from '../src/errors';
import {
  accountFromSecrets,
  authorizationCodeBody,
  AUTHORIZE_URL,
  authorizeUrl,
  basicAuthorization,
  describeOAuthError,
  EXPIRY_MARGIN_MS,
  OAUTH_SCOPES,
  parseTokenResponse,
  refreshBody,
  refreshDelayMs,
  REFRESH_INTERVAL_MS,
  SMARTTHINGS_API,
  TOKEN_URL,
} from '../src/oauth';

const NOW = new Date('2026-10-08T12:00:00.000Z');

const RESPONSE = {
  access_token: 'access-1',
  token_type: 'bearer',
  refresh_token: 'refresh-1',
  expires_in: 86399,
  scope: 'r:devices:* x:devices:* r:locations:*',
  access_tier: 0,
  installed_app_id: 'app-1',
};

describe('the SmartThings OAuth exchange', () => {
  it('uses the documented token endpoint', () => {
    expect(SMARTTHINGS_API).toBe('https://api.smartthings.com');
    expect(TOKEN_URL).toBe('https://api.smartthings.com/oauth/token');
  });

  it('builds the authorize URL with the OAuth-In scopes the CLI offers', () => {
    expect(AUTHORIZE_URL).toBe('https://api.smartthings.com/oauth/authorize');
    expect(OAUTH_SCOPES).toEqual([
      'r:devices:*',
      'x:devices:*',
      'r:locations:*',
      'r:scenes:*',
      'x:scenes:*',
    ]);
    const url = new URL(authorizeUrl('client 1', 'https://home.test/smartthings/callback', 'st-1'));
    expect(`${url.origin}${url.pathname}`).toBe(AUTHORIZE_URL);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'client 1',
      response_type: 'code',
      redirect_uri: 'https://home.test/smartthings/callback',
      scope: 'r:devices:* x:devices:* r:locations:* r:scenes:* x:scenes:*',
      state: 'st-1',
    });
  });

  it('authenticates the client with HTTP Basic', () => {
    expect(basicAuthorization('client', 'secret-ü')).toBe(
      `Basic ${Buffer.from('client:secret-ü', 'utf8').toString('base64')}`,
    );
  });

  it('builds the form bodies for the code exchange and the refresh', () => {
    expect(authorizationCodeBody('code 1', 'https://x.test/cb?a=1', 'client')).toBe(
      'grant_type=authorization_code&client_id=client&code=code+1&redirect_uri=https%3A%2F%2Fx.test%2Fcb%3Fa%3D1',
    );
    expect(refreshBody('refresh/1', 'client')).toBe(
      'grant_type=refresh_token&client_id=client&refresh_token=refresh%2F1',
    );
  });

  it('reads a token response into tokens with an absolute expiry', () => {
    expect(parseTokenResponse(RESPONSE, NOW)).toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: '2026-10-09T11:59:59.000Z',
      refreshedAt: '2026-10-08T12:00:00.000Z',
      scope: 'r:devices:* x:devices:* r:locations:*',
      installedAppId: 'app-1',
    });
  });

  it('accepts a token response without an installed app id', () => {
    const { installed_app_id: _ignored, ...rest } = RESPONSE;
    expect(parseTokenResponse({ ...rest, token_type: 'Bearer' }, NOW).installedAppId).toBeNull();
  });

  it('refuses a token response of another type, naming what was received', () => {
    expect(() => parseTokenResponse({ ...RESPONSE, token_type: 'mac' }, NOW)).toThrow(
      SmartThingsResponseError,
    );
    expect(() => parseTokenResponse({ ...RESPONSE, token_type: 'bearers' }, NOW)).toThrow(
      /^The SmartThings token response did not have the expected shape/,
    );
    expect(() => parseTokenResponse({ ...RESPONSE, token_type: 'not bearer' }, NOW)).toThrow(
      SmartThingsResponseError,
    );
  });

  it('describes an OAuth error with its code and description', () => {
    expect(
      describeOAuthError(400, {
        error: 'invalid_grant',
        error_description: 'Invalid refresh token: x',
      }),
    ).toBe('HTTP 400 invalid_grant: Invalid refresh token: x');
    expect(describeOAuthError(401, { error: 'invalid_client' })).toBe('HTTP 401 invalid_client');
    expect(describeOAuthError(502, 'Bad gateway')).toBe('HTTP 502 "Bad gateway"');
  });
});

describe('when to refresh', () => {
  it('refreshes twenty hours after the last refresh while the token lasts a day', () => {
    expect(REFRESH_INTERVAL_MS).toBe(72_000_000);
    expect(EXPIRY_MARGIN_MS).toBe(3_600_000);
    const tokens = { refreshedAt: NOW.toISOString(), expiresAt: '2026-10-09T12:00:00.000Z' };
    expect(refreshDelayMs(tokens, NOW)).toBe(72_000_000);
  });

  it('refreshes an hour before expiry when the token is shorter lived', () => {
    const tokens = { refreshedAt: NOW.toISOString(), expiresAt: '2026-10-08T14:00:00.000Z' };
    expect(refreshDelayMs(tokens, NOW)).toBe(3_600_000);
  });

  it('refreshes at once when the moment has passed', () => {
    const tokens = {
      refreshedAt: '2026-10-01T00:00:00.000Z',
      expiresAt: '2026-10-02T00:00:00.000Z',
    };
    expect(refreshDelayMs(tokens, NOW)).toBe(0);
  });
});

describe('the stored account', () => {
  it('accepts stored times with an offset', () => {
    const secrets = {
      ...parseTokenResponse(RESPONSE, NOW),
      expiresAt: '2026-10-09T14:00:00+02:00',
      refreshedAt: '2026-10-08T14:00:00+02:00',
    };
    expect(accountFromSecrets(secrets)).toEqual(secrets);
  });

  it('reads tokens back and drops what an older hub stored beside them', () => {
    const tokens = parseTokenResponse(RESPONSE, NOW);
    expect(accountFromSecrets({ ...tokens, subscriptionId: 'sub-1' })).toEqual(tokens);
  });

  it('refuses an incomplete account and names only the fields it had, never their values', () => {
    expect(() => accountFromSecrets({ accessToken: 'secret-value' })).toThrow(
      SmartThingsResponseError,
    );
    try {
      accountFromSecrets({ accessToken: 'secret-value' });
    } catch (cause) {
      expect(String(cause)).not.toContain('secret-value');
      expect(String(cause)).toMatch(
        /^SmartThingsResponseError: The SmartThings stored account did not have the expected shape: .*Received \["accessToken"\]\.$/s,
      );
    }
  });
});
