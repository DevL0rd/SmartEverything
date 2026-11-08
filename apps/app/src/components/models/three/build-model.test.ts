import { MODEL_SPEC, type ModelSpec } from '@smarteverything/domain';
import { DoubleSide } from 'three';
import { describe, expect, it } from 'vitest';
import { BAKE_VERSION } from './bake-version';
import {
  buildModel,
  createModelResources,
  lodParts,
  modelParams,
  toModelBuffers,
  type BuiltModel,
  type BuiltPart,
} from './build-model';
import { MODEL_LOD_LEVELS } from './geometry';
import { FINISH_TOKENS } from './materials';

const VIEW = { yaw: 30, pitch: 18, fov: 28, padding: 0.1 } as const;

function lampSpec(): ModelSpec {
  return {
    schema: 1,
    id: 'dev.test.lamp',
    version: '1.0.0',
    title: 'Lamp',
    category: 'light',
    footprint: { width: 0.2, depth: 0.2, height: 0.5 },
    framing: { tile: VIEW, card: VIEW, hero: VIEW },
    params: { reach: { min: 0.1, max: 0.5, default: 0.3, unit: 'm' } },
    materials: {
      body: { finish: 'brushed-aluminium' },
      shade: { finish: 'frosted-glass' },
      trim: { finish: 'satin-black' },
    },
    finishes: { white: { body: { finish: 'matte-white' } }, black: {} },
    defaultFinish: 'white',
    parts: [
      {
        id: 'base',
        geometry: { type: 'cylinder', height: 0.03, topRadius: 0.08, bottomRadius: 0.09 },
        material: 'body',
        contact: true,
      },
      {
        id: 'arm',
        parent: 'base',
        geometry: {
          type: 'tube',
          points: [
            [0, 0, 0],
            [0, 0.2, 0],
            [0.1, 0.3, 0],
          ],
          radius: 0.006,
        },
        material: 'body',
        transform: { position: [0, { param: 'reach', scale: 0.5 }, 0], rotation: [0, 90, 0] },
      },
      {
        id: 'shade',
        parent: 'arm',
        geometry: { type: 'ring', innerRadius: 0.03, outerRadius: 0.06 },
        material: 'shade',
        minLod: 1,
        layer: 'glow',
      },
      {
        id: 'screw',
        parent: 'shade',
        geometry: { type: 'sphere', radius: 0.004 },
        material: 'trim',
        minLod: 2,
      },
    ],
  };
}

function meshNamed(model: BuiltModel, id: string): BuiltPart['mesh'] {
  const part = model.parts.find((item) => item.id === id);
  if (part === undefined) throw new Error(`no part ${id}`);
  return part.mesh;
}

