import { describe, expect, it } from 'vitest';
import { widestOf } from './figure-width';

describe('widestOf', () => {
  it('reserves three whole digits and keeps the decimals of a number', () => {
    expect(widestOf('7')).toBe('888');
    expect(widestOf('7.4')).toBe('888.8');
    expect(widestOf('1234.56')).toBe('8888.88');
  });

  it('leaves text as it is', () => {
    expect(widestOf('—')).toBe('—');
    expect(widestOf('12 h')).toBe('12 h');
  });
});
