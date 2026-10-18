import { describe, expect, it } from 'vitest';
import {
  bytes,
  compact,
  decimal,
  kilocalories,
  kilometres,
  litres,
  percent,
  rounded,
  withUnit,
} from './number';

const NBSP = ' ';

describe('numbers with units', () => {
  it('joins a value and its unit with a no-break space so they never wrap apart', () => {
    expect(withUnit('21', 'kcal')).toBe(`21${NBSP}kcal`);
    expect(kilometres(220)).toBe(`0.22${NBSP}km`);
    expect(kilocalories(21)).toBe(`21${NBSP}kcal`);
    expect(litres(1250)).toBe(`1.25${NBSP}L`);
  });

  it('keeps the unit of a percentage or a size on the same line as its value', () => {
    expect(percent(0.5)).toBe(`50${NBSP}%`);
    expect(bytes(2048)).toBe(`2.0${NBSP}KB`);
    expect(bytes(512)).toBe(`512${NBSP}B`);
  });

  it('attaches percent and degree units directly and drops a missing unit', () => {
    expect(withUnit('97', '%')).toBe('97%');
    expect(withUnit('36.6', '°')).toBe('36.6°');
    expect(withUnit('5', '')).toBe('5');
    expect(withUnit('5', null)).toBe('5');
  });
});

describe('locale numbers', () => {
  it('groups thousands and fixes the number of decimals', () => {
    expect(decimal(5106)).toBe((5106).toLocaleString());
    expect(decimal(1, 2)).toBe('1.00');
  });

  it('keeps up to the given decimals and drops empty ones', () => {
    expect(rounded(4.25, 1)).toBe('4.3');
    expect(rounded(4, 1)).toBe('4');
    expect(rounded(0.04, 1)).toBe('0');
  });

  it('writes large values compactly', () => {
    expect(compact(12_400)).toBe('12.4K');
    expect(compact(1_250_000)).toBe('1.3M');
    expect(compact(950)).toBe('950');
  });
});
