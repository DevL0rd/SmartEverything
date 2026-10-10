import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from '@smarteverything/logging';
import type { Clock } from '../../../clock';
import type { OAuthClientAuth, OAuthTokenRow } from '../../../store/repositories/oauth';
import type { Store } from '../../../store/store';
import { grantStillHolds } from '../bearer';
import { readForm, replyJson, single } from '../respond';
import {
  ACCESS_TOKEN_PREFIX,
  REFRESH_TOKEN_PREFIX,
  hashSecret,
  newSecret,
  pkceChallengeOf,
} from '../secrets';
import { siteOf, type Site } from '../site';
import { resourceOf } from './authorize';
import { authenticateClient } from './client-auth';
import { OAuthError, invalidRequest } from './errors';
import type { AuthorizationSessions } from './sessions';

const ACCESS_TOKEN_LIFETIME_MS = 60 * 60_000;

const REFRESH_TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60_000;

const CODE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;

export interface TokenOptions {
  readonly store: Store;
  readonly clock: Clock;
  readonly sessions: AuthorizationSessions;
  readonly log: Logger;
}

interface Issue {
  readonly clientId: string;
  readonly family: string;
  readonly scopes: readonly string[];
  readonly resource: string;
}

function invalidGrant(description: string): OAuthError {
  return new OAuthError(400, 'invalid_grant', description);
}

function required(form: URLSearchParams, name: string): string {
  const value = single(form, name);
  if (value === undefined) {
    throw invalidRequest(`Send ${name} exactly once.`);
  }
  return value;
}

function issued(options: TokenOptions, issue: Issue): Record<string, unknown> {
  const now = options.clock.now().getTime();
  const access = newSecret(ACCESS_TOKEN_PREFIX);
  const refresh = newSecret(REFRESH_TOKEN_PREFIX);
  options.store.oauth.forgetExpiredTokens();
  options.store.oauth.issue([
    {
      ...issue,
      tokenHash: hashSecret(access),
      kind: 'access',
      expiresAt: new Date(now + ACCESS_TOKEN_LIFETIME_MS).toISOString(),
    },
    {
      ...issue,
      tokenHash: hashSecret(refresh),
      kind: 'refresh',
      expiresAt: new Date(now + REFRESH_TOKEN_LIFETIME_MS).toISOString(),
    },
  ]);
  return {
    access_token: access,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_LIFETIME_MS / 1000,
    refresh_token: refresh,
    scope: issue.scopes.join(' '),
  };
}

function exchangeCode(
  options: TokenOptions,
  site: Site,
  client: OAuthClientAuth,
  form: URLSearchParams,
): Record<string, unknown> {
  const redemption = options.sessions.redeem(required(form, 'code'));
  if (redemption.kind === 'replayed') {
    options.store.oauth.revokeFamily(redemption.family);
    options.log.warn('code.replayed', { clientId: client.row.id });
    throw invalidGrant('This authorization code was already used; its tokens are revoked.');
  }
  if (redemption.kind === 'unknown') {
    throw invalidGrant('The authorization code is unknown or expired.');
  }
  const code = redemption.code;
  if (code.clientId !== client.row.id || code.redirectUri !== single(form, 'redirect_uri')) {
    throw invalidGrant('The code was issued to another client or redirect_uri.');
  }
  const verifier = required(form, 'code_verifier');
  if (!CODE_VERIFIER.test(verifier) || pkceChallengeOf(verifier) !== code.codeChallenge) {
    throw invalidGrant('The code_verifier does not match the code_challenge.');
  }
  if (resourceOf(site, single(form, 'resource')) !== code.resource) {
    throw invalidGrant('The resource differs from the one authorized.');
  }
  if (client.row.granted_at === null || client.row.revoked_at !== null) {
    throw invalidGrant('The owner revoked this assistant; connect again.');
  }
  return issued(options, {
    clientId: client.row.id,
    family: code.family,
    scopes: code.scopes,
    resource: code.resource,
  });
}

function refreshed(options: TokenOptions, client: OAuthClientAuth, token: string): OAuthTokenRow {
  const row = options.store.oauth.token(hashSecret(token));
  if (row?.kind !== 'refresh' || row.client_id !== client.row.id) {
    throw invalidGrant('The refresh token is unknown to this client.');
  }
  return row;
}

function narrowed(row: OAuthTokenRow, asked: string | undefined): readonly string[] {
  const scopes =
    asked === undefined ? row.scopes : asked.split(' ').filter((scope) => scope !== '');
  if (scopes.length === 0 || scopes.some((scope) => !row.scopes.includes(scope))) {
    throw new OAuthError(400, 'invalid_scope', 'A refresh may only keep or narrow the scope.');
  }
  return scopes;
}

function spend(options: TokenOptions, client: OAuthClientAuth, row: OAuthTokenRow): void {
  if (!options.store.oauth.useRefreshToken(row.token_hash)) {
    options.store.oauth.revokeFamily(row.family);
    options.log.warn('refresh.replayed', { clientId: client.row.id });
    throw invalidGrant('This refresh token was already used; the connection is revoked.');
  }
  if (Date.parse(row.expires_at) <= options.clock.now().getTime()) {
    throw invalidGrant('The refresh token has expired; connect again.');
  }
  if (!grantStillHolds(options.store, row)) {
    throw invalidGrant('The owner revoked this assistant; connect again.');
  }
}

function refresh(
  options: TokenOptions,
  site: Site,
  client: OAuthClientAuth,
  form: URLSearchParams,
): Record<string, unknown> {
  const row = refreshed(options, client, required(form, 'refresh_token'));
  const scopes = narrowed(row, single(form, 'scope'));
  if (resourceOf(site, single(form, 'resource')) !== row.resource) {
    throw invalidGrant('The resource differs from the one authorized.');
  }
  spend(options, client, row);
  return issued(options, {
    clientId: client.row.id,
    family: row.family,
    scopes,
    resource: row.resource,
  });
}

export async function exchangeToken(
  options: TokenOptions,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const site = siteOf(options.store);
  const form = await readForm(request);
  const client = authenticateClient(options.store, request, form);
  const grantType = single(form, 'grant_type');
  if (grantType !== 'authorization_code' && grantType !== 'refresh_token') {
    throw new OAuthError(
      400,
      'unsupported_grant_type',
      'Only authorization_code and refresh_token grants are offered.',
    );
  }
  const body =
    grantType === 'authorization_code'
      ? exchangeCode(options, site, client, form)
      : refresh(options, site, client, form);
  options.log.info('token.issued', { clientId: client.row.id, grantType });
  replyJson(response, 200, body);
}
