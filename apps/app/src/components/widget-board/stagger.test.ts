import { beforeEach, describe, expect, it } from 'vitest';
import { firstMount, firstScreenCount, forgetSettled, mountOrder, settle } from './stagger';
import type { Placement } from './packer';

function placement(key: string, col: number, row: number): Placement {
  return { widget: { key, type: 'x', size: 'M' }, col, row, cols: 1, rows: 1 };
}

describe('stagger', () => {
  const placements = [placement('c', 0, 2), placement('a', 1, 0), placement('b', 0, 0)];

  it('orders by row then column', () => {
    const order = mountOrder(placements);
    expect([order.get('b'), order.get('a'), order.get('c')]).toEqual([0, 1, 2]);
  });

  it('counts the tiles that start within two screens, at least one', () => {
    expect(firstScreenCount(placements, 100, 100)).toBe(2);
    expect(firstScreenCount(placements, 100, 0)).toBe(1);
  });

  describe('settled boards', () => {
    beforeEach(forgetSettled);

    it('mounts only the tiles within two screens on the first open of a page', () => {
      expect(firstMount('home', placements, 100, 100)).toBe(2);
    });

    it('remounts every tile that was already shown, so a resize does not replay the deferral', () => {
      settle('home', 3);
      expect(firstMount('home', placements, 100, 100)).toBe(3);
      expect(firstMount('devices', placements, 100, 100)).toBe(2);
    });

    it('never forgets a larger settled count', () => {
      settle('home', 3);
      settle('home', 1);
      expect(firstMount('home', placements, 100, 0)).toBe(3);
    });
  });
});
