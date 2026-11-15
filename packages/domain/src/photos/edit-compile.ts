import type { PhotoRecipe } from './edit-recipe';
import { FILTER_MATRICES } from './recipe-filters';
import { toneCurve } from './recipe-curve';
import {
  type ColourMatrix,
  IDENTITY_MATRIX,
  blendMatrix,
  matrixAfter,
  saturationMatrix,
  scaleMatrix,
} from './recipe-matrix';
import type { PhotoBox } from './people';

export type GeometryStep =
  | { readonly kind: 'patch'; readonly patchId: string; readonly box: PhotoBox }
  | { readonly kind: 'flip'; readonly horizontal: boolean; readonly vertical: boolean }
  | { readonly kind: 'rotate'; readonly quarterTurns: number }
  | { readonly kind: 'straighten'; readonly degrees: number }
  | { readonly kind: 'crop'; readonly box: PhotoBox };

export interface CompiledRecipe {
  readonly steps: readonly GeometryStep[];
  readonly matrix: ColourMatrix;
  readonly curves: {
    readonly red: readonly number[];
    readonly green: readonly number[];
    readonly blue: readonly number[];
  };
}

const WARMTH_RANGE = 0.2;
const TINT_RANGE = 0.2;
const SATURATION_RANGE = 1;

function geometryOf(recipe: PhotoRecipe): readonly GeometryStep[] {
  const steps: GeometryStep[] = recipe.patches.map((patch) => ({
    kind: 'patch',
    patchId: patch.patchId,
    box: patch.box,
  }));
  if (recipe.flipHorizontal || recipe.flipVertical) {
    steps.push({
      kind: 'flip',
      horizontal: recipe.flipHorizontal,
      vertical: recipe.flipVertical,
    });
  }
  if (recipe.quarterTurns !== 0) {
    steps.push({ kind: 'rotate', quarterTurns: recipe.quarterTurns });
  }
  if (recipe.straighten !== 0) {
    steps.push({ kind: 'straighten', degrees: recipe.straighten });
  }
  if (recipe.crop !== null) {
    steps.push({ kind: 'crop', box: recipe.crop });
  }
  return steps;
}

function matrixOf(recipe: PhotoRecipe): ColourMatrix {
  const { saturation, warmth, tint } = recipe.colour;
  const saturated = saturationMatrix(1 + (saturation / 100) * SATURATION_RANGE);
  const balanced = matrixAfter(
    saturated,
    scaleMatrix(
      1 + (warmth / 100) * WARMTH_RANGE,
      1 - (tint / 100) * TINT_RANGE,
      1 - (warmth / 100) * WARMTH_RANGE,
    ),
  );
  if (recipe.filter === null) {
    return balanced;
  }
  return matrixAfter(
    balanced,
    blendMatrix(FILTER_MATRICES[recipe.filter.preset], recipe.filter.strength),
  );
}

export function compileRecipe(recipe: PhotoRecipe): CompiledRecipe {
  const curve = toneCurve(recipe.light);
  return {
    steps: geometryOf(recipe),
    matrix: matrixOf(recipe),
    curves: { red: curve, green: curve, blue: curve },
  };
}

export function isIdentityRecipe(recipe: PhotoRecipe): boolean {
  const compiled = compileRecipe(recipe);
  return (
    compiled.steps.length === 0 &&
    compiled.matrix.every((value, index) => value === IDENTITY_MATRIX[index]) &&
    compiled.curves.red.every((value, index) => value === index)
  );
}
