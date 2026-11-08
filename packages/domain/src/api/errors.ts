import { z } from 'zod';

export const API_ERROR_CODES = [
  'invalid_request',
  'unauthorized',
  'forbidden',
  'ownership_lost',
  'not_found',
  'method_not_allowed',
  'conflict',
  'link_expired',
  'payload_too_large',
  'unsupported_media_type',
  'command_refused',
  'pairing_code_invalid',
  'public_url_not_verified',
  'rate_limited',
  'internal',
  'upstream_failed',
  'camera_unavailable',
  'camera_offline',
  'camera_privacy_on',
  'firewall_blocked',
  'camera_busy',
  'claude_not_ready',
  'computer_update_required',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const API_ERROR_STATUS: Readonly<Record<ApiErrorCode, number>> = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  ownership_lost: 409,
  not_found: 404,
  method_not_allowed: 405,
  conflict: 409,
  link_expired: 410,
  payload_too_large: 413,
  unsupported_media_type: 415,
  command_refused: 422,
  pairing_code_invalid: 422,
  public_url_not_verified: 422,
  rate_limited: 429,
  internal: 500,
  upstream_failed: 502,
  camera_unavailable: 503,
  camera_offline: 409,
  camera_privacy_on: 409,
  firewall_blocked: 503,
  camera_busy: 429,
  claude_not_ready: 503,
  computer_update_required: 426,
};

export const API_ERROR = z.strictObject({
  error: z.strictObject({
    code: z.enum(API_ERROR_CODES),
    message: z.string().min(1),
    reason: z.string().min(1).optional(),
  }),
});

export type ApiErrorBody = z.infer<typeof API_ERROR>;

export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly status: number;

  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly reason: string | null = null,
  ) {
    super(message);
    this.status = API_ERROR_STATUS[code];
  }

  body(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.reason === null ? {} : { reason: this.reason }),
      },
    };
  }
}

export function apiErrorOf(status: number, body: unknown): ApiError {
  const parsed = API_ERROR.safeParse(body);
  if (!parsed.success) {
    return new ApiError(
      'upstream_failed',
      `The server answered HTTP ${String(status)} without an error envelope: ${JSON.stringify(body)}.`,
    );
  }
  return new ApiError(
    parsed.data.error.code,
    parsed.data.error.message,
    parsed.data.error.reason ?? null,
  );
}
