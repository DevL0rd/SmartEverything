import { describe, expect, it } from 'vitest';
import { maxPoints, newestOf, sumPoints } from './series-set';

const A = [
  { t: 1, v: 10 },
  { t: 2, v: 20 },
];
const B = [
  { t: 2, v: 5 },
  { t: 3, v: 7 },
];

describe('series sets', () => {
  it('adds readings taken at the same moment and keeps the others', () => {
    expect(sumPoints([A, B])).toEqual([
      { t: 1, v: 10 },
      { t: 2, v: 25 },
      { t: 3, v: 7 },
    ]);
  });

  it('keeps the highest of readings taken at the same moment', () => {
    expect(maxPoints([A, B])).toEqual([
      { t: 1, v: 10 },
      { t: 2, v: 20 },
      { t: 3, v: 7 },
    ]);
  });

  it('finds the newest moment of any series, or none', () => {
    expect(newestOf([A, B])).toBe(3);
    expect(newestOf([[], A])).toBe(2);
    expect(newestOf([[], []])).toBeNull();
    expect(newestOf([])).toBeNull();
  });
});
