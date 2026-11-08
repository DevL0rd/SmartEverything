import { createHash, randomBytes } from 'node:crypto';
import { GOOGLE_PRODUCTS, type GoogleProduct } from '@smarteverything/domain';
import { z } from 'zod';
import type { FetchLike } from '../plugins/builtin/fetch-like';
import type { GoogleApp, GoogleClientKind } from '../secrets/store';

export const AUTHORIZATION_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
export const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

const AUTH = 'https://www.googleapis.com/auth/';

export const GOOGLE_ACCESS_LEVELS = ['read', 'write'] as const;

export type GoogleAccessLevel = (typeof GOOGLE_ACCESS_LEVELS)[number];

export type GoogleRequest = Readonly<Partial<Record<GoogleProduct, GoogleAccessLevel>>>;

const IDENTITY_SCOPES = ['openid', 'email'] as const;

const PRODUCT_SCOPES: Readonly<
  Record<GoogleProduct, Readonly<Record<GoogleAccessLevel, readonly string[]>>>
> = {
  calendar: {
    read: [`${AUTH}calendar.calendarlist.readonly`, `${AUTH}calendar.events.readonly`],
    write: [`${AUTH}calendar.calendarlist.readonly`, `${AUTH}calendar.events`],
  },
  tasks: { read: [`${AUTH}tasks.readonly`], write: [`${AUTH}tasks`] },
};

export interface GoogleClient {
  readonly clientId: string;
  readonly clientSecret: string | null;
}

export function clientOf(app: GoogleApp | null, kind: GoogleClientKind): GoogleClient | null {
  if (app === null) return null;
  if (kind === 'desktop') return app.desktop;
  return app.android === null ? null : { clientId: app.android.clientId, clientSecret: null };
}

export interface Pkce {
  readonly verifier: string;
  readonly challenge: string;
  readonly state: string;
}

export interface CodeGrant {
  readonly accessToken: string;
  readonly expiresInSeconds: number;
  readonly refreshToken: string | null;
  readonly scopes: readonly string[];
}

export interface AccessGrant {
  readonly accessToken: string;
  readonly expiresInSeconds: number;
  readonly scopes: readonly string[];
}

export class GoogleTokenError extends Error {
  override readonly name = 'GoogleTokenError';

  constructor(
    readonly code: string,
    readonly status: number,
    override readonly cause?: unknown,
  ) {
    super(`Google refused the token request: ${code}.`);
  }
}

export class GoogleNetworkError extends Error {
  override readonly name = 'GoogleNetworkError';

  constructor(
    readonly operation: string,
    override readonly cause: unknown,
  ) {
    super(`Google could not be reached to ${operation}.`);
  }
}

const TOKEN_BODY = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
  scope: z.string(),
  refresh_token: z.string().min(1).optional(),
});

const TOKEN_ERROR = z.object({ error: z.string().min(1) });

const USERINFO = z.object({ email: z.email() });

export function createPkce(): Pkce {
  const verifier = randomBytes(48).toString('base64url');
  return {
    verifier,
    challenge: createHash('sha256').update(verifier, 'ascii').digest('base64url'),
    state: randomBytes(24).toString('base64url'),
  };
}

export function scopesFor(request: GoogleRequest): readonly string[] {
  const scopes = new Set<string>(IDENTITY_SCOPES);
  for (const product of GOOGLE_PRODUCTS) {
    const level = request[product];
    if (level === undefined) continue;
    for (const scope of PRODUCT_SCOPES[product][level]) scopes.add(scope);
  }
  return [...scopes];
}

export function isGranted(requested: string, granted: readonly string[]): boolean {
  return granted.includes(requested === 'email' ? `${AUTH}userinfo.email` : requested);
}

export function authorizationUrl(input: {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
  readonly pkce: Pkce;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: input.scopes.join(' '),
    state: input.pkce.state,
    code_challenge: input.pkce.challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  });
  return `${AUTHORIZATION_URL}?${params.toString()}`;
}

function clientForm(client: GoogleClient, fields: Record<string, string>): URLSearchParams {
  const form = new URLSearchParams({ ...fields, client_id: client.clientId });
  if (client.clientSecret !== null) form.set('client_secret', client.clientSecret);
  return form;
}

async function send(
  fetch: FetchLike,
  operation: string,
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (cause) {
    throw new GoogleNetworkError(operation, cause);
  }
}

async function postForm(
  fetch: FetchLike,
  operation: string,
  url: string,
  form: URLSearchParams,
): Promise<Response> {
  return send(fetch, operation, url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  });
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (cause) {
    throw new GoogleTokenError('unreadable_response', response.status, cause);
  }
}

async function tokenBody(response: Response): Promise<z.infer<typeof TOKEN_BODY>> {
  const body = await readJson(response);
  if (!response.ok) {
    const failure = TOKEN_ERROR.safeParse(body);
    throw new GoogleTokenError(failure.success ? failure.data.error : 'unknown', response.status);
  }
  return TOKEN_BODY.parse(body);
}

function splitScopes(scope: string): readonly string[] {
  return scope.split(' ').filter((entry) => entry.length > 0);
}

export async function exchangeCode(
  fetch: FetchLike,
  client: GoogleClient,
  input: { readonly code: string; readonly verifier: string; readonly redirectUri: string },
): Promise<CodeGrant> {
  const form = clientForm(client, {
    grant_type: 'authorization_code',
    code: input.code,
    code_verifier: input.verifier,
    redirect_uri: input.redirectUri,
  });
  const body = await tokenBody(await postForm(fetch, 'exchange the code', TOKEN_URL, form));
  return {
    accessToken: body.access_token,
    expiresInSeconds: body.expires_in,
    refreshToken: body.refresh_token ?? null,
    scopes: splitScopes(body.scope),
  };
}

export async function refreshAccess(
  fetch: FetchLike,
  client: GoogleClient,
  refreshToken: string,
): Promise<AccessGrant> {
  const form = clientForm(client, { grant_type: 'refresh_token', refresh_token: refreshToken });
  const body = await tokenBody(await postForm(fetch, 'refresh the access token', TOKEN_URL, form));
  return {
    accessToken: body.access_token,
    expiresInSeconds: body.expires_in,
    scopes: splitScopes(body.scope),
  };
}

export async function fetchEmail(fetch: FetchLike, accessToken: string): Promise<string> {
  const response = await send(fetch, 'read the account email', USERINFO_URL, {
    method: 'GET',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new GoogleTokenError('userinfo_failed', response.status);
  return USERINFO.parse(await response.json()).email;
}

export async function revokeToken(fetch: FetchLike, token: string): Promise<void> {
  const response = await postForm(
    fetch,
    'revoke the token',
    REVOKE_URL,
    new URLSearchParams({ token }),
  );
  if (!response.ok) throw new GoogleTokenError('revoke_failed', response.status);
}
