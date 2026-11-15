import {
  compileRecipe,
  IDENTITY_RECIPE,
  type CompiledRecipe,
  type PhotoRecipe,
} from '@smarteverything/domain';
import { multiply, shownGeometry, type Mat3, type Size } from './geometry';
import { colourOnly, withoutCrop } from './recipe-ops';
import type { EditorTool } from './tools';

export interface CanvasView {
  readonly transform: Mat3;
  readonly matrix: CompiledRecipe['matrix'];
  readonly curves: readonly number[];
  readonly patched: boolean;
}

export interface ShownView {
  readonly view: CanvasView;
  readonly size: Size;
}

export type ShownStage = 'result' | 'crop' | 'source' | 'original';

function colourOf(recipe: PhotoRecipe): Pick<CanvasView, 'matrix' | 'curves'> {
  const compiled = compileRecipe(recipe);
  const { red, green, blue } = compiled.curves;
  const curves: number[] = [];
  for (let index = 0; index < red.length; index += 1) {
    curves.push(red[index] ?? index, green[index] ?? index, blue[index] ?? index);
  }
  return { matrix: compiled.matrix, curves };
}

function geometryRecipe(recipe: PhotoRecipe, stage: ShownStage): PhotoRecipe {
  if (stage === 'result') return recipe;
  if (stage === 'crop') return withoutCrop(recipe);
  return IDENTITY_RECIPE;
}

function colourRecipe(recipe: PhotoRecipe, stage: ShownStage): PhotoRecipe {
  return stage === 'original' ? IDENTITY_RECIPE : colourOnly(recipe);
}

export function shownView(recipe: PhotoRecipe, source: Size, stage: ShownStage): ShownView {
  const geometry = shownGeometry(geometryRecipe(recipe, stage), source);
  return {
    view: {
      transform: geometry.toSourceUv,
      ...colourOf(colourRecipe(recipe, stage)),
      patched: stage !== 'original',
    },
    size: geometry.size,
  };
}

export function stageOf(tool: EditorTool, compare: boolean): ShownStage {
  if (compare) return 'original';
  if (tool === 'crop') return 'crop';
  return tool === 'eraser' ? 'source' : 'result';
}

export function coverTile(shown: ShownView, tileRatio: number): CanvasView {
  const ratio = shown.size.width / Math.max(Number.EPSILON, shown.size.height);
  const sx = ratio > tileRatio ? tileRatio / ratio : 1;
  const sy = ratio > tileRatio ? 1 : ratio / tileRatio;
  return {
    ...shown.view,
    transform: multiply(shown.view.transform, [sx, 0, (1 - sx) / 2, 0, sy, (1 - sy) / 2, 0, 0, 1]),
  };
}
