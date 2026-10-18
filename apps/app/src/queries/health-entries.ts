import { ValueStore } from '../design/external-store';
import { HEALTH_PREFIX } from './keys';

export const ENTRIES_PREFIX = [...HEALTH_PREFIX, 'entries'] as const;

export function entryKey(id: string): readonly ['window', 'health', 'entry', string] {
  return [...HEALTH_PREFIX, 'entry', id];
}

export function entriesKey(
  from: number,
  to: number,
  types: string,
): readonly ['window', 'health', 'entries', number, number, string] {
  return [...ENTRIES_PREFIX, from, to, types];
}

export function entryInWindow(
  key: readonly unknown[],
  row: { readonly start_time: string; readonly record_type: string },
): boolean {
  const [, , , from, to, types] = key;
  if (typeof from !== 'number' || typeof to !== 'number' || typeof types !== 'string') {
    return false;
  }
  const at = Date.parse(row.start_time);
  return at >= from && at < to && (types === '' || types.split(',').includes(row.record_type));
}

export const FOODS_KEY = [...HEALTH_PREFIX, 'foods'] as const;

export function foodSearchKey(query: string): readonly ['window', 'food-search', string] {
  return ['window', 'food-search', query];
}

export const entryChanges = new ValueStore(0);
