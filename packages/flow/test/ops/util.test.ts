import { describe, expect, it } from 'vitest';
import { canonical, compact } from '../../src/ops/util';

describe('compact', () => {
  it('drops undefined properties', () => {
    expect(compact({ a: 1, b: undefined, c: null })).toEqual({ a: 1, c: null });
    expect(Object.keys(compact({ a: undefined }))).toEqual([]);
  });
});

describe('canonical', () => {
  it('ignores key order and undefined values', () => {
    expect(canonical({ b: 1, a: { d: [1, { y: 1, x: 2 }], c: undefined } })).toBe(
      canonical({ a: { c: undefined, d: [1, { x: 2, y: 1 }] }, b: 1 }),
    );
    expect(canonical({ a: 1 })).not.toBe(canonical({ a: 2 }));
  });
});
