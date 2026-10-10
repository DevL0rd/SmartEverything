export const REDACTED = '[redacted]';

export const DENIED_FIELDS: readonly string[] = [
  'accessSecret',
  'accessToken',
  'address',
  'apiKey',
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
