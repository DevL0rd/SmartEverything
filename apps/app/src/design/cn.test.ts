import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('joins only non-empty strings in order', () => {
    expect(cn('a', false, null, undefined, '', 'b', 'c d')).toBe('a b c d');
    expect(cn()).toBe('');
    expect(cn('', false)).toBe('');
  });
});
