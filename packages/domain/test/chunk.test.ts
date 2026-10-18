import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { chunk } from '../src';

describe('chunk', () => {
  it('splits any list into consecutive slices of the given size with only the last one shorter', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), fc.integer({ min: 1, max: 20 }), (items, size) => {
        const chunks = chunk(items, size);
        expect(chunks.flat()).toStrictEqual(items);
        expect(chunks.every((part) => part.length > 0 && part.length <= size)).toBe(true);
        expect(chunks.slice(0, -1).every((part) => part.length === size)).toBe(true);
      }),
    );
  });

  it('splits text into pieces of the given width', () => {
    expect(chunk('0102030', 2)).toStrictEqual(['01', '02', '03', '0']);
    expect(chunk('', 4)).toStrictEqual([]);
  });
});
