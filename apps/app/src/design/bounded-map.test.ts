import { describe, expect, it } from 'vitest';
import { BoundedMap, BoundedSet } from './bounded-map';

describe('BoundedMap', () => {
  it('never holds more than its capacity and drops the least recently used entry', () => {
    const map = new BoundedMap<string, number>(3);
    for (let index = 0; index < 1000; index += 1) map.set(`k${String(index)}`, index);
    expect(map.size).toBe(3);
    expect(map.has('k999')).toBe(true);
    expect(map.has('k996')).toBe(false);
  });

  it('keeps an entry that is read while others are added', () => {
    const map = new BoundedMap<string, number>(2);
    map.set('a', 1);
    map.set('b', 2);
    expect(map.get('a')).toBe(1);
    map.set('c', 3);
    expect(map.has('a')).toBe(true);
    expect(map.has('b')).toBe(false);
  });

  it('overwrites without growing', () => {
    const map = new BoundedMap<string, number>(2);
    map.set('a', 1);
    map.set('a', 2);
    expect(map.size).toBe(1);
    expect(map.get('a')).toBe(2);
  });
});

describe('BoundedSet', () => {
  it('forgets the oldest member beyond its capacity', () => {
    const set = new BoundedSet<number>(2);
    set.add(1);
    set.add(2);
    set.add(3);
    expect(set.has(1)).toBe(false);
    expect(set.has(2)).toBe(true);
    expect(set.has(3)).toBe(true);
  });
});
