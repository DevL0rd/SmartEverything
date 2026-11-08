import {
  modelParamValues,
  resolveModelBinding,
  shownParts,
  type ModelSpec,
  type ModelSpecBindable,
  type ModelSpecGeometry,
} from '@smarteverything/domain';
import { paramPresets } from '../../src/index';

function sizesOf(geometry: ModelSpecGeometry): readonly ModelSpecBindable[] {
  if (geometry.type === 'roundedBox') return [geometry.width, geometry.height, geometry.depth];
  if (geometry.type === 'cylinder') return [geometry.height];
  if (geometry.type === 'slats') return [geometry.width, geometry.height, geometry.depth];
  return [];
}

export function collapsedParts(spec: ModelSpec): readonly string[] {
  return paramPresets(spec).flatMap(([preset, params]) => {
    const values = modelParamValues(spec, params);
    return shownParts(spec, 2, values)
      .filter((part) =>
        sizesOf(part.geometry).some((size) => resolveModelBinding(size, values) <= 0),
      )
      .map((part) => `${spec.id}:${part.id}@${preset}`);
  });
}
