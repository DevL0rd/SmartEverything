import type { ModelResolution, ModelSpec } from '@smarteverything/domain';
import { InstancedMesh, Matrix4, Mesh, MeshPhysicalMaterial, Vector3, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { createSceneModel, createSceneModelSet, sceneRoles } from './scene-model';

const VIEW = { yaw: 30, pitch: 18, fov: 28, padding: 0.1 } as const;

function bulbSpec(): ModelSpec {
  return {
    schema: 1,
    id: 'dev.test.bulb',
    version: '1.0.0',
    title: 'Bulb',
    category: 'light',
    footprint: { width: 0.06, depth: 0.06, height: 0.11 },
    framing: { tile: VIEW, card: VIEW, hero: VIEW },
    materials: { body: { finish: 'matte-white' }, glass: { finish: 'frosted-glass' } },
    parts: [
      {
        id: 'base',
        geometry: { type: 'cylinder', height: 0.03, topRadius: 0.02, bottomRadius: 0.015 },
        material: 'body',
      },
      {
        id: 'glass',
        parent: 'base',
        geometry: { type: 'sphere', radius: 0.03 },
        material: 'glass',
        transform: { position: [0, 0.05, 0] },
      },
    ],
    anchors: [
      {
        kind: 'emitter',
        id: 'glow',
        parent: 'glass',
        color: '#FFD9A0',
        intensity: 2,
        radius: 0.06,
      },
      { kind: 'hit', id: 'tap', position: [0, 0.05, 0], size: [0.08, 0.12, 0.08] },
    ],
    channels: [
      {
        id: 'light',
        target: 'glass',
        property: 'emissive',
        source: 'brightness',
        map: { type: 'linear', in: [0, 100], out: [0, 1], clamp: true },
        motion: { type: 'pose' },
        reduced: 'hold',
      },
      {
        id: 'tint',
        target: 'glass',
        property: 'colour',
        source: 'color',
        map: { type: 'colour', from: 'signal' },
        motion: { type: 'pose' },
        reduced: 'hold',
      },
      {
        id: 'glow-tint',
        target: 'glow',
        property: 'colour',
        source: 'color',
        map: { type: 'colour', from: 'signal' },
        motion: { type: 'pose' },
        reduced: 'hold',
      },
      {
        id: 'glow-level',
        target: 'glow',
        property: 'emissive',
        source: 'brightness',
        map: { type: 'linear', in: [0, 100], out: [0, 1], clamp: true },
        motion: { type: 'pose' },
        reduced: 'hold',
      },
    ],
  };
}

function fanSpec(): ModelSpec {
  return {
    schema: 1,
    id: 'dev.test.fan',
    version: '1.0.0',
    title: 'Fan',
    category: 'climate',
    footprint: { width: 0.3, depth: 0.2, height: 0.9 },
    framing: { tile: VIEW, card: VIEW, hero: VIEW },
    materials: { body: { finish: 'graphite' } },
    parts: [
      {
        id: 'stand',
        geometry: { type: 'cylinder', height: 0.8, topRadius: 0.02, bottomRadius: 0.1 },
        material: 'body',
      },
      {
        id: 'blades',
        parent: 'stand',
        geometry: { type: 'cylinder', height: 0.02, topRadius: 0.15, bottomRadius: 0.15 },
        material: 'body',
        transform: { position: [0, 0.8, 0] },
        poses: { folded: { position: [0, 0.4, 0] } },
      },
    ],
    channels: [
      {
        id: 'spin',
        target: 'blades',
        property: 'rotate',
        axis: 'z',
        source: 'speed',
        map: { type: 'speed', in: [0, 1], perSecond: [0, 2] },
        motion: { type: 'spin' },
        reduced: 'hold',
      },
      {
        id: 'fold',
        target: 'blades',
        property: 'pose',
        source: 'mode',
        map: { type: 'enum', table: { stowed: 'folded' } },
        motion: { type: 'pose' },
        reduced: 'hide',
      },
    ],
  };
}

function named(root: Object3D, name: string): Object3D {
  const found = root.getObjectByName(name);
  if (found === undefined) throw new Error(`no node ${name}`);
  return found;
}

function physical(node: Object3D): MeshPhysicalMaterial {
  const material: unknown = node instanceof Mesh ? node.material : null;
  if (!(material instanceof MeshPhysicalMaterial)) throw new Error('no physical material');
  return material;
}

function geometryOf(node: Object3D): unknown {
  return node instanceof Mesh ? node.geometry : null;
}

function instancedOf(root: Object3D): InstancedMesh[] {
  return root.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);
}

