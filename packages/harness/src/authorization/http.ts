import { z } from 'zod';
import { SubscriptionProviderError } from '../providers/errors';

const HTTP_TIMEOUT_MS = 30000;
const MAX_AUTH_BODY_BYTES = 1048576;
const FAILURE_BODY = z.object({
  error: z.union([z.string(), z.object({ code: z.string().optional() })]).optional(),
});
const TERMINAL_REFRESH_CODES = new Set([
  'invalid_grant',
  'invalid_refresh_token',
  'token_expired',
  'refresh_token_expired',
  'refresh_token_invalidated',
  'refresh_token_reused',
]);

export class SubscriptionHttpError extends SubscriptionProviderError {
  constructor(
    readonly terminalRefresh: boolean,
    status: number,
  ) {
    super('AUTH_INVALID', 'Subscription authorization HTTP request was rejected.', status);
  }
}

export async function subscriptionJson(
  fetcher: typeof fetch,
  url: string,
  options: RequestInit,
): Promise<unknown> {
  const signal =
    options.signal === undefined || options.signal === null
      ? AbortSignal.timeout(HTTP_TIMEOUT_MS)
      : AbortSignal.any([options.signal, AbortSignal.timeout(HTTP_TIMEOUT_MS)]);
  const response = await fetcher(url, { ...options, signal, redirect: 'error' });
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_AUTH_BODY_BYTES)
    throw new SubscriptionProviderError(
      'PROVIDER_UNAVAILABLE',
      'Subscription response exceeded the allowed size.',
    );
  const parsed = parseSubscriptionJson(text);
  if (!response.ok) {
    const failure = FAILURE_BODY.safeParse(parsed);
    const error = failure.success ? failure.data.error : undefined;
    const code = typeof error === 'string' ? error : error?.code;
    const terminal = code !== undefined && TERMINAL_REFRESH_CODES.has(code);
    throw new SubscriptionHttpError(terminal, response.status);
  }
  return parsed;
}

function parseSubscriptionJson(text: string): unknown {
  try {
    return z.unknown().parse(JSON.parse(text));
  } catch (error) {
    throw new SubscriptionProviderError(
      'PROVIDER_UNAVAILABLE',
      `Subscription endpoint returned invalid JSON (${error instanceof Error ? error.name : 'unknown'}).`,
    );
  }
}
