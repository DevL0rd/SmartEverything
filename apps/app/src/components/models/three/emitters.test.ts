import type { ModelSpec } from '@smarteverything/domain';
import { Group, Object3D, PointLight, SpotLight } from 'three';
import { describe, expect, it } from 'vitest';
import {
  createEmitterRig,
  emitterSurfaces,
  glowSpread,
  MIN_GLOW_SPREAD_M,
  syncEmitterRigs,
  type EmitterRig,
  type GlowSurfaces,
} from './emitters';
import { createGlowDecalFactory, glowStrength } from './glow-decal';
import { createSceneModel } from './scene-model';
import type { SceneEmitter } from './scene-signals';

type MutableEmitter = { -readonly [K in keyof SceneEmitter]: SceneEmitter[K] };

const FLOOR: GlowSurfaces = { floorY: 0, wallZ: undefined };
const VIEW = { yaw: 30, pitch: 18, fov: 28, padding: 0.1 } as const;

function lamp(intensity: number, cone?: number): { root: Group; emitter: MutableEmitter } {
  const root = new Group();
  const node = new Object3D();
  node.position.set(0.2, 1.5, 0.1);
  root.add(node);
  const emitter: MutableEmitter = {
    id: 'glow',
    node,
    cone,
    radius: 0.05,
    color: '#FFD9A0',
    intensity,
    on: intensity > 0,
  };
  return { root, emitter };
}

function rigOf(intensity: number, cone?: number): { rig: EmitterRig; emitter: MutableEmitter } {
  const { root, emitter } = lamp(intensity, cone);
  const decals = createGlowDecalFactory();
  const rig = createEmitterRig({
    model: { object3d: root, emitters: [emitter] },
    surfaces: FLOOR,
    decals,
  });
  return { rig, emitter };
}

function sconceSpec(): ModelSpec {
  return mountedSpec('wall');
}

function mountedSpec(mount: 'wall' | 'ceiling'): ModelSpec {
  return {
    schema: 1,
    id: `dev.test.${mount}-light`,
    version: '1.0.0',
    title: 'Sconce',
    category: 'light',
    footprint: { width: 0.2, depth: 0.12, height: 0.3 },
    framing: { tile: VIEW, card: VIEW, hero: VIEW },
    materials: { body: { finish: 'matte-white' } },
    parts: [{ id: 'body', geometry: { type: 'sphere', radius: 0.05 }, material: 'body' }],
    anchors: [
      { kind: 'mount', id: 'mount', mount },
      {
        kind: 'emitter',
        id: 'glow',
        position: [0, 0.2, 0],
        color: '#FFFFFF',
        intensity: 1,
        radius: 0.05,
        cone: 60,
      },
    ],
  };
}

