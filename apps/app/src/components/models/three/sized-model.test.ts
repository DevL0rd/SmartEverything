import {
  MODEL_SPEC_SIZE_AXES,
  MODEL_SPEC_SIZE_TOLERANCE,
  homeMapObjectBox,
  modelOuterSize,
  type ModelSpec,
  type ModelSpecSizeAxis,
} from '@smarteverything/domain';
import { Box3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { MODEL_REGISTRY } from '../../../../../../packages/models/src/registry';
import { editFactsOf } from '../../house-map/edit/furniture-box';
import { buildModel } from './build-model';
import { sizedModel } from './sized-model';

type Params = Readonly<Record<string, number>>;
type Size = Readonly<Record<ModelSpecSizeAxis, number>>;

function built(spec: ModelSpec, params: Params): Size {
  const model = buildModel(spec, { lod: 2, params });
  model.group.updateMatrixWorld(true);
  const size = new Box3().setFromObject(model.group).getSize(new Vector3());
  model.dispose();
  return { width: size.x, depth: size.z, height: size.y };
}

function metreParams(
  spec: ModelSpec,
): readonly (readonly [string, { min: number; max: number }])[] {
  return Object.entries(spec.params ?? {}).filter(([, param]) => param.unit === 'm');
}

function cases(spec: ModelSpec): readonly (readonly [string, Params])[] {
  const metres = metreParams(spec);
  const all = (key: 'min' | 'max'): Params =>
    Object.fromEntries(metres.map(([name, param]) => [name, param[key]]));
  return [
    ['default', {}],
    ['all smallest', all('min')],
    ['all largest', all('max')],
    ...metres.flatMap(([name, param]): (readonly [string, Params])[] => [
      [`${name} smallest`, { [name]: param.min }],
      [`${name} largest`, { [name]: param.max }],
    ]),
  ];
}

function editorBox(spec: ModelSpec, params: Params): { readonly w: number; readonly d: number } {
  return homeMapObjectBox(
    {
      id: 'piece',
      modelId: spec.id,
      at: { x: 0, y: 0 },
      rotation: 0,
      params,
      footprint: { w: spec.footprint.width, d: spec.footprint.depth },
      locked: false,
    },
    editFactsOf(spec),
  );
}

const RESIZABLE = MODEL_REGISTRY.filter((spec) => metreParams(spec).length > 0);

describe('every resizable catalogue model builds to the size it declares', () => {
  it('covers the resizable models', () => {
    expect(RESIZABLE.filter((spec) => spec.size !== undefined).length).toBeGreaterThan(100);
  });

  it.each(RESIZABLE.map((spec) => [spec.id, spec] as const))('%s', (_id, spec) => {
    const rest = built(spec, {});
    for (const [label, params] of cases(spec)) {
      const model = built(spec, params);
      const declared = modelOuterSize(spec, params);
      const box = editorBox(spec, params);
      const sized = sizedModel(spec, params).size;
      for (const axis of MODEL_SPEC_SIZE_AXES) {
        const sizedAxis = spec.size?.[axis] !== undefined;
        const want = sizedAxis ? declared[axis] : rest[axis];
        expect(
          Math.abs(model[axis] - want),
          `${label}: built ${axis} ${String(model[axis])}, declared ${String(want)}`,
        ).toBeLessThanOrEqual(MODEL_SPEC_SIZE_TOLERANCE);
        expect(sized[axis]).toBeCloseTo(declared[axis], 9);
      }
      if (spec.size?.width !== undefined) {
        expect(Math.abs(box.w - declared.width)).toBeLessThanOrEqual(MODEL_SPEC_SIZE_TOLERANCE);
      }
      if (spec.size?.depth !== undefined) {
        expect(Math.abs(box.d - declared.depth)).toBeLessThanOrEqual(MODEL_SPEC_SIZE_TOLERANCE);
      }
    }
  });
});
