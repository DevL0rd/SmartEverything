import { describe, expect, it } from 'vitest';
import {
  NO_SLOT,
  TAP_SLOP,
  columnOfSlot,
  holdOutcome,
  movedPastSlop,
  reorderedKeys,
  shiftOffset,
  shiftedSlot,
  barTarget,
  targetSlot,
  type BarShape,
} from './nav-bar-drag';

const WITH_ORB: BarShape = { count: 4, orb: true };
const NO_ORB: BarShape = { count: 4, orb: false };
const WIDTH = 100;
const BAR = { columnWidth: WIDTH, shape: WITH_ORB };

describe('bar columns', () => {
  it('skips the orb column in the middle', () => {
    expect([0, 1, 2, 3].map((slot) => columnOfSlot(slot, WITH_ORB))).toEqual([0, 1, 3, 4]);
  });

  it('uses consecutive columns when the orb is absent', () => {
    expect([0, 1, 2, 3].map((slot) => columnOfSlot(slot, NO_ORB))).toEqual([0, 1, 2, 3]);
  });

  it('puts the orb after the larger half when the bar has an odd number of slots', () => {
    const shape: BarShape = { count: 3, orb: true };
    expect([0, 1, 2].map((slot) => columnOfSlot(slot, shape))).toEqual([0, 1, 3]);
  });
});

describe('target slot of a drag', () => {
  it('stays put for a small move', () => {
    expect(targetSlot(1, 30, WIDTH, WITH_ORB)).toBe(1);
  });

  it('moves one slot per column dragged', () => {
    expect(targetSlot(0, 100, WIDTH, WITH_ORB)).toBe(1);
    expect(targetSlot(3, -100, WIDTH, WITH_ORB)).toBe(2);
  });

  it('jumps over the orb column in either direction', () => {
    expect(targetSlot(1, 200, WIDTH, WITH_ORB)).toBe(2);
    expect(targetSlot(2, -200, WIDTH, WITH_ORB)).toBe(1);
  });

  it('settles on the neighbour when released on the orb', () => {
    expect(targetSlot(1, 100, WIDTH, WITH_ORB)).toBe(2);
    expect(targetSlot(3, -100, WIDTH, WITH_ORB)).toBe(2);
  });

  it('clamps to the first and last slot', () => {
    expect(targetSlot(1, -900, WIDTH, WITH_ORB)).toBe(0);
    expect(targetSlot(1, 900, WIDTH, WITH_ORB)).toBe(3);
  });

  it('ignores a bar that has not been measured', () => {
    expect(targetSlot(2, 500, 0, WITH_ORB)).toBe(2);
  });
});

describe('displaced slots', () => {
  it('moves the neighbours between the origin and the target one place back', () => {
    expect([0, 1, 2, 3].map((slot) => shiftedSlot(slot, 0, 2))).toEqual([2, 0, 1, 3]);
  });

  it('moves them forward when dragging leftwards', () => {
    expect([0, 1, 2, 3].map((slot) => shiftedSlot(slot, 3, 1))).toEqual([0, 2, 3, 1]);
  });

  it('measures the displacement in columns, including the orb column', () => {
    expect(shiftOffset(2, 0, 2, BAR)).toBe(-200);
    expect(shiftOffset(1, 0, 2, BAR)).toBe(-100);
    expect(shiftOffset(3, 0, 2, BAR)).toBe(0);
  });
});

describe('reordered keys', () => {
  it('moves a key to the target index', () => {
    expect(reorderedKeys(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(reorderedKeys(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('returns the same list when nothing moved', () => {
    const keys = ['a', 'b'];
    expect(reorderedKeys(keys, 1, 1)).toBe(keys);
    expect(reorderedKeys(keys, 5, 0)).toBe(keys);
  });
});

describe('hold and drag outcome', () => {
  it('counts a travel past the slop in either direction as a move', () => {
    expect(movedPastSlop(TAP_SLOP)).toBe(false);
    expect(movedPastSlop(-TAP_SLOP)).toBe(false);
    expect(movedPastSlop(TAP_SLOP + 1)).toBe(true);
    expect(movedPastSlop(-TAP_SLOP - 1)).toBe(true);
  });

  it('drops when the item landed on a new place', () => {
    expect(holdOutcome(true, true)).toBe('drop');
    expect(holdOutcome(true, false)).toBe('drop');
  });

  it('opens the menu when the hold never moved and nothing was placed', () => {
    expect(holdOutcome(false, false)).toBe('menu');
  });

  it('does nothing when the item was dragged but released where it started', () => {
    expect(holdOutcome(false, true)).toBe('cancel');
  });
});

describe('bar drag target with drop-into', () => {
  it('offers the next slot when the item is held over its middle', () => {
    expect(barTarget(0, 100, WIDTH, WITH_ORB)).toEqual({ to: 0, into: 1 });
    expect(barTarget(0, 115, WIDTH, WITH_ORB)).toEqual({ to: 0, into: 1 });
    expect(barTarget(3, -100, WIDTH, WITH_ORB)).toEqual({ to: 3, into: 2 });
  });

  it('keeps the neighbours in place while the item crosses their middle band', () => {
    expect(barTarget(0, 50, WIDTH, WITH_ORB)).toEqual({ to: 0, into: NO_SLOT });
    expect(barTarget(0, 85, WIDTH, WITH_ORB)).toEqual({ to: 0, into: 1 });
  });

  it('reorders once the item is past the middle band', () => {
    expect(barTarget(0, 130, WIDTH, WITH_ORB)).toEqual({ to: 1, into: NO_SLOT });
    expect(barTarget(3, -130, WIDTH, WITH_ORB)).toEqual({ to: 2, into: NO_SLOT });
  });

  it('passes the earlier slots and offers the one under the item', () => {
    expect(barTarget(0, 200, WIDTH, WITH_ORB)).toEqual({ to: 1, into: NO_SLOT });
    expect(barTarget(0, 300, WIDTH, WITH_ORB)).toEqual({ to: 1, into: 2 });
  });

  it('never offers the orb column, the edges or an unmeasured bar', () => {
    expect(barTarget(1, 100, WIDTH, WITH_ORB).into).toBe(NO_SLOT);
    expect(barTarget(1, 900, WIDTH, WITH_ORB).into).toBe(NO_SLOT);
    expect(barTarget(2, 500, 0, WITH_ORB)).toEqual({ to: 2, into: NO_SLOT });
  });
});
