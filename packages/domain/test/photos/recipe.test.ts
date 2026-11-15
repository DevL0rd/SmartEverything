import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  IDENTITY_RECIPE,
  PHOTO_FILTERS,
  PHOTO_RECIPE,
  compileRecipe,
  isIdentityRecipe,
  type PhotoRecipe,
} from '../../src';
import { FILTER_MATRICES } from '../../src/photos/recipe-filters';
import {
  IDENTITY_MATRIX,
  LUMA,
  blendMatrix,
  gainMatrix,
  lumaMatrix,
  matrixAfter,
  saturationMatrix,
  scaleMatrix,
} from '../../src/photos/recipe-matrix';
import { toneCurve, toneOf } from '../../src/photos/recipe-curve';

const PATCH = '44444444-4444-4444-8444-444444444444';

function recipe(change: Partial<PhotoRecipe>): PhotoRecipe {
  return { ...IDENTITY_RECIPE, ...change };
}

function light(change: Partial<PhotoRecipe['light']>): PhotoRecipe {
  return recipe({ light: { ...IDENTITY_RECIPE.light, ...change } });
}

function colour(change: Partial<PhotoRecipe['colour']>): PhotoRecipe {
  return recipe({ colour: { ...IDENTITY_RECIPE.colour, ...change } });
}

describe('the identity recipe', () => {
  it('is valid and compiles to nothing', () => {
    expect(PHOTO_RECIPE.safeParse(IDENTITY_RECIPE).success).toBe(true);
    const compiled = compileRecipe(IDENTITY_RECIPE);
    expect(compiled.steps).toStrictEqual([]);
    expect(compiled.matrix).toStrictEqual(IDENTITY_MATRIX);
    expect(compiled.curves.red).toHaveLength(256);
    expect(compiled.curves.red.every((value, index) => value === index)).toBe(true);
    expect(compiled.curves.green).toStrictEqual(compiled.curves.red);
    expect(compiled.curves.blue).toStrictEqual(compiled.curves.red);
    expect(isIdentityRecipe(IDENTITY_RECIPE)).toBe(true);
  });

  it('is not identity once anything changes', () => {
    expect(isIdentityRecipe(recipe({ quarterTurns: 1 }))).toBe(false);
    expect(isIdentityRecipe(light({ contrast: 1 }))).toBe(false);
    expect(isIdentityRecipe(colour({ saturation: 1 }))).toBe(false);
    expect(isIdentityRecipe(recipe({ filter: { preset: 'warm', strength: 100 } }))).toBe(false);
  });

  it('refuses unknown fields, out of range sliders and a crop outside the picture', () => {
    expect(PHOTO_RECIPE.safeParse({ ...IDENTITY_RECIPE, extra: 1 }).success).toBe(false);
    expect(PHOTO_RECIPE.safeParse(light({ exposure: 101 })).success).toBe(false);
    expect(PHOTO_RECIPE.safeParse(recipe({ quarterTurns: 4 })).success).toBe(false);
    expect(PHOTO_RECIPE.safeParse(recipe({ straighten: 46 })).success).toBe(false);
    expect(PHOTO_RECIPE.safeParse(recipe({ crop: { x: 0.6, y: 0, w: 0.6, h: 1 } })).success).toBe(
      false,
    );
    expect(
      PHOTO_RECIPE.safeParse(recipe({ crop: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 } })).success,
    ).toBe(true);
    expect(
      PHOTO_RECIPE.safeParse(recipe({ filter: { preset: 'vivid', strength: 101 } })).success,
    ).toBe(false);
  });
});

describe('geometry steps', () => {
  it('come in the order patches, flip, rotate, straighten, crop', () => {
    const box = { x: 0.1, y: 0.1, w: 0.5, h: 0.5 };
    const compiled = compileRecipe(
      recipe({
        crop: box,
        quarterTurns: 3,
        straighten: -4.5,
        flipHorizontal: true,
        flipVertical: false,
        patches: [{ patchId: PATCH, box }],
      }),
    );
    expect(compiled.steps).toStrictEqual([
      { kind: 'patch', patchId: PATCH, box },
      { kind: 'flip', horizontal: true, vertical: false },
      { kind: 'rotate', quarterTurns: 3 },
      { kind: 'straighten', degrees: -4.5 },
      { kind: 'crop', box },
    ]);
  });

  it('leave out every step that changes nothing', () => {
    expect(compileRecipe(recipe({ flipVertical: true })).steps).toStrictEqual([
      { kind: 'flip', horizontal: false, vertical: true },
    ]);
    expect(compileRecipe(recipe({ straighten: 1 })).steps).toStrictEqual([
      { kind: 'straighten', degrees: 1 },
    ]);
  });
});

