import type { JsonValue, SwitchMatch } from '@smarteverything/domain';

export type MatchType = 'eq' | 'in' | 'range' | 'when';

export const MATCH_TYPES: readonly { readonly value: MatchType; readonly label: string }[] = [
  { value: 'eq', label: 'Equals' },
  { value: 'in', label: 'One of' },
  { value: 'range', label: 'Between' },
  { value: 'when', label: 'Condition' },
];

export function matchTypeOf(match: SwitchMatch): MatchType {
  if ('eq' in match) return 'eq';
  if ('in' in match) return 'in';
  if ('range' in match) return 'range';
  return 'when';
}

export function valueText(value: JsonValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

const NUMBER_TEXT = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;

const WORD_VALUES: ReadonlyMap<string, JsonValue> = new Map([
  ['true', true],
  ['false', false],
  ['null', null],
]);

export function parseValue(text: string): JsonValue {
  const trimmed = text.trim();
  if (NUMBER_TEXT.test(trimmed)) return Number(trimmed);
  return WORD_VALUES.has(trimmed) ? (WORD_VALUES.get(trimmed) ?? null) : trimmed;
}

export function parseValues(text: string): readonly JsonValue[] {
  return text
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map(parseValue);
}

function firstValue(match: SwitchMatch): JsonValue {
  if ('eq' in match) return match.eq;
  if ('in' in match) return match.in[0] ?? '';
  if ('range' in match) return match.range.min ?? match.range.max ?? 0;
  return '';
}

export function convertMatch(match: SwitchMatch, to: MatchType): SwitchMatch {
  if (matchTypeOf(match) === to) return match;
  const first = firstValue(match);
  if (to === 'eq') return { eq: first };
  if (to === 'in') return { in: [first] };
  if (to === 'when') return { when: { lit: true } };
  const bound = typeof first === 'number' ? first : 0;
  return { range: { min: bound, max: bound } };
}

export interface RangeDraft {
  readonly min: string;
  readonly max: string;
}

export function rangeDraft(match: SwitchMatch): RangeDraft {
  if (!('range' in match)) return { min: '', max: '' };
  return {
    min: match.range.min === undefined ? '' : String(match.range.min),
    max: match.range.max === undefined ? '' : String(match.range.max),
  };
}

export type RangeResult =
  | { readonly ok: true; readonly match: SwitchMatch }
  | { readonly ok: false; readonly reason: string };

function bound(text: string): number | null | undefined {
  if (text.trim() === '') return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function rangeMatch(draft: RangeDraft): RangeResult {
  const min = bound(draft.min);
  const max = bound(draft.max);
  if (min === null || max === null) return { ok: false, reason: 'Enter numbers only.' };
  if (min === undefined && max === undefined)
    return { ok: false, reason: 'Give a lowest or highest number.' };
  if (min !== undefined && max !== undefined && min > max) {
    return { ok: false, reason: 'The lowest number is above the highest.' };
  }
  return {
    ok: true,
    match: {
      range: { ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) },
    },
  };
}

function literalsOf(match: SwitchMatch): readonly string[] {
  if ('eq' in match) return [valueText(match.eq)];
  return 'in' in match ? match.in.map(valueText) : [];
}

export function caseChoices(
  existing: readonly SwitchMatch[],
  options: readonly { readonly id: string }[],
): readonly string[] {
  const taken = new Set(existing.flatMap(literalsOf));
  return options.map((option) => option.id).filter((id) => !taken.has(id));
}
