import { describe, expect, it } from 'vitest';
import { codeComplete } from './verification-code';

describe('codeComplete', () => {
  it('needs every digit of the code', () => {
    expect(codeComplete('1234')).toBe(false);
    expect(codeComplete('12345')).toBe(false);
    expect(codeComplete('123456')).toBe(true);
  });

  it('is not complete when empty', () => {
    expect(codeComplete('')).toBe(false);
  });
});