describe('the tone curve', () => {
  it('doubles the brightness at plus fifty exposure and clamps', () => {
    const curve = compileRecipe(light({ exposure: 50 })).curves.red;
    expect(curve[64]).toBe(128);
    expect(curve[200]).toBe(255);
    expect(compileRecipe(light({ exposure: -50 })).curves.red[128]).toBe(64);
  });

  it('stretches around the middle with contrast', () => {
    const curve = compileRecipe(light({ contrast: 100 })).curves.red;
    expect(curve[0]).toBe(0);
    expect(curve[32]).toBe(0);
    expect(curve[224]).toBe(255);
    expect(
      compileRecipe(light({ contrast: -100 })).curves.red.every((value) => value === 128),
    ).toBe(true);
  });

  it('lifts shadows and blacks at the dark end and pulls highlights and whites down', () => {
    expect(compileRecipe(light({ shadows: 100 })).curves.red[0]).toBe(38);
    expect(compileRecipe(light({ blacks: 100 })).curves.red[0]).toBe(15);
    expect(compileRecipe(light({ highlights: -100 })).curves.red[255]).toBe(217);
    expect(compileRecipe(light({ whites: -100 })).curves.red[255]).toBe(240);
    expect(compileRecipe(light({ shadows: 100 })).curves.red[255]).toBe(255);
    expect(compileRecipe(light({ highlights: 100 })).curves.red[0]).toBe(0);
  });

  it('never decreases for any slider setting', () => {
    const slider = fc.integer({ min: -100, max: 100 });
    fc.assert(
      fc.property(
        fc.record({
          exposure: slider,
          contrast: slider,
          highlights: slider,
          shadows: slider,
          whites: slider,
          blacks: slider,
        }),
        (settings) => {
          const curve = toneCurve(settings);
          expect(curve).toHaveLength(256);
          for (let index = 1; index < curve.length; index += 1) {
            expect(curve[index]).toBeGreaterThanOrEqual(curve[index - 1] ?? 0);
          }
          expect(Math.min(...curve)).toBeGreaterThanOrEqual(0);
          expect(Math.max(...curve)).toBeLessThanOrEqual(255);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('reads one value of the curve', () => {
    expect(toneOf(IDENTITY_RECIPE.light, 0.3)).toBeCloseTo(0.3, 12);
  });
});

describe('the colour matrix', () => {
  it('turns the picture grey at minus one hundred saturation', () => {
    const matrix = compileRecipe(colour({ saturation: -100 })).matrix;
    expect(matrix).toStrictEqual(lumaMatrix(1, 0));
    expect(matrix.slice(0, 3)).toStrictEqual([...LUMA]);
  });

  it('doubles the colour at plus one hundred saturation and keeps grey grey', () => {
    const matrix = compileRecipe(colour({ saturation: 100 })).matrix;
    expect(matrix[0]).toBeCloseTo(LUMA[0] * -1 + 2, 12);
    expect(matrix[1]).toBeCloseTo(-LUMA[1], 12);
    for (const row of [0, 4, 8]) {
      expect((matrix[row] ?? 0) + (matrix[row + 1] ?? 0) + (matrix[row + 2] ?? 0)).toBeCloseTo(
        1,
        12,
      );
    }
  });

  it('warms by lifting red and lowering blue, and tints by moving green', () => {
    const warm = compileRecipe(colour({ warmth: 100 })).matrix;
    expect([warm[0], warm[5], warm[10]]).toStrictEqual([1.2, 1, 0.8]);
    const magenta = compileRecipe(colour({ tint: 100 })).matrix;
    expect([magenta[0], magenta[5], magenta[10]]).toStrictEqual([1, 0.8, 1]);
    const green = compileRecipe(colour({ tint: -100 })).matrix;
    expect(green[5]).toBeCloseTo(1.2, 12);
  });

  it('applies a filter at its strength between the identity and its matrix', () => {
    const half = compileRecipe(recipe({ filter: { preset: 'sepia', strength: 50 } })).matrix;
    expect(half).toStrictEqual(blendMatrix(FILTER_MATRICES.sepia, 50));
    expect(half[0]).toBeCloseTo((1 + 0.393) / 2, 12);
    const full = compileRecipe(recipe({ filter: { preset: 'sepia', strength: 100 } })).matrix;
    expect(full).toStrictEqual(FILTER_MATRICES.sepia);
    const none = compileRecipe(recipe({ filter: { preset: 'sepia', strength: 0 } })).matrix;
    expect(none).toStrictEqual(IDENTITY_MATRIX);
  });

  it('runs saturation first, then warmth and tint, then the filter', () => {
    const settings = recipe({
      colour: { saturation: 50, warmth: 20, tint: -10 },
      filter: { preset: 'cool', strength: 100 },
    });
    const saturated = saturationMatrix(1.5);
    const balanced = matrixAfter(saturated, scaleMatrix(1.04, 1.02, 0.96));
    const expected = matrixAfter(balanced, FILTER_MATRICES.cool);
    compileRecipe(settings).matrix.forEach((value, index) => {
      expect(value).toBeCloseTo(expected[index] ?? NaN, 12);
    });
  });

  it('has a distinct matrix for every named filter', () => {
    const seen = new Set(PHOTO_FILTERS.map((name) => FILTER_MATRICES[name].join()));
    expect(seen.size).toBe(PHOTO_FILTERS.length);
    for (const name of PHOTO_FILTERS) {
      expect(FILTER_MATRICES[name].every(Number.isFinite), name).toBe(true);
    }
  });

  it('composes a matrix after another one including the offsets', () => {
    const composed = matrixAfter(gainMatrix(2, 0.1), gainMatrix(0.5, 0.2));
    expect(composed).toStrictEqual(gainMatrix(1, 0.25));
    expect(matrixAfter(IDENTITY_MATRIX, IDENTITY_MATRIX)).toStrictEqual(IDENTITY_MATRIX);
  });

  it('gives mono and noir equal rows and a darker noir', () => {
    const mono = FILTER_MATRICES.mono;
    expect(mono.slice(0, 4)).toStrictEqual(mono.slice(4, 8));
    expect(FILTER_MATRICES.noir[3]).toBe(-0.12);
  });
});
