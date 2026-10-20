import { describe, expect, it } from 'vitest';
import type { SwitchMatch } from '@smarteverything/domain';
import { SWITCH_MATCH } from '@smarteverything/domain';
import {
  MATCH_TYPES,
  caseChoices,
  convertMatch,
  matchTypeOf,
  parseValue,
  parseValues,
  rangeDraft,
  rangeMatch,
  valueText,
} from './match-model';

describe('match types', () => {
  it('names the four ways to match in words', () => {
    expect(MATCH_TYPES.map((type) => type.label)).toEqual([
      'Equals',
      'One of',
      'Between',
      'Condition',
    ]);
  });

  it('recognises each form', () => {
    expect(matchTypeOf({ eq: 1 })).toBe('eq');
    expect(matchTypeOf({ in: [1] })).toBe('in');
    expect(matchTypeOf({ range: { min: 1 } })).toBe('range');
    expect(matchTypeOf({ when: { lit: true } })).toBe('when');
  });

  it('converts between forms and always yields a valid match', () => {
    const starts: readonly SwitchMatch[] = [
      { eq: 'dim' },
      { eq: 5 },
      { in: ['a', 'b'] },
      { range: { min: 2, max: 4 } },
      { when: { wire: { from: 'x', port: 'y' } } },
    ];
    for (const start of starts) {
      for (const type of MATCH_TYPES) {
        const next = convertMatch(start, type.value);
        expect(SWITCH_MATCH.safeParse(next).success).toBe(true);
        expect(matchTypeOf(next)).toBe(type.value);
      }
    }
  });

  it('keeps the first value when going between equals and one of', () => {
    expect(convertMatch({ eq: 'dim' }, 'in')).toEqual({ in: ['dim'] });
    expect(convertMatch({ in: ['a', 'b'] }, 'eq')).toEqual({ eq: 'a' });
    expect(convertMatch({ eq: 7 }, 'range')).toEqual({ range: { min: 7, max: 7 } });
    expect(convertMatch({ eq: 'text' }, 'range')).toEqual({ range: { min: 0, max: 0 } });
    expect(convertMatch({ eq: 1 }, 'eq')).toEqual({ eq: 1 });
  });
});

describe('literal text', () => {
  it('reads numbers, booleans and null and leaves other text alone', () => {
    expect(parseValue(' 12 ')).toBe(12);
    expect(parseValue('-3.5')).toBe(-3.5);
    expect(parseValue('true')).toBe(true);
    expect(parseValue('false')).toBe(false);
    expect(parseValue('null')).toBeNull();
    expect(parseValue('on')).toBe('on');
    expect(parseValue('12abc')).toBe('12abc');
    expect(parseValue('')).toBe('');
  });

  it('splits a list on commas and drops blanks', () => {
    expect(parseValues('a, 2 ,, true')).toEqual(['a', 2, true]);
    expect(parseValues(' , ')).toEqual([]);
  });

  it('writes a value back the way it is typed', () => {
    expect(valueText('on')).toBe('on');
    expect(valueText(4)).toBe('4');
    expect(valueText(false)).toBe('false');
    expect(valueText(null)).toBe('null');
  });
});

describe('ranges', () => {
  it('shows the bounds as text and empty for other forms', () => {
    expect(rangeDraft({ range: { min: 1.5, max: 9 } })).toEqual({ min: '1.5', max: '9' });
    expect(rangeDraft({ range: { max: 9 } })).toEqual({ min: '', max: '9' });
    expect(rangeDraft({ eq: 1 })).toEqual({ min: '', max: '' });
  });

  it('builds a range from one or two bounds', () => {
    expect(rangeMatch({ min: '1', max: '3' })).toEqual({
      ok: true,
      match: { range: { min: 1, max: 3 } },
    });
    expect(rangeMatch({ min: '', max: '3' })).toEqual({ ok: true, match: { range: { max: 3 } } });
    expect(rangeMatch({ min: '0', max: '' })).toEqual({ ok: true, match: { range: { min: 0 } } });
  });

  it('says what is wrong with a bad range', () => {
    expect(rangeMatch({ min: '', max: '' })).toEqual({
      ok: false,
      reason: 'Give a lowest or highest number.',
    });
    expect(rangeMatch({ min: 'x', max: '' })).toEqual({ ok: false, reason: 'Enter numbers only.' });
    expect(rangeMatch({ min: '5', max: '1' })).toEqual({
      ok: false,
      reason: 'The lowest number is above the highest.',
    });
  });
});

describe('caseChoices', () => {
  const options = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('offers only the options no case covers yet', () => {
    expect(caseChoices([{ eq: 'a' }, { in: ['c'] }], options)).toEqual(['b']);
    expect(caseChoices([], options)).toEqual(['a', 'b', 'c']);
  });

  it('ignores ranges and conditions', () => {
    expect(caseChoices([{ range: { min: 1 } }, { when: { lit: true } }], options)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});
