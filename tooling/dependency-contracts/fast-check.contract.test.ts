import { describe, expect, it } from 'vitest';
import { itIsPinnedToItsDeclaredVersion } from './contract-helpers';
import fc from 'fast-check';

describe('fast-check contract', () => {
  itIsPinnedToItsDeclaredVersion('fast-check');

  it('passes a property that holds for every generated value', () => {
    fc.assert(
      fc.property(fc.integer(), (value) => {
        expect(value + 0).toBe(value);
      }),
    );
  });

  it('throws when a property does not hold, so failures are not silent', () => {
    expect(() => {
      fc.assert(
        fc.property(fc.integer({ min: 1 }), (value) => {
          expect(value).toBeLessThan(0);
        }),
      );
    }).toThrow();
  });

  it('shrinks a counterexample toward the smallest failing input', () => {
    try {
      fc.assert(
        fc.property(fc.integer({ min: 0 }), (value) => {
          expect(value).toBeLessThan(5);
        }),
        { seed: 1 },
      );
      expect.unreachable('the property should have failed');
    } catch (error) {
      expect(String(error)).toContain('5');
    }
  });
});
