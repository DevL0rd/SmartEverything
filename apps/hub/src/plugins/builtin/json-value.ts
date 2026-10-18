import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';

export function jsonOf(value: unknown): JsonValue {
  const raw: unknown = JSON.parse(JSON.stringify(value));
  return JSON_VALUE.parse(raw);
}
