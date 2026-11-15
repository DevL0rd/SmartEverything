import { describe, expect, it } from 'vitest';
import { IDENTITY_RECIPE, type PhotoRecipe } from '@smarteverything/domain';
import { apply, fitRect, inscribed, shownGeometry } from './geometry';

const SOURCE = { width: 400, height: 200 };

function recipe(change: Partial<PhotoRecipe>): PhotoRecipe {
  return { ...IDENTITY_RECIPE, ...change };
}

function corners(change: Partial<PhotoRecipe>): readonly { x: number; y: number }[] {
  const { toSourceUv } = shownGeometry(recipe(change), SOURCE);
  return [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ].map(([u = 0, v = 0]) => {
    const point = apply(toSourceUv, u, v);
    return { x: Math.round(point.x * 1000) / 1000, y: Math.round(point.y * 1000) / 1000 };
  });
}

describe('shown geometry', () => {
  it('maps the identity recipe onto the whole photo', () => {
    expect(corners({})).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
    expect(shownGeometry(IDENTITY_RECIPE, SOURCE).size).toEqual(SOURCE);
  });

  it('mirrors left and right for a horizontal flip', () => {
    expect(corners({ flipHorizontal: true })[0]).toEqual({ x: 1, y: 0 });
    expect(corners({ flipVertical: true })[0]).toEqual({ x: 0, y: 1 });
  });

  it('turns a quarter clockwise so the bottom left of the photo is shown top left', () => {
    expect(corners({ quarterTurns: 1 })).toEqual([
      { x: 0, y: 1 },
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 0 },
    ]);
    expect(shownGeometry(recipe({ quarterTurns: 1 }), SOURCE).size).toEqual({
      width: 200,
      height: 400,
    });
    expect(corners({ quarterTurns: 2 })[0]).toEqual({ x: 1, y: 1 });
  });

  it('flips before turning, as the hub renders it', () => {
    expect(corners({ flipHorizontal: true, quarterTurns: 1 })[0]).toEqual({ x: 1, y: 1 });
  });

  it('crops a box of the shown picture', () => {
    const shown = shownGeometry(recipe({ crop: { x: 0.5, y: 0, w: 0.5, h: 0.5 } }), SOURCE);
    expect(shown.size).toEqual({ width: 200, height: 100 });
    expect(apply(shown.toSourceUv, 0, 0)).toEqual({ x: 0.5, y: 0 });
    expect(apply(shown.toSourceUv, 1, 1)).toEqual({ x: 1, y: 0.5 });
  });

  it('straightens inside the photo with the inscribed size the hub uses', () => {
    const shown = shownGeometry(recipe({ straighten: 10 }), SOURCE);
    expect(shown.size.width / shown.size.height).toBeCloseTo(2, 6);
    expect(shown.size.width).toBeLessThan(400);
    for (const point of corners({ straighten: 10 })) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(1);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(1);
    }
    const centre = apply(shown.toSourceUv, 0.5, 0.5);
    expect(centre.x).toBeCloseTo(0.5, 6);
    expect(centre.y).toBeCloseTo(0.5, 6);
    expect(inscribed(SOURCE, 0)).toEqual(SOURCE);
  });

  it('turns a straightened top left corner clockwise into the photo', () => {
    const [topLeft] = corners({ straighten: 10 });
    expect(topLeft?.y).toBeGreaterThan(0);
  });
});

describe('fit rect', () => {
  it('centres the picture inside the frame', () => {
    expect(fitRect({ width: 400, height: 400 }, { width: 200, height: 100 })).toEqual({
      left: 0,
      top: 100,
      width: 400,
      height: 200,
    });
    expect(fitRect({ width: 0, height: 400 }, { width: 2, height: 1 }).width).toBe(0);
  });
});