describe('createSceneModel', () => {
  it('returns exactly the Home Map contract', () => {
    const model = createSceneModel(bulbSpec(), { lod: 1 });
    expect(Object.keys(model).sort()).toEqual(
      ['dispose', 'emitters', 'hitBoxes', 'object3d', 'setSignals'].sort(),
    );
    expect(named(model.object3d, 'base')).toBeInstanceOf(Mesh);
    expect(named(model.object3d, 'glass').parent?.name).toBe('base');
    expect(model.hitBoxes.map((hit) => hit.id)).toEqual(['tap']);
    expect(model.hitBoxes[0]?.box.getSize(new Vector3()).toArray()).toEqual([0.08, 0.12, 0.08]);
    expect(model.emitters.map((emitter) => [emitter.id, emitter.on])).toEqual([['glow', true]]);
    model.dispose();
    expect(model.object3d.parent).toBeNull();
  });

  it('falls back to the footprint as the tap area when the spec has no hit anchor', () => {
    const model = createSceneModel(fanSpec(), { lod: 1 });
    const box = model.hitBoxes[0]?.box;
    expect(model.hitBoxes.map((hit) => hit.id)).toEqual(['footprint']);
    expect(box?.min.toArray()).toEqual([-0.15, 0, -0.1]);
    expect(box?.max.toArray()).toEqual([0.15, 0.9, 0.1]);
    model.dispose();
  });

  it('drives emitters and materials from signals and resets them when the signal goes', () => {
    const model = createSceneModel(bulbSpec(), { lod: 1 });
    const glass = physical(named(model.object3d, 'glass'));
    expect(model.setSignals({ brightness: 50, color: '#FF0000' })).toBe(false);
    expect(glass.emissiveIntensity).toBeCloseTo(0.5);
    expect(glass.emissive.getHexString()).toBe('ff0000');
    expect(model.emitters[0]?.intensity).toBeCloseTo(1);
    expect(model.emitters[0]?.color).toBe('#FF0000');
    model.setSignals({ brightness: 0 });
    expect(model.emitters[0]?.on).toBe(false);
    model.setSignals({});
    expect(glass.emissive.getHexString()).toBe('000000');
    expect(model.emitters[0]?.color).toBe('#FFD9A0');
    expect(model.emitters[0]?.intensity).toBe(2);
    model.dispose();
  });

  it('spins over time, reports motion, applies poses and honours reduced motion', () => {
    const model = createSceneModel(fanSpec(), { lod: 1 });
    const blades = named(model.object3d, 'blades');
    expect(model.setSignals({ speed: 1 }, { timeS: 0.125 })).toBe(true);
    expect(blades.rotation.z).toBeCloseTo(Math.PI / 2);
    expect(model.setSignals({ speed: 0 })).toBe(false);
    expect(blades.rotation.z).toBe(0);
    model.setSignals({ mode: 'stowed' });
    expect(blades.position.y).toBeCloseTo(0.4);
    model.setSignals({});
    expect(blades.position.y).toBeCloseTo(0.8);
    expect(model.setSignals({ speed: 1, mode: 'stowed' }, { reduced: true, timeS: 9 })).toBe(false);
    expect(blades.visible).toBe(false);
    expect(blades.rotation.z).toBe(0);
    model.dispose();
  });
});

