import { z } from 'zod';
import { issuePaths, SmartThingsResponseError } from './errors';

export const SMARTTHINGS_API = 'https://api.smartthings.com';

export const TOKEN_URL = `${SMARTTHINGS_API}/oauth/token`;

export const AUTHORIZE_URL = `${SMARTTHINGS_API}/oauth/authorize`;

export const OAUTH_SCOPES = [
  'r:devices:*',
  'x:devices:*',
  'r:locations:*',
  'r:scenes:*',
  'x:scenes:*',
] as const;

export const REFRESH_INTERVAL_MS = 20 * 60 * 60 * 1000;

export const EXPIRY_MARGIN_MS = 60 * 60 * 1000;

const TOKEN_RESPONSE = z.object({
  access_token: z.string().min(1),
  token_type: z.string().regex(/^bearer$/i),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  scope: z.string(),
  installed_app_id: z.string().min(1).nullish(),
});

const OAUTH_ERROR = z.object({
  error: z.string().min(1),
  error_description: z.string().optional(),
});

const TOKENS = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.iso.datetime({ offset: true }),
  refreshedAt: z.iso.datetime({ offset: true }),
  scope: z.string(),
  installedAppId: z.string().min(1).nullable(),
});

export type Tokens = z.infer<typeof TOKENS>;

export type AccountSecrets = Tokens;

export function basicAuthorization(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

export function authorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', OAUTH_SCOPES.join(' '));
  url.searchParams.set('state', state);
  return url.toString();
}

export function authorizationCodeBody(code: string, redirectUri: string, clientId: string): string {
  return new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
  }).toString();
}

export function refreshBody(refreshToken: string, clientId: string): string {
  return new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
  }).toString();
}

function fieldNames(received: unknown): string[] {
  return typeof received === 'object' && received !== null ? Object.keys(received) : [];
}

export function parseTokenResponse(received: unknown, now: Date): Tokens {
  const parsed = TOKEN_RESPONSE.safeParse(received);
  if (!parsed.success) {
    throw new SmartThingsResponseError(
      'token response',
      fieldNames(received),
      issuePaths(parsed.error),
    );
  }
  return {
    accessToken: parsed.data.access_token,
    refreshToken: parsed.data.refresh_token,
    expiresAt: new Date(now.getTime() + parsed.data.expires_in * 1000).toISOString(),
    refreshedAt: now.toISOString(),
    scope: parsed.data.scope,
    installedAppId: parsed.data.installed_app_id ?? null,
  };
}

export function describeOAuthError(status: number, received: unknown): string {
  const parsed = OAUTH_ERROR.safeParse(received);
  if (!parsed.success) {
    return `HTTP ${String(status)} ${JSON.stringify(received)}`;
  }
  const description = parsed.data.error_description;
  return description === undefined
    ? `HTTP ${String(status)} ${parsed.data.error}`
    : `HTTP ${String(status)} ${parsed.data.error}: ${description}`;
}

export function refreshDelayMs(
  tokens: Pick<Tokens, 'expiresAt' | 'refreshedAt'>,
  now: Date,
): number {
  const byInterval = Date.parse(tokens.refreshedAt) + REFRESH_INTERVAL_MS;
  const byExpiry = Date.parse(tokens.expiresAt) - EXPIRY_MARGIN_MS;
  return Math.max(0, Math.min(byInterval, byExpiry) - now.getTime());
}

export function accountFromSecrets(secrets: Readonly<Record<string, unknown>>): AccountSecrets {
  const parsed = TOKENS.safeParse(secrets);
  if (!parsed.success) {
    throw new SmartThingsResponseError(
      'stored account',
      Object.keys(secrets),
      issuePaths(parsed.error),
    );
  }
  return parsed.data;
}
