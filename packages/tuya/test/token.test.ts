import { describe, expect, it } from 'vitest';
import {
  TOKEN_PATH,
  TOKEN_QUERY,
  TOKEN_REFRESH_MARGIN_MS,
  TOKEN_RESULT,
  needsRefresh,
  refreshPath,
  tokenFrom,
} from '../src';

describe('cloud tokens', () => {
  it('requests a simple-mode token', () => {
    expect(TOKEN_PATH).toBe('/v1.0/token');
    expect(TOKEN_QUERY).toStrictEqual({ grant_type: '1' });
    expect(TOKEN_REFRESH_MARGIN_MS).toBe(60_000);
  });

  it('computes the expiry from the moment the token was received', () => {
    const result = TOKEN_RESULT.parse({
      access_token: 'a',
      refresh_token: 'r',
      expire_time: 7200,
      uid: 'u',
    });
    expect(tokenFrom(result, 1_000)).toStrictEqual({
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: 7_201_000,
    });
  });

  it('refuses a token result without an expiry', () => {
    expect(
      TOKEN_RESULT.safeParse({ access_token: 'a', refresh_token: 'r', expire_time: 0 }).success,
    ).toBe(false);
    expect(
      TOKEN_RESULT.safeParse({ access_token: '', refresh_token: 'r', expire_time: 1 }).success,
    ).toBe(false);
    expect(
      TOKEN_RESULT.safeParse({ access_token: 'a', refresh_token: '', expire_time: 1 }).success,
    ).toBe(false);
    expect(
      TOKEN_RESULT.safeParse({ access_token: 'a', refresh_token: 'r', expire_time: 1.5 }).success,
    ).toBe(false);
  });

  it('refreshes from one minute before expiry', () => {
    const token = { accessToken: 'a', refreshToken: 'r', expiresAt: 100_000 };
    expect(needsRefresh(token, 39_999)).toBe(false);
    expect(needsRefresh(token, 40_000)).toBe(true);
    expect(needsRefresh(token, 100_001)).toBe(true);
  });

  it('refreshes through the refresh token path', () => {
    expect(refreshPath({ accessToken: 'a', refreshToken: 'abc', expiresAt: 0 })).toBe(
      '/v1.0/token/abc',
    );
  });
});