describe('createSceneModelSet', () => {
  it('builds identical items once and instances their static parts', () => {
    const set = createSceneModelSet({ instancing: true });
    const bulbs = Array.from({ length: 23 }, (_, index) => {
      const bulb = set.createSceneModel(bulbSpec(), { lod: 1 });
      bulb.object3d.position.set(index, 0, 0);
      set.object3d.add(bulb.object3d);
      return bulb;
    });
    set.updateInstances();
    const instanced = instancedOf(set.object3d);
    expect(instanced.map((mesh) => [mesh.name, mesh.count])).toEqual([['dev.test.bulb:base', 23]]);
    const glasses = bulbs.map((bulb) => geometryOf(named(bulb.object3d, 'glass')));
    expect(new Set(glasses).size).toBe(1);
    const matrix = new Matrix4();
    instanced[0]?.getMatrixAt(22, matrix);
    expect(new Vector3().setFromMatrixPosition(matrix).toArray()).toEqual([22, 0, 0]);
    set.dispose();
  });

  it('keeps per-item looks apart and releases the batch when its last item goes', () => {
    const set = createSceneModelSet({ instancing: true });
    const first = set.createSceneModel(bulbSpec(), { lod: 1 });
    const second = set.createSceneModel(bulbSpec(), { lod: 1 });
    set.object3d.add(first.object3d, second.object3d);
    first.setSignals({ brightness: 100, color: '#00FF00' });
    second.setSignals({ brightness: 10 });
    expect(physical(named(first.object3d, 'glass')).emissiveIntensity).toBeCloseTo(1);
    expect(physical(named(second.object3d, 'glass')).emissiveIntensity).toBeCloseTo(0.1);
    set.updateInstances();
    first.dispose();
    set.updateInstances();
    expect(instancedOf(set.object3d)[0]?.count).toBe(1);
    second.dispose();
    expect(instancedOf(set.object3d)).toEqual([]);
    set.dispose();
  });

  it('disposes every item look when the whole set is disposed', () => {
    const set = createSceneModelSet({ instancing: true });
    const items = [0, 1].map(() => set.createSceneModel(bulbSpec(), { lod: 1 }));
    for (const item of items) set.object3d.add(item.object3d);
    const looks = items.map((item) => physical(named(item.object3d, 'glass')));
    expect(new Set(looks).size).toBe(2);
    const disposed: unknown[] = [];
    for (const look of looks) look.addEventListener('dispose', () => disposed.push(look));
    set.dispose();
    expect(disposed).toEqual(looks);
    expect(items.map((item) => item.object3d.parent)).toEqual([null, null]);
    items[0]?.dispose();
    expect(disposed).toHaveLength(2);
  });

  it('builds a separate batch for another finish or level of detail', () => {
    const set = createSceneModelSet({ instancing: true });
    for (const lod of [0, 1, 1] as const)
      set.object3d.add(set.createSceneModel(fanSpec(), { lod }).object3d);
    set.updateInstances();
    expect(instancedOf(set.object3d).map((mesh) => mesh.count)).toEqual([1, 2]);
    set.dispose();
    expect(set.object3d.children).toEqual([]);
  });
});

describe('sceneRoles', () => {
  it('lists the main model and each extra role so the map places them separately', () => {
    const resolution: ModelResolution = {
      source: 'kind-default',
      main: { kind: 'catalogue', modelId: 'dev.vacuum.robot' },
      extras: [{ role: 'dock', modelId: 'dev.vacuum.dock' }],
      finish: 'graphite',
      candidates: [],
      issues: [],
    };
    expect(sceneRoles(resolution)).toEqual([
      {
        role: 'main',
        ref: { kind: 'catalogue', modelId: 'dev.vacuum.robot' },
        finish: 'graphite',
        params: undefined,
      },
      {
        role: 'dock',
        ref: { kind: 'catalogue', modelId: 'dev.vacuum.dock' },
        finish: undefined,
        params: undefined,
      },
    ]);
    expect(sceneRoles({ ...resolution, main: null, extras: [] })).toEqual([]);
  });
});
