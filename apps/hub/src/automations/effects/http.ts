import { forbiddenHeaderNames, JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import { messageOf } from '@smarteverything/logging';
import type { Clock } from '../../clock';
import { AutomationRunCancelledError } from './run-abort';
import type { AutomationSecrets } from '../secrets-v3';
import type { EffectRun } from './effect-run';
import { assertPublicHost, LocalNetworkError, publicOnlyLookup } from './http-guard';
import { exchange, HttpResponseTooLargeError, type HttpAnswer } from './http-transport';

const HTTP_REDIRECTS_MAX = 10;

type AuthScheme = 'bearer' | 'basic' | 'header' | 'query';

export type HttpErrorKind =
  'Invalid' | 'NotFound' | 'Forbidden' | 'Refused' | 'Unreachable' | 'Timeout' | 'LimitExceeded';

export class HttpEffectError extends Error {
  override readonly name = 'HttpEffectError';

  constructor(
    readonly kind: HttpErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export interface HttpAuth {
  readonly secret: string;
  readonly scheme: AuthScheme;
  readonly name?: string;
}

export interface HttpRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, string>>;
  readonly body: JsonValue | undefined;
  readonly bodyKind: 'json' | 'form' | 'text';
  readonly auth: HttpAuth | undefined;
  readonly timeoutMs: number;
  readonly followRedirects: boolean;
  readonly responseKind: 'auto' | 'json' | 'text';
  readonly acceptStatus: readonly number[];
  readonly allowLocalNetwork: boolean;
}

export interface HttpResult {
  readonly status: number;
  readonly ok: boolean;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: JsonValue;
}

interface Credential {
  readonly headers: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, string>>;
}

interface Hop {
  readonly url: URL;
  readonly method: string;
  readonly body: string | undefined;
  readonly headers: Readonly<Record<string, string>>;
  readonly credentials: Credential;
}

interface Guard {
  readonly run: Pick<EffectRun, 'runId' | 'signal'>;
  readonly timeout: AbortSignal;
}

const NO_CREDENTIAL: Credential = { headers: {}, query: {} };

const REDIRECTS: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

function credentialOf(auth: HttpAuth, value: string): Credential {
  switch (auth.scheme) {
    case 'bearer':
      return { headers: { authorization: `Bearer ${value}` }, query: {} };
    case 'basic':
      return {
        headers: {
          authorization: `Basic ${Buffer.from(`${auth.name ?? ''}:${value}`).toString('base64')}`,
        },
        query: {},
      };
    case 'header':
      return { headers: { [requiredName(auth)]: value }, query: {} };
    case 'query':
      return { headers: {}, query: { [requiredName(auth)]: value } };
  }
}

function requiredName(auth: HttpAuth): string {
  if (auth.name === undefined || auth.name === '')
    throw new HttpEffectError('Invalid', `The ${auth.scheme} secret needs a name.`);
  return auth.name;
}

function encodedBody(request: HttpRequest): { text: string | undefined; type: string | undefined } {
  const { body, bodyKind } = request;
  if (body === undefined) return { text: undefined, type: undefined };
  if (bodyKind === 'json') return { text: JSON.stringify(body), type: 'application/json' };
  if (bodyKind === 'text') {
    return {
      text: typeof body === 'string' ? body : JSON.stringify(body),
      type: 'text/plain; charset=utf-8',
    };
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    throw new HttpEffectError('Invalid', 'A form body must be a record of fields.');
  const form = new URLSearchParams(
    Object.entries(body).map(([name, value]) => [
      name,
      typeof value === 'string' ? value : JSON.stringify(value),
    ]),
  );
  return { text: form.toString(), type: 'application/x-www-form-urlencoded' };
}

function targetOf(request: HttpRequest, credentials: Credential): URL {
  if (!URL.canParse(request.url))
    throw new HttpEffectError('Invalid', 'The address is not a web address.');
  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new HttpEffectError('Invalid', 'Only http and https addresses can be called.');
  for (const [name, value] of Object.entries({ ...request.query, ...credentials.query }))
    url.searchParams.set(name, value);
  return url;
}

function decoded(answer: HttpAnswer, kind: HttpRequest['responseKind']): JsonValue {
  const text = answer.body.toString('utf8');
  const json =
    kind === 'json' || (kind === 'auto' && /json/i.test(answer.headers['content-type'] ?? ''));
  if (!json) return text;
  try {
    return JSON_VALUE.parse(JSON.parse(text));
  } catch (cause) {
    throw new HttpEffectError('Invalid', `The answer is not valid JSON: ${messageOf(cause)}`);
  }
}

function redirected(hop: Hop, answer: HttpAnswer): Hop | null {
  const location = answer.headers['location'];
  if (!REDIRECTS.has(answer.status) || location === undefined) return null;
  const url = new URL(location, hop.url);
  const keepsMethod = answer.status === 307 || answer.status === 308 || hop.method === 'HEAD';
  return {
    ...hop,
    url,
    method: keepsMethod ? hop.method : 'GET',
    body: keepsMethod ? hop.body : undefined,
    credentials: url.origin === hop.url.origin ? hop.credentials : NO_CREDENTIAL,
  };
}

export class HttpEffects {
  constructor(
    private readonly secrets: Pick<AutomationSecrets, 'resolve'>,
    private readonly clock: Pick<Clock, 'now' | 'at'>,
    private readonly transport: typeof exchange = exchange,
  ) {}

  async request(
    request: HttpRequest,
    run: Pick<EffectRun, 'runId' | 'signal'>,
  ): Promise<HttpResult> {
    const forbidden = forbiddenHeaderNames(Object.keys(request.headers));
    if (forbidden.length > 0)
      throw new HttpEffectError(
        'Invalid',
        `Use the auth option instead of the ${forbidden.join(', ')} header.`,
      );
    const credentials = this.credentialsOf(request.auth);
    const { text, type } = encodedBody(request);
    const first: Hop = {
      url: targetOf(request, credentials),
      method: request.method,
      body: text,
      headers: { ...(type === undefined ? {} : { 'content-type': type }), ...request.headers },
      credentials,
    };
    const timeout = new AbortController();
    const cancel = this.clock.at(new Date(this.clock.now().getTime() + request.timeoutMs), () => {
      timeout.abort();
    });
    try {
      const answer = await this.follow(request, first, { run, timeout: timeout.signal });
      return this.resultOf(request, answer);
    } finally {
      cancel();
    }
  }

  private credentialsOf(auth: HttpAuth | undefined): Credential {
    if (auth === undefined) return NO_CREDENTIAL;
    const value = this.secrets.resolve(auth.secret);
    if (value === null)
      throw new HttpEffectError('NotFound', 'The secret for this request is gone.');
    return credentialOf(auth, value);
  }

  private async follow(request: HttpRequest, first: Hop, guard: Guard): Promise<HttpAnswer> {
    const signal = AbortSignal.any([guard.run.signal, guard.timeout]);
    let hop = first;
    for (let followed = 0; ; followed += 1) {
      const answer = await this.send(request, hop, signal).catch((cause: unknown) => {
        throw this.failure(cause, guard, hop.url);
      });
      const next = request.followRedirects ? redirected(hop, answer) : null;
      if (next === null) return answer;
      if (followed >= HTTP_REDIRECTS_MAX)
        throw new HttpEffectError('Refused', 'The address redirects too many times.');
      hop = next;
    }
  }

  private async send(request: HttpRequest, hop: Hop, signal: AbortSignal): Promise<HttpAnswer> {
    if (!request.allowLocalNetwork) assertPublicHost(hop.url.hostname);
    return await this.transport({
      url: hop.url,
      method: hop.method,
      headers: { ...hop.headers, ...hop.credentials.headers },
      body: hop.body,
      lookup: request.allowLocalNetwork ? undefined : publicOnlyLookup,
      signal,
    });
  }

  private resultOf(request: HttpRequest, answer: HttpAnswer): HttpResult {
    const ok = answer.status >= 200 && answer.status < 300;
    if (!ok && !request.acceptStatus.includes(answer.status))
      throw new HttpEffectError('Refused', `The server answered ${String(answer.status)}.`);
    return {
      status: answer.status,
      ok,
      headers: answer.headers,
      body: request.method === 'HEAD' ? '' : decoded(answer, request.responseKind),
    };
  }

  private failure(cause: unknown, { run, timeout }: Guard, url: URL): Error {
    if (cause instanceof HttpEffectError) return cause;
    if (run.signal.aborted) return new AutomationRunCancelledError(run.runId);
    if (timeout.aborted)
      return new HttpEffectError('Timeout', `${url.host} did not answer in time.`);
    if (cause instanceof LocalNetworkError) return new HttpEffectError('Forbidden', cause.message);
    if (cause instanceof HttpResponseTooLargeError)
      return new HttpEffectError('LimitExceeded', cause.message);
    const code = cause instanceof Error && 'code' in cause ? String(cause.code) : 'failed';
    return new HttpEffectError('Unreachable', `${url.host} could not be reached (${code}).`);
  }
}
