import type { ModelSpec } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import {
  buildModel,
  createModelResources,
  type BuiltModel,
} from '../../apps/app/src/components/models/three/build-model.ts';
import { pinGeometriesInUse } from '../../apps/app/src/components/models/three/shared-geometry.ts';

const VIEW = { yaw: 30, pitch: 18, fov: 28, padding: 0.1 } as const;

function boxSpec(): ModelSpec {
  return {
    schema: 1,
    id: 'dev.guard.box',
    version: '1.0.0',
    title: 'Box',
    category: 'light',
    footprint: { width: 0.2, depth: 0.2, height: 0.2 },
    framing: { tile: VIEW, card: VIEW, hero: VIEW },
    materials: { body: { finish: 'matte-white' } },
    parts: [
      {
        id: 'body',
        geometry: { type: 'roundedBox', width: 0.2, height: 0.2, depth: 0.2, radius: 0.02 },
        material: 'body',
      },
    ],
  };
}

function bodyOf(model: BuiltModel): BuiltModel['parts'][number]['mesh']['geometry'] {
  const part = model.parts[0];
  if (part === undefined) throw new Error('the guard model has no part');
  return part.mesh.geometry;
}

function build(): { readonly model: BuiltModel; readonly dispose: () => void } {
  const resources = createModelResources();
  const model = buildModel(boxSpec(), { lod: 2, resources });
  return {
    model,
    dispose: (): void => {
      model.dispose();
      resources.dispose();
    },
  };
}

describe('model geometry is shared across separate resources', () => {
  it('builds one BufferGeometry for the same spec and keeps it while another user holds it', () => {
    const first = build();
    const second = build();
    const geometry = bodyOf(first.model);
    expect(bodyOf(second.model)).toBe(geometry);
    const disposed = vi.fn();
    geometry.addEventListener('dispose', disposed);
    first.dispose();
    expect(disposed).not.toHaveBeenCalled();
    second.dispose();
    expect(disposed).toHaveBeenCalledTimes(1);
  });

  it('frees the geometry with its last user unless it is pinned for a return', () => {
    const before = build();
    const geometry = bodyOf(before.model);
    before.dispose();
    const fresh = build();
    expect(bodyOf(fresh.model)).not.toBe(geometry);
    const release = pinGeometriesInUse();
    fresh.dispose();
    const back = build();
    expect(bodyOf(back.model)).toBe(bodyOf(fresh.model));
    release();
    back.dispose();
    const after = build();
    expect(bodyOf(after.model)).not.toBe(bodyOf(back.model));
    after.dispose();
  });
});
