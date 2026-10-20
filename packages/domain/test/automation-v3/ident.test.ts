import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  IDENT,
  IDENT_PATTERN,
  RESERVED_ROOTS,
  isReservedRoot,
  isReservedWord,
} from '../../src/automation-v3/ident';

describe('identifiers', () => {
  it('accepts names that start with a lowercase letter', () => {
    for (const name of ['setLight', 'a', 'kitchen_2', `a${'b'.repeat(39)}`]) {
      expect(IDENT.safeParse(name).success).toBe(true);
    }
  });

  it('rejects names that break the pattern', () => {
    for (const name of [
      '',
      'Kitchen',
      '1light',
      '_light',
      'light-2',
      'lamp lit',
      `a${'b'.repeat(40)}`,
    ]) {
      expect(IDENT.safeParse(name).success).toBe(false);
    }
  });

  it('rejects every wire source root as a name', () => {
    for (const word of RESERVED_ROOTS) {
      expect(isReservedWord(word)).toBe(true);
      expect(isReservedRoot(word)).toBe(true);
      expect(IDENT.safeParse(word).success).toBe(false);
    }
    expect(isReservedRoot('lights')).toBe(false);
    expect(IDENT.safeParse('else').success).toBe(true);
  });

  it('names the reserved word in the failure message', () => {
    const result = IDENT.safeParse('trigger');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      'trigger, inputs, vars, home and run are wire sources and cannot be used as names',
    );
  });

  it('keeps reserved words that only differ by case usable', () => {
    expect(IDENT.safeParse('triggerNow').success).toBe(true);
    expect(IDENT.safeParse('iff').success).toBe(true);
  });

  it('accepts exactly the matching non-reserved strings', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 45 }), (text) => {
        const expected = IDENT_PATTERN.test(text) && !isReservedWord(text);
        expect(IDENT.safeParse(text).success).toBe(expected);
      }),
    );
  });

  it('accepts every generated well-formed name that is not reserved', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z][A-Za-z0-9_]{0,39}$/), (name) => {
        fc.pre(!isReservedWord(name));
        expect(IDENT.parse(name)).toBe(name);
      }),
    );
  });
});
