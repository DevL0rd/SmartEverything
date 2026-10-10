import { z } from 'zod';
import { JSON_VALUE, type JsonValue } from './values';

const NUMERIC_OPTIONS = [
  z.object({ operator: z.literal('gt'), value: z.number() }),
  z.object({ operator: z.literal('gte'), value: z.number() }),
  z.object({ operator: z.literal('lt'), value: z.number() }),
  z.object({ operator: z.literal('lte'), value: z.number() }),
  z
    .object({ operator: z.literal('between'), min: z.number(), max: z.number() })
    .refine((range) => range.min <= range.max, { message: 'min must not exceed max' }),
] as const;

export const NUMERIC_COMPARISON = z.discriminatedUnion('operator', [...NUMERIC_OPTIONS]);

export type NumericComparison = z.infer<typeof NUMERIC_COMPARISON>;

export const VALUE_COMPARISON = z.discriminatedUnion('operator', [
  z.object({ operator: z.literal('eq'), value: JSON_VALUE }),
  z.object({ operator: z.literal('ne'), value: JSON_VALUE }),
  ...NUMERIC_OPTIONS,
]);

export const COMPARISON = z.union([VALUE_COMPARISON, z.object({ operator: z.literal('changed') })]);

export type Comparison = z.infer<typeof COMPARISON>;

function isList(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function canonicalForm(value: JsonValue): JsonValue {
  if (isList(value)) {
    return value.map(canonicalForm);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalForm(entry)]),
    );
  }
  return value;
}

export function jsonEquals(left: JsonValue, right: JsonValue): boolean {
  return JSON.stringify(canonicalForm(left)) === JSON.stringify(canonicalForm(right));
}

export function compareNumber(comparison: NumericComparison, value: number): boolean {
  switch (comparison.operator) {
    case 'gt':
      return value > comparison.value;
    case 'gte':
      return value >= comparison.value;
    case 'lt':
      return value < comparison.value;
    case 'lte':
      return value <= comparison.value;
    case 'between':
      return value >= comparison.min && value <= comparison.max;
  }
}

export function compare(
  comparison: Comparison,
  value: JsonValue | undefined,
  previous: JsonValue | undefined,
): boolean {
  if (value === undefined) {
    return false;
  }
  if (comparison.operator === 'changed') {
    return previous !== undefined && !jsonEquals(value, previous);
  }
  if (comparison.operator === 'eq' || comparison.operator === 'ne') {
    return jsonEquals(value, comparison.value) === (comparison.operator === 'eq');
  }
  return typeof value === 'number' && compareNumber(comparison, value);
}
