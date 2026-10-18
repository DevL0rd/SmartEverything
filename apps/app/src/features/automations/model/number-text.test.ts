import { describe, expect, it } from 'vitest';
import { numberText, numberValid, parsedNumber, shownText } from './number-text';

describe('number fields', () => {
  it('shows what the value is unless the person is typing', () => {
    expect(shownText(null, 12)).toBe('12');
    expect(shownText('1', 12)).toBe('1');
    expect(shownText(null, undefined)).toBe('');
  });

  it('follows the value again after typing ends, so a clamped sibling shows its new number', () => {
    const typed = shownText('50', 50);
    expect(typed).toBe('50');
    expect(shownText(null, 30)).toBe('30');
  });

  it('reads decimals with a comma, negatives and nothing else', () => {
    expect(parsedNumber('2,5')).toBe(2.5);
    expect(parsedNumber(' -4 ')).toBe(-4);
    expect(parsedNumber('')).toBeNull();
    expect(parsedNumber('abc')).toBeNull();
    expect(numberText(Number.NaN)).toBe('');
  });

  it('allows an empty field only when the field is optional', () => {
    expect(numberValid('', true)).toBe(true);
    expect(numberValid('', false)).toBe(false);
    expect(numberValid('x', true)).toBe(false);
  });
});
