import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';

export function jsonOf(value: unknown): JsonValue {
  return JSON_VALUE.parse(JSON.parse(JSON.stringify(value)));
}
