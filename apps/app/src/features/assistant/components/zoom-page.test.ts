import { describe, expect, it } from 'vitest';
import {
  DOT,
  DOT_ACTIVE,
  DOT_GAP,
  OPEN_SCALE_PLAIN,
  PAGE_GUTTER,
  dotsOffset,
  fittedFrame,
  openingFrom,
} from './zoom-page';

const AREA = { x: 0, y: 56, width: 412, height: 600 };

describe('fittedFrame', () => {
  it('fits a landscape image to the page width inside the gutters, centred', () => {
    const frame = fittedFrame({ width: 1200, height: 800 }, AREA);
    expect(frame.width).toBe(412 - PAGE_GUTTER * 2);
    expect(frame.height).toBeCloseTo(frame.width / 1.5);
    expect(frame.x).toBe(PAGE_GUTTER);
    expect(frame.y + frame.height / 2).toBe(AREA.y + AREA.height / 2);
  });

  it('fits a tall image to the page height', () => {
    const frame = fittedFrame({ width: 500, height: 2000 }, AREA);
    expect(frame.height).toBe(600);
    expect(frame.width).toBe(150);
  });

  it('treats an image without known size as square', () => {
    const frame = fittedFrame({ width: null, height: null }, AREA);
    expect(frame.width).toBe(frame.height);
  });
});

describe('openingFrom', () => {
  const fitted = fittedFrame({ width: 1200, height: 800 }, AREA);

  it('starts on the thumbnail: moved to its centre and scaled to cover it', () => {
    const thumb = { x: 40, y: 300, width: 198, height: 132 };
    const opening = openingFrom(fitted, thumb);
    expect(opening.fade).toBe(false);
    expect(opening.x).toBeCloseTo(139 - 206);
    expect(opening.y).toBeCloseTo(366 - 356);
    expect(opening.scale).toBeCloseTo(198 / fitted.width);
  });

  it('fades in from a slightly smaller image when there is no thumbnail', () => {
    expect(openingFrom(fitted, null)).toEqual({ x: 0, y: 0, scale: OPEN_SCALE_PLAIN, fade: true });
    expect(openingFrom(fitted, { x: 0, y: 0, width: 0, height: 0 }).fade).toBe(true);
  });
});

describe('dotsOffset', () => {
  const total = (count: number): number => count * (DOT + DOT_GAP) - DOT_GAP + DOT_ACTIVE - DOT;

  it('centres a row of dots that fits', () => {
    expect(dotsOffset(12, 2, 412)).toBe((412 - total(12)) / 2);
  });

  it('keeps the current dot in view when every dot does not fit', () => {
    const width = 100;
    expect(dotsOffset(200, 0, width)).toBe(0);
    expect(dotsOffset(200, 199, width)).toBe(width - total(200));
    const middle = dotsOffset(200, 100, width);
    const centre = middle + 100 * (DOT + DOT_GAP) + DOT_ACTIVE / 2;
    expect(centre).toBe(width / 2);
  });
});

describe('image viewer module', () => {
  it('loads with its pages, chrome and actions', async () => {
    const viewer = await import('./image-viewer');
    expect(viewer.ImageViewer).toBeTypeOf('function');
  });
});
