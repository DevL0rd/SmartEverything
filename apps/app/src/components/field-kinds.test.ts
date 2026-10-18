import { describe, expect, it } from 'vitest';
import { FIELD_KINDS } from './field-kinds';

describe('FIELD_KINDS', () => {
  it('gives code fields a plain ascii keyboard with no capitals, autocomplete or url hints', () => {
    expect(FIELD_KINDS.code).toEqual({
      keyboardType: 'visible-password',
      autoCapitalize: 'none',
      autoComplete: 'off',
      mono: true,
    });
  });

  it('keeps the url keyboard for url fields only', () => {
    expect(FIELD_KINDS.url.keyboardType).toBe('url');
    expect(FIELD_KINDS.code.keyboardType).not.toBe('url');
  });
});
