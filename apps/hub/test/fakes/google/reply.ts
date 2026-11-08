export interface Reply {
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

export function ok(body: unknown): Reply {
  return { status: 200, body };
}

export function noContent(): Reply {
  return { status: 204, body: null };
}

const STATUS_NAMES: ReadonlyMap<number, string> = new Map([
  [400, 'INVALID_ARGUMENT'],
  [401, 'UNAUTHENTICATED'],
  [403, 'PERMISSION_DENIED'],
  [404, 'NOT_FOUND'],
  [409, 'ALREADY_EXISTS'],
  [412, 'FAILED_PRECONDITION'],
  [429, 'RESOURCE_EXHAUSTED'],
  [500, 'INTERNAL'],
  [503, 'UNAVAILABLE'],
]);

export class HttpFailure extends Error {
  override readonly name = 'HttpFailure';
  readonly status: number;
  readonly body: unknown;
  readonly headers: Readonly<Record<string, string>>;

  constructor(status: number, body: unknown, headers: Readonly<Record<string, string>> = {}) {
    super(`HTTP ${String(status)}`);
    this.status = status;
    this.body = body;
    this.headers = headers;
  }
}

export interface FailureExtra {
  readonly domain?: string;
  readonly location?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export function apiFailure(
  status: number,
  message: string,
  reason: string,
  extra: FailureExtra = {},
): HttpFailure {
  const detail = {
    message,
    domain: extra.domain ?? 'global',
    reason,
    ...(extra.location === undefined ? {} : { location: extra.location, locationType: 'header' }),
  };
  const name = STATUS_NAMES.get(status);
  const error = {
    code: status,
    message,
    errors: [detail],
    ...(name === undefined ? {} : { status: name }),
  };
  return new HttpFailure(status, { error }, extra.headers);
}

export function tokenFailure(status: number, error: string, description?: string): HttpFailure {
  const body = description === undefined ? { error } : { error, error_description: description };
  return new HttpFailure(status, body);
}

export function checkIfMatch(etag: string, header: string | null): void {
  if (header === null || header === '*' || header === etag) return;
  throw apiFailure(412, 'Precondition Failed', 'conditionNotMet', { location: 'If-Match' });
}
