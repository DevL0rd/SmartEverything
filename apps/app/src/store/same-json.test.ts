import { describe, expect, it } from 'vitest';
import { sameJson } from './same-json';

describe('sameJson', () => {
  it('matches equal nested values', () => {
    expect(sameJson({ a: [1, { b: null }], c: 'x' }, { c: 'x', a: [1, { b: null }] })).toBe(true);
  });

  it('tells different values apart', () => {
    expect(sameJson({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameJson([1, 2], [1])).toBe(false);
    expect(sameJson({ a: 1 }, { b: 1 })).toBe(false);
    expect(sameJson(null, {})).toBe(false);
    expect(sameJson([], {})).toBe(false);
  });
});
