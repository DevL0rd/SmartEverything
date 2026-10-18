import { describe, expect, it } from 'vitest';
import { RetiredOperations } from '../src/server/retired-operations';

describe('retired operations', () => {
  it('remembers retired operations so late replies can be ignored', () => {
    const retired = new RetiredOperations(2);
    retired.add('a');
    expect(retired.has('a')).toBe(true);
    expect(retired.has('b')).toBe(false);
  });

  it('forgets the oldest operation once the limit is exceeded', () => {
    const retired = new RetiredOperations(2);
    retired.add('a');
    retired.add('b');
    retired.add('c');
    expect([retired.has('a'), retired.has('b'), retired.has('c')]).toStrictEqual([
      false,
      true,
      true,
    ]);
  });
});
