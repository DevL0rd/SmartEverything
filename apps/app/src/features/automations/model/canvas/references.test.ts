import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { referencesOf } from './references';

const keys = new Set(['light', 'level', 'inputs']);

describe('referencesOf', () => {
  it('reads a wire from a known step', () => {
    expect(referencesOf({ wire: { from: 'light', port: 'brightness' } }, keys)).toEqual([
      { key: 'light', output: 'brightness' },
    ]);
  });

  it('ignores a wire from an unknown source', () => {
    expect(referencesOf({ wire: { from: 'trigger', port: 'key' } }, keys)).toEqual([]);
  });

  it('never finds a reference in a literal', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.integer(), fc.boolean()), (lit) => {
        expect(referencesOf({ lit }, keys)).toEqual([]);
      }),
    );
  });
});
