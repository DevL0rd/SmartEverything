import { ApiErrorSchema, TokenErrorSchema } from './schemas-oauth';

export type GoogleFailure =
  | { readonly kind: 'invalid_grant' }
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'gone' }
  | { readonly kind: 'precondition_failed' }
  | { readonly kind: 'already_exists' }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'rate_limited'; readonly reason: string | null }
  | { readonly kind: 'rejected'; readonly status: number; readonly message: string }
  | { readonly kind: 'unavailable'; readonly status: number };

const RATE_REASONS = new Set([
  'rateLimitExceeded',
  'userRateLimitExceeded',
  'quotaExceeded',
  'dailyLimitExceeded',
  'RATE_LIMIT_EXCEEDED',
]);

function failureReason(body: unknown): { reason: string | null; message: string } {
  const parsed = ApiErrorSchema.safeParse(body);
  if (!parsed.success) return { reason: null, message: '' };
  return {
    reason: parsed.data.error.errors?.[0]?.reason ?? null,
    message: parsed.data.error.message,
  };
}

function isInvalidGrant(body: unknown): boolean {
  const parsed = TokenErrorSchema.safeParse(body);
  return parsed.success && parsed.data.error === 'invalid_grant';
}

export function classifyTokenFailure(status: number, body: unknown): GoogleFailure {
  if (isInvalidGrant(body)) return { kind: 'invalid_grant' };
  if (status >= 500) return { kind: 'unavailable', status };
  const parsed = TokenErrorSchema.safeParse(body);
  return {
    kind: 'rejected',
    status,
    message: parsed.success ? parsed.data.error : `HTTP ${String(status)}`,
  };
}

const STATUS_FAILURES: ReadonlyMap<number, GoogleFailure> = new Map([
  [401, { kind: 'unauthorized' }],
  [404, { kind: 'not_found' }],
  [409, { kind: 'already_exists' }],
  [410, { kind: 'gone' }],
  [412, { kind: 'precondition_failed' }],
]);

function isRateLimited(status: number, reason: string | null): boolean {
  return status === 429 || (status === 403 && reason !== null && RATE_REASONS.has(reason));
}

export function classifyApiFailure(status: number, body: unknown): GoogleFailure {
  const { reason, message } = failureReason(body);
  const known = STATUS_FAILURES.get(status);
  if (known !== undefined) return known;
  if (isRateLimited(status, reason)) return { kind: 'rate_limited', reason };
  if (status >= 500) return { kind: 'unavailable', status };
  return { kind: 'rejected', status, message };
}
