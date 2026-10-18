import { describe, expect, it } from 'vitest';
import { trimOldest } from '../src/trim-oldest';

describe('trimOldest', () => {
  it('drops the entries added first until the map is as small as asked', () => {
    const entries = new Map([
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['d', 4],
    ]);
    trimOldest(entries, 2);
    expect([...entries.keys()]).toEqual(['c', 'd']);
  });

  it('leaves a map that already fits alone', () => {
    const entries = new Map([['a', 1]]);
    trimOldest(entries, 1);
    trimOldest(entries, 5);
    expect([...entries.keys()]).toEqual(['a']);
  });
});
