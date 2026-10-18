import type { z } from 'zod';
import { messageOf } from '@smarteverything/logging';

export type OpenRouterErrorCode =
  | 'no_key'
  | 'unauthorized'
  | 'no_credits'
  | 'rate_limited'
  | 'unavailable'
  | 'bad_request'
  | 'not_found'
  | 'refused'
  | 'unreadable'
  | 'failed';

export class OpenRouterError extends Error {
  override readonly name = 'OpenRouterError';

  constructor(
    readonly code: OpenRouterErrorCode,
    message: string,
    readonly status: number | null = null,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
  }

  get retryable(): boolean {
    return this.code === 'rate_limited' || this.code === 'unavailable';
  }
}

const CAUSE_DEPTH = 4;

const STATUS_CODES: Readonly<Record<number, OpenRouterErrorCode>> = {
  400: 'bad_request',
  401: 'unauthorized',
  402: 'no_credits',
  403: 'refused',
  404: 'not_found',
  408: 'unavailable',
  429: 'rate_limited',
  502: 'unavailable',
  503: 'unavailable',
  504: 'unavailable',
};

const FRIENDLY: Readonly<Record<OpenRouterErrorCode, string>> = {
  no_key: 'Add an OpenRouter key in Settings › AI first',
  unauthorized: 'OpenRouter didn’t accept the key',
  no_credits: 'OpenRouter is out of credits. Top up to keep chatting',
  rate_limited: 'OpenRouter is busy right now. Try again in a moment',
  unavailable: 'OpenRouter or the model’s provider is unavailable right now',
  bad_request: 'OpenRouter refused the request',
  not_found: 'OpenRouter doesn’t have that',
  refused: 'OpenRouter refused this',
  unreadable: 'OpenRouter sent an answer this app can’t read',
  failed: 'OpenRouter failed',
};

function causeChain(cause: unknown): string[] {
  const parts: string[] = [];
  let current: unknown = cause;
  while (current instanceof Error && parts.length < CAUSE_DEPTH) {
    const code: unknown = Reflect.get(current, 'code');
    parts.push(typeof code === 'string' ? `${current.message} [${code}]` : current.message);
    current = current.cause;
  }
  return parts;
}

export function networkFailure(cause: unknown): string {
  const parts = causeChain(cause);
  return parts.length === 0 ? String(cause) : parts.join(': ');
}

export function errorCodeOf(status: number): OpenRouterErrorCode {
  return STATUS_CODES[status] ?? (status >= 500 ? 'unavailable' : 'failed');
}

export function openRouterError(
  code: OpenRouterErrorCode,
  detail: string | null,
  status: number | null = null,
  retryAfterMs: number | null = null,
): OpenRouterError {
  const base = FRIENDLY[code];
  return new OpenRouterError(
    code,
    detail === null ? `${base}.` : `${base} (${detail}).`,
    status,
    retryAfterMs,
  );
}

export type JsonRead =
  { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly reason: string };

export function readJson(text: string): JsonRead {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (cause) {
    return { ok: false, reason: messageOf(cause) };
  }
}

export function readAs<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue === undefined ? what : `${what} ${issue.path.join('.')}: ${issue.message}`;
    throw openRouterError('unreadable', where);
  }
  return parsed.data;
}
