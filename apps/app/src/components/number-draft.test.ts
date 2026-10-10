import { describe, expect, it } from 'vitest';
import { committedValue, digitsDraft, sanitizeDraft, settledValue } from './number-draft';

const GRAMS = { min: 5, max: 5000 };
const TIMES = { min: 0.1, max: 20 };

describe('sanitizeDraft', () => {
  it.each([
    ['1.', '1.'],
    ['0.', '0.'],
    ['.5', '.5'],
    ['1,5', '1.5'],
    ['1.2.3', '1.23'],
    ['12abc', '12'],
    ['-4', '4'],
    ['', ''],
  ])('turns %j into %j', (typed, expected) => {
    expect(sanitizeDraft(typed)).toBe(expected);
  });
});

describe('committedValue', () => {
  it('commits whole and decimal values in range', () => {
    expect(committedValue('250', GRAMS)).toBe(250);
    expect(committedValue('1.2', TIMES)).toBe(1.2);
    expect(committedValue('0.5', TIMES)).toBe(0.5);
    expect(committedValue('1.', TIMES)).toBe(1);
    expect(committedValue('.5', TIMES)).toBe(0.5);
  });

  it('waits while a partial entry is out of range or empty', () => {
    expect(committedValue('', GRAMS)).toBeNull();
    expect(committedValue('.', TIMES)).toBeNull();
    expect(committedValue('0.', TIMES)).toBeNull();
    expect(committedValue('1', GRAMS)).toBeNull();
    expect(committedValue('9999', GRAMS)).toBeNull();
  });
});

describe('settledValue', () => {
  it('clamps to the range when the field is left', () => {
    expect(settledValue('1', GRAMS)).toBe(5);
    expect(settledValue('9999', GRAMS)).toBe(5000);
    expect(settledValue('0.', TIMES)).toBe(0.1);
  });

  it('keeps the old value when nothing usable was typed', () => {
    expect(settledValue('', GRAMS)).toBeNull();
    expect(settledValue('.', GRAMS)).toBeNull();
  });
});

describe('time part drafts', () => {
  const MINUTES = { min: 0, max: 59 };
  const HOURS12 = { min: 1, max: 12 };

  it('keeps typed digits, at most two', () => {
    expect(digitsDraft('7')).toBe('7');
    expect(digitsDraft('0:5')).toBe('05');
    expect(digitsDraft('123')).toBe('12');
    expect(digitsDraft('ab')).toBe('');
  });

  it('commits a partial entry while it is in range', () => {
    expect(committedValue('7', MINUTES)).toBe(7);
    expect(committedValue('07', MINUTES)).toBe(7);
    expect(committedValue('0', HOURS12)).toBeNull();
    expect(committedValue('75', MINUTES)).toBeNull();
  });

  it('clamps on blur and keeps the old value when empty', () => {
    expect(settledValue('75', MINUTES)).toBe(59);
    expect(settledValue('0', HOURS12)).toBe(1);
    expect(settledValue('99', HOURS12)).toBe(12);
    expect(settledValue('', MINUTES)).toBeNull();
  });
});