describe('buildModel', () => {
  it('the fixture is a valid spec', () => {
    expect(MODEL_SPEC.safeParse(lampSpec()).success).toBe(true);
  });

  it('adds parts by minLod and drops children of hidden parts', () => {
    expect(MODEL_LOD_LEVELS.map((lod) => lodParts(lampSpec(), lod).map((p) => p.id))).toEqual([
      ['base', 'arm'],
      ['base', 'arm', 'shade'],
      ['base', 'arm', 'shade', 'screw'],
    ]);
    const orphan = {
      ...lampSpec(),
      parts: lampSpec().parts.map((p) => ({
        ...p,
        minLod: p.id === 'shade' ? (2 as const) : (0 as const),
      })),
    };
    expect(lodParts(orphan, 1).map((p) => p.id)).toEqual(['base', 'arm']);
  });

  it('builds the part tree with transforms in metres and degrees bound to params', () => {
    const model = buildModel(lampSpec(), { lod: 2, params: { reach: 0.4 } });
    expect(model.group.name).toBe('dev.test.lamp');
    const arm = meshNamed(model, 'arm');
    expect(arm.parent?.name).toBe('base');
    expect(arm.position.y).toBeCloseTo(0.2);
    expect(arm.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(meshNamed(model, 'screw').parent?.name).toBe('shade');
    model.dispose();
  });

  it('clamps params to their declared range and fills defaults', () => {
    expect(modelParams(lampSpec())).toEqual({ reach: 0.3 });
    expect(modelParams(lampSpec(), { reach: 9, other: 1 })).toEqual({ reach: 0.5 });
  });

  it('uses the default finish unless one is given', () => {
    const white = buildModel(lampSpec(), { lod: 1 });
    const black = buildModel(lampSpec(), { lod: 1, finish: 'black' });
    expect(white.parts[0]?.material.color).toBe(FINISH_TOKENS['matte-white'].color);
    expect(black.parts[0]?.material.color).toBe(FINISH_TOKENS['brushed-aluminium'].color);
    expect(() => buildModel(lampSpec(), { lod: 1, finish: 'gold' })).toThrow('no finish gold');
    white.dispose();
    black.dispose();
  });

  it('gives patterns from card LOD only, as bump and roughness maps for relief', () => {
    const tile = buildModel(lampSpec(), { lod: 0, finish: 'black' });
    const hero = buildModel(lampSpec(), { lod: 2, finish: 'black' });
    expect(tile.parts[0]?.mesh.material.bumpMap).toBeNull();
    const material = hero.parts[0]?.mesh.material;
    expect(material?.bumpMap?.name).toBe('pattern:brushed:256');
    expect(material?.roughnessMap).toBe(material?.bumpMap);
    expect(material?.map).toBeNull();
    tile.dispose();
    hero.dispose();
  });

  it('flat panels are double sided, transparent finishes are see-through', () => {
    const model = buildModel(lampSpec(), { lod: 1 });
    const shade = model.parts.find((part) => part.id === 'shade');
    expect(shade?.mesh.material.side).toBe(DoubleSide);
    expect(shade?.mesh.material.transparent).toBe(true);
    expect(shade?.layer).toBe('glow');
    expect(model.parts[0]?.contact).toBe(true);
    model.dispose();
  });

  it('shares geometry, materials and textures between identical models', () => {
    const resources = createModelResources();
    const first = buildModel(lampSpec(), { lod: 2, finish: 'black', resources });
    const second = buildModel(lampSpec(), { lod: 2, finish: 'black', resources });
    expect(second.parts[0]?.mesh.geometry).toBe(first.parts[0]?.mesh.geometry);
    expect(second.parts[0]?.mesh.material).toBe(first.parts[1]?.mesh.material);
    expect(resources.patterns.size).toBe(1);
    second.dispose();
    expect(resources.geometries.size).toBe(4);
    resources.dispose();
    expect(resources.materials.size).toBe(0);
  });

  it('grows its triangle count with LOD', () => {
    const counts = MODEL_LOD_LEVELS.map((lod) => buildModel(lampSpec(), { lod }).triangles);
    expect(counts[0]).toBeLessThan(counts[1] ?? 0);
    expect(counts[1]).toBeLessThan(counts[2] ?? 0);
  });
});

describe('toModelBuffers', () => {
  it('gives renderer-neutral typed arrays matching the three model', () => {
    const model = buildModel(lampSpec(), { lod: 2, finish: 'black' });
    const buffers = toModelBuffers(model);
    expect(buffers.bakeVersion).toBe(BAKE_VERSION);
    expect(buffers.parts.map((part) => [part.id, part.parent])).toEqual([
      ['base', null],
      ['arm', 'base'],
      ['shade', 'arm'],
      ['screw', 'shade'],
    ]);
    const triangles = buffers.geometries.reduce((sum, item) => sum + item.indices.length / 3, 0);
    expect(triangles).toBe(model.triangles);
    for (const geometry of buffers.geometries) {
      expect(geometry.positions).toBeInstanceOf(Float32Array);
      expect(geometry.normals.length).toBe(geometry.positions.length);
      expect(Math.max(...geometry.indices)).toBeLessThan(geometry.positions.length / 3);
    }
    model.dispose();
  });

  it('shares materials and textures by index and keeps local matrices', () => {
    const model = buildModel(lampSpec(), { lod: 2, finish: 'black', params: { reach: 0.4 } });
    const buffers = toModelBuffers(model);
    const [base, arm] = buffers.parts;
    if (base === undefined || arm === undefined) throw new Error('parts missing');
    expect(base.material).toBe(arm.material);
    expect(buffers.materials).toHaveLength(3);
    const body = buffers.materials[base.material];
    expect(body?.texture).toBe(0);
    expect(body?.linear[0]).toBeLessThan(1);
    expect(buffers.textures[0]?.pattern).toBe('brushed');
    expect(buffers.materials.find((item) => item.slot === 'shade')?.doubleSided).toBe(true);
    expect(arm.matrix[13]).toBeCloseTo(0.2);
    model.dispose();
  });
});
