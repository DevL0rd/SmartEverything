import { ValueStore } from '../design/external-store';
import { HEALTH_PREFIX } from './keys';

export const ENTRIES_PREFIX = [...HEALTH_PREFIX, 'entries'] as const;

export function entriesKey(
  from: number,
  to: number,
  types: string,
): readonly ['window', 'health', 'entries', number, number, string] {
  return [...ENTRIES_PREFIX, from, to, types];
}

export const FOODS_KEY = [...HEALTH_PREFIX, 'foods'] as const;

export function foodSearchKey(query: string): readonly ['window', 'food-search', string] {
  return ['window', 'food-search', query];
}

export const entryChanges = new ValueStore(0);
