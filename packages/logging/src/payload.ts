export type LogPayload = Readonly<Record<string, unknown>>;

/** A marker for a value a person chose to hide. Logs are never rewritten with it. */
export const REDACTED = '[redacted]';

const CYCLIC = '[circular]';

export function clip(text: string, limit: number): string {
  return text.slice(0, limit);
}

function plain(value: unknown, path: Set<object>): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (path.has(value)) {
    return CYCLIC;
  }
  path.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry) => plain(entry, path));
    }
    return Object.fromEntries(
      Object.entries(value).map(([name, entry]) => [name, plain(entry, path)]),
    );
  } finally {
    path.delete(value);
  }
}

export function payloadOf(value: LogPayload): LogPayload {
  return plain(value, new Set<object>()) as LogPayload;
}