describe('emitters', () => {
  it('spreads a spot by its cone and a point light by its height', () => {
    expect(glowSpread(2, 90)).toBeCloseTo(2);
    expect(glowSpread(1, undefined)).toBeCloseTo(1.2);
    expect(glowSpread(0, undefined)).toBe(MIN_GLOW_SPREAD_M);
  });

  it('gives a light that is on a floor glow under it and a real light', () => {
    const { rig } = rigOf(2);
    const split = syncEmitterRigs([{ rig, surfaces: FLOOR }], 0);
    const entry = rig.lights[0];
    expect(split.real).toEqual(['0:0']);
    expect(entry?.light).toBeInstanceOf(PointLight);
    expect(entry?.light.visible).toBe(true);
    expect(entry?.light.intensity).toBe(2);
    expect(entry?.floor.mesh.visible).toBe(true);
    expect(entry?.floor.mesh.position.x).toBeCloseTo(0.2);
    expect(entry?.floor.mesh.position.z).toBeCloseTo(0.1);
    expect(entry?.floor.mesh.position.y).toBeCloseTo(0, 2);
    rig.dispose();
    expect(entry?.light.parent).toBeNull();
    expect(entry?.floor.mesh.parent).toBeNull();
  });

  it('hides both glow and light when the light is off or not visible', () => {
    const { rig, emitter } = rigOf(2);
    emitter.on = false;
    expect(syncEmitterRigs([{ rig, surfaces: FLOOR }], 0).real).toEqual([]);
    expect(rig.lights[0]?.light.visible).toBe(false);
    expect(rig.lights[0]?.floor.mesh.visible).toBe(false);
    emitter.on = true;
    rig.root.visible = false;
    expect(syncEmitterRigs([{ rig, surfaces: FLOOR }], 0).real).toEqual([]);
    rig.root.visible = true;
    expect(syncEmitterRigs([{ rig, surfaces: FLOOR }], 0).real).toEqual(['0:0']);
    rig.dispose();
  });

  it('makes every visible light that is on a real light, with no count', () => {
    const rigs = Array.from({ length: 40 }, (_, index) => ({
      ...rigOf(index + 1),
      surfaces: FLOOR,
    }));
    const split = syncEmitterRigs(rigs, 0);
    expect(split.real).toHaveLength(40);
    expect(rigs.every(({ rig }) => rig.lights[0]?.light.visible === true)).toBe(true);
    for (const { rig } of rigs) rig.dispose();
  });

  it('turns only the dimmest real lights into glow decals on the scaler step', () => {
    const rigs = [5, 1, 3, 2].map((intensity) => ({ ...rigOf(intensity), surfaces: FLOOR }));
    const split = syncEmitterRigs(rigs, 0.5);
    expect(split.decal).toEqual(['1:0', '3:0']);
    expect(rigs.map(({ rig }) => rig.lights[0]?.light.visible)).toEqual([true, false, true, false]);
    expect(rigs.every(({ rig }) => rig.lights[0]?.floor.mesh.visible === true)).toBe(true);
    expect(syncEmitterRigs(rigs, 0).real).toHaveLength(4);
    for (const { rig } of rigs) rig.dispose();
  });

  it('uses a spot light for a cone and adds a wall glow for a wall-mounted model', () => {
    const model = createSceneModel(sconceSpec(), { lod: 1 });
    const surfaces = emitterSurfaces(sconceSpec());
    expect(surfaces).toEqual({ floorY: -1.2, wallZ: -0.06 });
    const decals = createGlowDecalFactory();
    const rig = createEmitterRig({ model, surfaces, decals });
    syncEmitterRigs([{ rig, surfaces }], 0);
    const entry = rig.lights[0];
    expect(entry?.light).toBeInstanceOf(SpotLight);
    expect(entry?.wall?.mesh.visible).toBe(true);
    expect(entry?.wall?.mesh.position.z).toBeCloseTo(-0.06, 2);
    expect(entry?.wall?.mesh.position.y).toBeCloseTo(0.2);
    rig.dispose();
    decals.dispose();
    model.dispose();
  });

  it('puts the floor glow of a ceiling or wall light on the room floor with a spread from its real height', () => {
    for (const [mount, height] of [
      ['ceiling', 2.4],
      ['wall', 1.6],
    ] as const) {
      const spec = mountedSpec(mount);
      const model = createSceneModel(spec, { lod: 1 });
      const surfaces = emitterSurfaces(spec, height);
      expect(surfaces.floorY).toBeCloseTo(-height);
      const decals = createGlowDecalFactory();
      const rig = createEmitterRig({ model, surfaces, decals });
      syncEmitterRigs([{ rig, surfaces }], 0);
      const entry = rig.lights[0];
      expect(entry?.floor.mesh.position.y).toBeCloseTo(-height, 2);
      const spread = glowSpread(height + 0.2, 60);
      expect(spread).toBeGreaterThan(MIN_GLOW_SPREAD_M * 4);
      const strength = glowStrength(entry?.emitter.intensity ?? 0);
      expect(entry?.floor.mesh.scale.x).toBeCloseTo(spread * 2 * (0.6 + 0.4 * strength), 3);
      rig.dispose();
      decals.dispose();
      model.dispose();
    }
  });
});
