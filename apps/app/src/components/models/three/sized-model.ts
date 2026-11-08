import type { HomeMapSizeAxis, ModelSpec } from '@smarteverything/domain';
import { modelOuterSize } from '@smarteverything/domain/model-placement';
import { Vector3 } from 'three';

export interface SizedModel {
  readonly spec: ModelSpec;
  readonly size: Readonly<Record<HomeMapSizeAxis, number>>;
  readonly stretch: Vector3;
}

export function sizedModel(spec: ModelSpec, params: Readonly<Record<string, number>>): SizedModel {
  const size = modelOuterSize(spec, params);
  const { width, height, depth } = spec.footprint;
  return {
    spec,
    size,
    stretch: new Vector3(size.width / width, size.height / height, size.depth / depth),
  };
}
