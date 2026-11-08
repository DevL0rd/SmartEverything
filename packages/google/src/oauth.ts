import { createHash } from 'node:crypto';

export const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

export const SCOPE_IDENTITY = ['openid', 'email'] as const;
export const SCOPE_CALENDAR_LIST = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly';
export const SCOPE_CALENDAR_EVENTS = 'https://www.googleapis.com/auth/calendar.events';
export const SCOPE_TASKS = 'https://www.googleapis.com/auth/tasks';

export const PKCE_MIN_VERIFIER_LENGTH = 43;
export const PKCE_MAX_VERIFIER_LENGTH = 128;

const VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]+$/;

export interface PkcePair {
  readonly verifier: string;
  readonly challenge: string;
}

export function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

export function challengeFor(verifier: string): string {
  if (
    verifier.length < PKCE_MIN_VERIFIER_LENGTH ||
    verifier.length > PKCE_MAX_VERIFIER_LENGTH ||
    !VERIFIER_PATTERN.test(verifier)
  ) {
    throw new RangeError('The PKCE verifier must be 43 to 128 unreserved characters.');
  }
  return base64Url(createHash('sha256').update(verifier, 'ascii').digest());
}

export function pkceFromRandomBytes(random: Uint8Array): PkcePair {
  const verifier = base64Url(random);
  return { verifier, challenge: challengeFor(verifier) };
}

export interface AuthorizationRequest {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
  readonly state: string;
  readonly codeChallenge: string;
  readonly loginHint?: string;
}

export function buildAuthorizationUrl(request: AuthorizationRequest): string {
  const params = new URLSearchParams({
    client_id: request.clientId,
    redirect_uri: request.redirectUri,
    response_type: 'code',
    scope: [...SCOPE_IDENTITY, ...request.scopes].join(' '),
    state: request.state,
    code_challenge: request.codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
  });
  if (request.loginHint !== undefined) params.set('login_hint', request.loginHint);
  return `${AUTHORIZATION_ENDPOINT}?${params.toString()}`;
}

export interface ClientCredentials {
  readonly clientId: string;
  readonly clientSecret?: string;
}

function withClient(params: URLSearchParams, client: ClientCredentials): URLSearchParams {
  params.set('client_id', client.clientId);
  if (client.clientSecret !== undefined) params.set('client_secret', client.clientSecret);
  return params;
}

export function buildCodeExchangeBody(
  client: ClientCredentials,
  input: { readonly code: string; readonly codeVerifier: string; readonly redirectUri: string },
): string {
  return withClient(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      code_verifier: input.codeVerifier,
      redirect_uri: input.redirectUri,
    }),
    client,
  ).toString();
}

export function buildRefreshBody(client: ClientCredentials, refreshToken: string): string {
  return withClient(
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    client,
  ).toString();
}

export function buildRevokeBody(token: string): string {
  return new URLSearchParams({ token }).toString();
}

export function grantedScopes(scope: string): readonly string[] {
  return scope.split(' ').filter((entry) => entry.length > 0);
}

export function missingScopes(granted: string, required: readonly string[]): readonly string[] {
  const have = new Set(grantedScopes(granted));
  return required.filter((scope) => !have.has(scope));
}
