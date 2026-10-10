import type { IncomingMessage, ServerResponse } from 'node:http';
import { MCP_SCOPE } from '@smarteverything/domain';
import { z } from 'zod';
import type { Clock } from '../../../clock';
import { PUBLIC_BODY_LIMIT } from '../../../server/http';
import { OAUTH_AUTH_METHODS } from '../../../store/repositories/oauth';
import type { Store } from '../../../store/store';
import { readJson, replyJson } from '../respond';
import { CLIENT_SECRET_PREFIX, hashSecret, newSecret } from '../secrets';
import { OAuthError } from './errors';

const UNAPPROVED_LIFETIME_MS = 60 * 60_000;

const MOST_UNAPPROVED = 50;

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);

function isAllowedRedirect(text: string): boolean {
  const url = URL.parse(text);
  if (url?.hash !== '' || url.username !== '' || url.password !== '') {
    return false;
  }
  return (
    url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))
  );
}

const HTTPS_LINK = z
  .string()
  .max(2000)
  .refine((text) => URL.parse(text)?.protocol === 'https:', 'must be an https URL');

const REDIRECT_URI = z
  .string()
  .max(2000)
  .refine(
    isAllowedRedirect,
    'must be an https URL, or http on localhost, 127.0.0.1 or [::1], without a fragment',
  );

const REGISTRATION = z.object({
  redirect_uris: z
    .tuple([REDIRECT_URI], REDIRECT_URI)
    .refine((uris) => uris.length <= 10, 'must list at most 10 redirect URIs'),
  client_name: z.string().trim().min(1).max(200).optional(),
  client_uri: HTTPS_LINK.optional(),
  logo_uri: HTTPS_LINK.optional(),
  token_endpoint_auth_method: z.enum(OAUTH_AUTH_METHODS).default('client_secret_basic'),
  grant_types: z
    .array(z.enum(['authorization_code', 'refresh_token']))
    .default(['authorization_code'])
    .refine((types) => types.includes('authorization_code'), 'must include authorization_code'),
  response_types: z.array(z.literal('code')).default(['code']),
  scope: z
    .string()
    .refine(
      (scope) => scope.split(' ').every((entry) => entry === MCP_SCOPE),
      `may only ask for ${MCP_SCOPE}`,
    )
    .optional(),
});

type Registration = z.infer<typeof REGISTRATION>;

function refused(error: z.ZodError): OAuthError {
  const first = error.issues[0];
  const field = first === undefined ? 'metadata' : first.path.join('.');
  return new OAuthError(
    400,
    field.startsWith('redirect_uris') ? 'invalid_redirect_uri' : 'invalid_client_metadata',
    error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
  );
}

function makeRoom(store: Store, clock: Clock): void {
  const since = new Date(clock.now().getTime() - UNAPPROVED_LIFETIME_MS).toISOString();
  store.oauth.forgetUnapprovedBefore(since);
  if (store.oauth.unapprovedSince(since) >= MOST_UNAPPROVED) {
    throw new OAuthError(
      429,
      'temporarily_unavailable',
      'Too many assistants are waiting for approval; approve or wait an hour, then try again.',
    );
  }
}

function nameOf(registration: Registration): string {
  return registration.client_name ?? new URL(registration.redirect_uris[0]).host;
}

export async function registerClient(
  store: Store,
  clock: Clock,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const parsed = REGISTRATION.safeParse(await readJson(request, PUBLIC_BODY_LIMIT));
  if (!parsed.success) {
    throw refused(parsed.error);
  }
  makeRoom(store, clock);
  const registration = parsed.data;
  const method = registration.token_endpoint_auth_method;
  const secret = method === 'none' ? null : newSecret(CLIENT_SECRET_PREFIX);
  const row = store.oauth.register({
    name: nameOf(registration),
    uri: registration.client_uri ?? null,
    logoUri: registration.logo_uri ?? null,
    redirectUris: registration.redirect_uris,
    scopes: [MCP_SCOPE],
    authMethod: method,
    secretHash: secret === null ? null : hashSecret(secret),
  });
  replyJson(response, 201, {
    client_id: row.id,
    client_id_issued_at: Math.floor(Date.parse(row.created_at) / 1000),
    client_name: row.name,
    ...(row.uri === null ? {} : { client_uri: row.uri }),
    ...(row.logo_uri === null ? {} : { logo_uri: row.logo_uri }),
    redirect_uris: row.redirect_uris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: method,
    scope: MCP_SCOPE,
    ...(secret === null ? {} : { client_secret: secret, client_secret_expires_at: 0 }),
  });
}
