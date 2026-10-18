import { z } from 'zod';
import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';

export type JsonRecord = Readonly<Record<string, JsonValue>>;

const JSON_RECORD = z.record(z.string(), JSON_VALUE);

export function recordOf(value: unknown): JsonRecord | null {
  const parsed = JSON_RECORD.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function atPath(value: unknown, path: readonly string[]): JsonValue | undefined {
  const [first, ...rest] = path;
  if (first === undefined) return undefined;
  const found = recordOf(value)?.[first];
  return rest.length === 0 ? found : atPath(found, rest);
}

export function withPath(value: JsonRecord, path: readonly string[], next: JsonValue): JsonRecord {
  const [first, ...rest] = path;
  if (first === undefined) throw new Error('A setting path must have a name.');
  if (rest.length === 0) return { ...value, [first]: next };
  return { ...value, [first]: withPath(recordOf(value[first]) ?? {}, rest, next) };
}
