import { describe, expect, it } from 'vitest';
import { HOME_MAP_PINNED_SIZE } from '@smarteverything/domain';
import { pinnedStageHeight, pinnedStageStyle, shareAfterDrag, shareAfterStep } from './map-split';

describe('devices map split', () => {
  it('follows the drag as a share of the measured height inside 30 to 70 percent', () => {
    expect(shareAfterDrag(0.5, 100, 1000)).toBeCloseTo(0.6);
    expect(shareAfterDrag(0.5, -400, 1000)).toBe(HOME_MAP_PINNED_SIZE.min);
    expect(shareAfterDrag(0.5, 400, 1000)).toBe(HOME_MAP_PINNED_SIZE.max);
    expect(shareAfterDrag(0.5, 100, 0)).toBe(0.5);
  });

  it('steps for screen readers inside the limits', () => {
    expect(shareAfterStep(0.5, 'increment')).toBeCloseTo(0.55);
    expect(shareAfterStep(0.5, 'decrement')).toBeCloseTo(0.45);
    expect(shareAfterStep(HOME_MAP_PINNED_SIZE.max, 'increment')).toBe(HOME_MAP_PINNED_SIZE.max);
    expect(shareAfterStep(HOME_MAP_PINNED_SIZE.min, 'decrement')).toBe(HOME_MAP_PINNED_SIZE.min);
  });

  it('gives the stage its share of the measured height at phone, tablet and desktop sizes', () => {
    expect(pinnedStageHeight(812, 0.5, false)).toBe(406);
    expect(pinnedStageHeight(1104, 0.3, false)).toBeCloseTo(331.2);
    expect(pinnedStageHeight(1034, 0.7, false)).toBeCloseTo(723.8);
  });

  it('follows a live resize of the page and folds to nothing', () => {
    expect(pinnedStageHeight(1034, 0.5, false)).toBe(517);
    expect(pinnedStageHeight(600, 0.5, false)).toBe(300);
    expect(pinnedStageHeight(600, 0.5, true)).toBe(0);
  });

  it('reserves the stage height as a plain style, so it holds while the map is still loading', () => {
    expect(pinnedStageStyle(936, 0.5, false)).toEqual({ height: 468 });
    expect(pinnedStageStyle(936, 0.5, true)).toEqual({ height: 0 });
  });
});
