export const REDACTED = '[redacted]';

export const DENIED_FIELDS: readonly string[] = [
  'accessSecret',
  'accessToken',
  'address',
  'apiKey',
  'api_key',
  'authorization',
  'clientSecret',
  'code',
  'deliveryAddress',
  'deviceToken',
  'email',
  'geminiKey',
  'idToken',
  'localKey',
  'local_key',
  'oneTimeCode',
  'passToken',
  'password',
  'phone',
  'refreshToken',
  'secret',
  'secretKey',
  'serviceRoleKey',
  'serviceToken',
  'sessionId',
  'shippingAddress',
  'ssecurity',
  'token',
];

const DENIED = new Set(DENIED_FIELDS.map((field) => field.toLowerCase()));

const MAXIMUM_DEPTH = 8;

export type LogPayload = Readonly<Record<string, unknown>>;

export function isDeniedField(name: string): boolean {
  return DENIED.has(name.toLowerCase());
}

function isList(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function redactUnknown(value: unknown, depth: number): unknown {
  if (depth >= MAXIMUM_DEPTH) {
    return REDACTED;
  }
  if (isList(value)) {
    return value.map((entry) => redactUnknown(entry, depth + 1));
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value !== null && typeof value === 'object') {
    return redactRecord({ ...value }, depth + 1);
  }
  return value;
}

function redactRecord(payload: LogPayload, depth: number): LogPayload {
  const output: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(payload)) {
    output[name] = isDeniedField(name) ? REDACTED : redactUnknown(value, depth);
  }
  return output;
}

export function redact(payload: LogPayload): LogPayload {
  return redactRecord(payload, 0);
}

const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)]+/gi;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const ADDRESS_PATTERN = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
const SECRET_PATTERN = /[A-Za-z0-9_-]{24,}/g;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function redactText(text: string, limit: number): string {
  return text
    .replace(URL_PATTERN, REDACTED)
    .replace(EMAIL_PATTERN, REDACTED)
    .replace(ADDRESS_PATTERN, REDACTED)
    .replace(SECRET_PATTERN, (match) => (UUID_PATTERN.test(match) ? match : REDACTED))
    .slice(0, limit);
}
