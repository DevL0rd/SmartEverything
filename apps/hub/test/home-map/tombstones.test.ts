import { describe, expect, it } from 'vitest';
import {
  mergeTombstones,
  openingIsTombstoned,
  openingTombstone,
  parseTombstone,
  parseTombstones,
  wallIsTombstoned,
  wallTombstone,
} from '../../src/home-map/merge/tombstones';

const wall = { from: { x: 4.55, y: 0.5 }, to: { x: 4.55, y: 3.5 } };

describe('a tombstone is a geometric signature of a deleted source element', () => {
  it('writes a wall the same way in either direction and reads it back', () => {
    const forward = wallTombstone(wall);
    expect(wallTombstone({ from: wall.to, to: wall.from })).toBe(forward);
    expect(parseTombstone(forward)).toEqual({
      kind: 'wall',
      segment: { from: { x: 4.55, y: 0.5 }, to: { x: 4.55, y: 3.5 } },
    });
  });

  it('writes an opening with its centre, width and kind and reads it back', () => {
    const text = openingTombstone({ x: 4.55, y: 1.45 }, 0.9, 'door');
    expect(text).toBe('opening:door:4.550,1.450,0.900');
    expect(parseTombstone(text)).toEqual({ kind: 'opening', at: { x: 4.55, y: 1.45 }, width: 0.9 });
  });

  it('ignores text it does not understand and keeps it in the list', () => {
    expect(parseTombstone('wall:1,2')).toBeNull();
    expect(parseTombstone('chair:1,2,3,4')).toBeNull();
    expect(parseTombstone('opening:door:a,b,c')).toBeNull();
    const held = ['chair:1,2,3,4', wallTombstone(wall)];
    expect(parseTombstones(held)).toHaveLength(1);
    expect(mergeTombstones(held, [])).toBe(held);
  });

  it('adds only signatures that are new', () => {
    const held = [wallTombstone(wall)];
    const next = mergeTombstones(held, [wallTombstone(wall), 'opening:door:1.000,1.000,0.900']);
    expect(next).toEqual([...held, 'opening:door:1.000,1.000,0.900']);
  });
});

describe('matching a wall', () => {
  const stones = parseTombstones([wallTombstone(wall)]);

  it('matches the same wall, a part of it, and the wall after a small move', () => {
    expect(wallIsTombstoned(stones, wall)).toBe(true);
    expect(wallIsTombstoned(stones, { from: { x: 4.55, y: 0.5 }, to: { x: 4.55, y: 2 } })).toBe(
      true,
    );
    expect(wallIsTombstoned(stones, { from: { x: 4.8, y: 0.5 }, to: { x: 4.8, y: 3.5 } })).toBe(
      true,
    );
  });

  it('does not match a wall further than the join gap or one that runs past the end', () => {
    expect(wallIsTombstoned(stones, { from: { x: 5.2, y: 0.5 }, to: { x: 5.2, y: 3.5 } })).toBe(
      false,
    );
    expect(wallIsTombstoned(stones, { from: { x: 4.55, y: 0.5 }, to: { x: 4.55, y: 6 } })).toBe(
      false,
    );
  });

  it('does not let an opening signature hide a wall', () => {
    const only = parseTombstones([openingTombstone({ x: 4.55, y: 1.45 }, 0.9, 'door')]);
    expect(wallIsTombstoned(only, wall)).toBe(false);
  });
});

describe('matching an opening', () => {
  const stones = parseTombstones([openingTombstone({ x: 4.55, y: 1.45 }, 0.9, 'door')]);

  it('matches an opening whose centre lies within half its width of the deleted one', () => {
    expect(openingIsTombstoned(stones, { x: 4.55, y: 1.45 }, 0.9)).toBe(true);
    expect(openingIsTombstoned(stones, { x: 4.55, y: 1.8 }, 0.9)).toBe(true);
  });

  it('does not match a different opening further along the wall', () => {
    expect(openingIsTombstoned(stones, { x: 4.55, y: 2.6 }, 0.9)).toBe(false);
  });
});
