import { describe, expect, it } from 'vitest';
import { sentenceCase } from './text';

describe('sentenceCase', () => {
  it('capitalises only the first letter and leaves the rest as written', () => {
    expect(sentenceCase('amber, white, and 2 more')).toBe('Amber, white, and 2 more');
    expect(sentenceCase('Mixed colours')).toBe('Mixed colours');
  });

  it('leaves an empty text empty', () => {
    expect(sentenceCase('')).toBe('');
  });
});
