import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import type { EventTombstone, GoogleEvent } from '@smarteverything/google';
import { MapError } from './calendar-map';

export interface Batch {
  readonly upserts: GoogleEvent[];
  readonly tombstones: EventTombstone[];
  readonly seen: Set<string>;
  readonly full: boolean;
  syncToken: string | null;
}

export function jsonOr(value: unknown): JsonValue {
  const parsed = JSON_VALUE.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function recoverable(cause: unknown): boolean {
  return cause instanceof MapError || cause instanceof RangeError;
}
