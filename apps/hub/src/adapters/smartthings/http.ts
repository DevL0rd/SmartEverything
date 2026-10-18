import type { ProviderProblem } from '@smarteverything/domain';
import { failureLine, Logger } from '@smarteverything/logging';
import {
  describeErrorEnvelope,
  ERROR_ENVELOPE,
  SMARTTHINGS_API,
} from '@smarteverything/smartthings';

const log = new Logger('hub.smartthings');

export interface SmartThingsIo {
  readonly fetch: typeof fetch;
  readonly now: () => Date;
}

export const JSON_ACCEPT = 'application/json';

export class SmartThingsHttpError extends Error {
  override readonly name = 'SmartThingsHttpError';

  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    readonly description: string,
  ) {
    super(`SmartThings answered ${method} ${path} with HTTP ${String(status)}: ${description}.`);
  }
}

export class SmartThingsRateLimitError extends SmartThingsHttpError {
  readonly problem: ProviderProblem = 'rate_limited';

  constructor(
    method: string,
    path: string,
    description: string,
    readonly resetSeconds: number | null,
  ) {
    super(method, path, 429, description);
  }
}

function resetSecondsOf(response: Response): number | null {
  const reset = Number.parseInt(response.headers.get('x-ratelimit-reset') ?? '', 10);
  return Number.isInteger(reset) && reset >= 0 ? reset : null;
}

export async function bodyOf(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === '') {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (cause) {
    if (response.ok) {
      throw new SmartThingsHttpError(
        'READ',
        response.url,
        response.status,
        `not JSON: ${failureLine(cause)}`,
      );
    }
    return text;
  }
}

export function describeBody(body: unknown): string {
  const envelope = ERROR_ENVELOPE.safeParse(body);
  if (envelope.success) {
    return describeErrorEnvelope(envelope.data);
  }
  return typeof body === 'string' ? body : JSON.stringify(body);
}

export interface AccessTokens {
  readonly accessToken: () => Promise<string>;
  readonly refresh: () => Promise<void>;
}

export interface ApiRequest {
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly path: string;
  readonly accept?: string;
  readonly body?: unknown;
}

function urlOf(path: string): string {
  return path.startsWith('https://') ? path : `${SMARTTHINGS_API}${path}`;
}

function send(io: SmartThingsIo, token: string, request: ApiRequest): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: request.accept ?? JSON_ACCEPT,
  };
  if (request.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  return io.fetch(urlOf(request.path), {
    method: request.method,
    headers,
    ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
  });
}

async function settle(request: ApiRequest, response: Response): Promise<unknown> {
  const body = await bodyOf(response);
  if (response.status === 429) {
    throw new SmartThingsRateLimitError(
      request.method,
      request.path,
      describeBody(body),
      resetSecondsOf(response),
    );
  }
  if (!response.ok) {
    throw new SmartThingsHttpError(
      request.method,
      request.path,
      response.status,
      describeBody(body),
    );
  }
  return body;
}

export async function requestWithToken(
  io: SmartThingsIo,
  token: string,
  request: ApiRequest,
): Promise<unknown> {
  return settle(request, await send(io, token, request));
}

export class SmartThingsApi {
  constructor(
    private readonly io: SmartThingsIo,
    private readonly tokens: AccessTokens,
  ) {}

  async request(request: ApiRequest): Promise<unknown> {
    const startedAt = performance.now();
    const fields = { method: request.method, path: request.path };
    try {
      const first = await send(this.io, await this.tokens.accessToken(), request);
      if (first.status !== 401) {
        const body = await settle(request, first);
        log.debug('smartthings.request_finished', () => ({
          ...fields,
          status: first.status,
          durationMs: Math.round(performance.now() - startedAt),
        }));
        return body;
      }
      log.info('smartthings.token_rejected', {
        ...fields,
        durationMs: Math.round(performance.now() - startedAt),
      });
      await this.tokens.refresh();
      const retried = await send(this.io, await this.tokens.accessToken(), request);
      const body = await settle(request, retried);
      log.info('smartthings.request_retried', {
        ...fields,
        status: retried.status,
        durationMs: Math.round(performance.now() - startedAt),
      });
      return body;
    } catch (cause) {
      const status = cause instanceof SmartThingsHttpError ? cause.status : undefined;
      log.warn('smartthings.request_failed', {
        ...fields,
        status,
        resetSeconds: cause instanceof SmartThingsRateLimitError ? cause.resetSeconds : undefined,
        reason: cause instanceof Error ? cause.name : 'unknown',
        durationMs: Math.round(performance.now() - startedAt),
      });
      throw cause;
    }
  }
}
