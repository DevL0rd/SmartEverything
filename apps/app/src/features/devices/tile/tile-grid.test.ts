import { describe, expect, it, vi } from 'vitest';
import { SEMANTIC_SIZES } from '../../../design/tokens';
import { FIXED_PX } from '../../device-visuals';
import { TILE_LANE_GAP, deviceTileGrid, deviceTileMinWidth } from './tile-grid';

vi.mock('../../device-visuals', async () => ({
  FIXED_PX: (await import('../../device-visuals/visual-size')).FIXED_PX,
}));

const TOUCH = SEMANTIC_SIZES.touch.comfortable;
const POINTER = SEMANTIC_SIZES.pointer.comfortable;

describe('deviceTileGrid', () => {
  it('sizes a tile from its padding, its art, the lane gap and two band buttons', () => {
    expect(deviceTileMinWidth(TOUCH)).toBe(
      2 * TOUCH.cardPad + FIXED_PX.tile + TILE_LANE_GAP + 2 * TOUCH.controlH + 8,
    );
    expect(deviceTileMinWidth(POINTER)).toBeLessThan(deviceTileMinWidth(TOUCH));
  });

  it('fits as many tiles as the width allows, with no column cap', () => {
    const min = deviceTileMinWidth(POINTER);
    const width = 10 * min + 9 * POINTER.gridGap;
    expect(deviceTileGrid({ width, idiom: 'pointer', sizes: POINTER, count: 40 }).columns).toBe(10);
    expect(
      deviceTileGrid({ width: width - 1, idiom: 'pointer', sizes: POINTER, count: 40 }).columns,
    ).toBe(9);
  });

  it('lets fewer devices share the width instead of leaving empty columns', () => {
    expect(deviceTileGrid({ width: 1400, idiom: 'touch', sizes: TOUCH, count: 2 }).columns).toBe(2);
  });

  it('keeps one column on a narrow widget', () => {
    expect(deviceTileGrid({ width: 120, idiom: 'touch', sizes: TOUCH, count: 5 }).columns).toBe(1);
  });
});
