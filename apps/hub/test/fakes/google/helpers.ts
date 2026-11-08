import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { FAKE_CLIENT_ID, FAKE_CLIENT_SECRET } from './oauth';
import { SCOPES } from './scopes';
import type { FakeGoogle } from './server';

export const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
export const TASKS_API = 'https://tasks.googleapis.com/tasks/v1';
export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const REDIRECT_URI = 'http://127.0.0.1:53682/callback';
export const ALL_SCOPES: readonly string[] = [
  'openid',
  'email',
  SCOPES.calendarListReadonly,
  SCOPES.calendarEvents,
  SCOPES.tasks,
];

const BodySchema = z.record(z.string(), z.unknown());
const ListSchema = z.array(BodySchema);
const TokensSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  id_token: z.string().optional(),
  expires_in: z.number(),
  scope: z.string(),
});

export type Tokens = z.infer<typeof TokensSchema>;

export interface Answer {
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly headers: Headers;
}

export function pkcePair(): { readonly verifier: string; readonly challenge: string } {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier, 'ascii').digest('base64url');
  return { verifier, challenge };
}

export function authorizationUrl(input: {
  readonly challenge: string;
  readonly scopes?: readonly string[];
  readonly state?: string;
  readonly prompt?: boolean;
  readonly includeGranted?: boolean;
}): string {
  const params = new URLSearchParams({
    client_id: FAKE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: (input.scopes ?? ALL_SCOPES).join(' '),
    state: input.state ?? 'state-1',
    code_challenge: input.challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
  });
  if (input.prompt !== false) params.set('prompt', 'consent');
  if (input.includeGranted !== false) params.set('include_granted_scopes', 'true');
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function exchangeBody(code: string, verifier: string): URLSearchParams {
  return new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    redirect_uri: REDIRECT_URI,
    client_id: FAKE_CLIENT_ID,
    client_secret: FAKE_CLIENT_SECRET,
  });
}

export function refreshBody(refreshToken: string): URLSearchParams {
  return new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: FAKE_CLIENT_ID,
    client_secret: FAKE_CLIENT_SECRET,
  });
}

export async function answer(response: Response): Promise<Answer> {
  const text = await response.text();
  const body = text.length === 0 ? {} : BodySchema.parse(JSON.parse(text));
  return { status: response.status, body, headers: response.headers };
}

export async function tokenRequest(google: FakeGoogle, form: URLSearchParams): Promise<Answer> {
  return answer(
    await google.fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
    }),
  );
}

export async function link(
  google: FakeGoogle,
  email: string,
  scopes: readonly string[] = ALL_SCOPES,
): Promise<Tokens> {
  const { verifier, challenge } = pkcePair();
  const consent = google.oauth.consent(authorizationUrl({ challenge, scopes }), email);
  const result = await tokenRequest(google, exchangeBody(consent.code, verifier));
  return TokensSchema.parse(result.body);
}

export interface Api {
  get(url: string): Promise<Answer>;
  post(url: string, body?: unknown): Promise<Answer>;
  patch(url: string, body: unknown, headers?: Readonly<Record<string, string>>): Promise<Answer>;
  del(url: string): Promise<Answer>;
}

export function session(google: FakeGoogle, token: string): Api {
  const send = async (
    method: string,
    url: string,
    body: unknown,
    headers: Readonly<Record<string, string>>,
  ): Promise<Answer> =>
    answer(
      await google.fetch(url, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  return {
    get: (url) => send('GET', url, undefined, {}),
    post: (url, body) => send('POST', url, body, {}),
    patch: (url, body, headers = {}) => send('PATCH', url, body, headers),
    del: (url) => send('DELETE', url, undefined, {}),
  };
}

export function itemsOf(result: Answer): readonly Record<string, unknown>[] {
  return ListSchema.parse(result.body['items'] ?? []);
}

export function textOf(result: Answer, key: string): string {
  return z.string().parse(result.body[key]);
}

export function eventsUrl(calendarId: string, query = ''): string {
  const suffix = query.length === 0 ? '' : `?${query}`;
  return `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events${suffix}`;
}

export function tasksUrl(listId: string, query = ''): string {
  const suffix = query.length === 0 ? '' : `?${query}`;
  return `${TASKS_API}/lists/${listId}/tasks${suffix}`;
}
