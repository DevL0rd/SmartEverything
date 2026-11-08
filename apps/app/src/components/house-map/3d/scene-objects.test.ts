import type { ModelSpec } from '@smarteverything/domain';
import {
  Box3,
  Vector3,
  BoxGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
} from 'three';
import { describe, expect, it } from 'vitest';
import { buildModel } from '../../models/three/build-model';
import { createSceneModelSet, type SceneModel } from '../../models/three/scene-model';
import type { RenderObject, RenderPlacement } from '../render-scene';
import { modelledDevice } from './scene-object-plan';
import { VACUUM_QUALITY_TARGET } from './quality-target';
import {
  buildSceneObjects,
  deviceKey,
  objectKey,
  type SceneObjectModel,
  type SceneObjectModelOptions,
  type SceneObjectModelSet,
  type SceneObjects,
  type SceneObjectsFloor,
  type SceneObjectsInput,
} from './scene-objects';

const VIEW = { yaw: 30, pitch: 18, fov: 28, padding: 0.1 } as const;

function spec(id: string, mountY: number | null = null): ModelSpec {
  return {
    schema: 1,
    id,
    version: '1.0.0',
    title: id,
    category: 'furniture',
    footprint: { width: 0.5, depth: 0.5, height: 0.8 },
    framing: { tile: VIEW, card: VIEW, hero: VIEW },
    materials: { body: { finish: 'matte-white' } },
    parts: [
      {
        id: 'body',
        geometry: { type: 'roundedBox', width: 0.5, height: 0.8, depth: 0.5, radius: 0.02 },
        material: 'body',
      },
    ],
    ...(mountY === null
      ? {}
      : { anchors: [{ kind: 'mount', id: 'mount', mount: 'ceiling', position: [0, mountY, 0] }] }),
  };
}

const SPECS = new Map(
  ['cat.chair', 'cat.table', 'cat.sofa', 'cat.lamp', 'cat.plant'].map((id) => [id, spec(id)]),
);

const DEVICE_SPECS = new Map([
  ['light', spec('dev.light', 0.1)],
  ['sensor', spec('dev.sensor')],
]);

function object(id: string, patch: Partial<RenderObject> = {}): RenderObject {
  return {
    id,
    modelId: 'cat.chair',
    kind: 'chair',
    label: null,
    finish: null,
    params: {},
    at: { x: 1, y: 2 },
    rotationDeg: 0,
    elevation: 0,
    footprint: null,
    height: null,
    locked: false,
    roomId: null,
    wall: null,
    ...patch,
  };
}

function placement(deviceId: string, patch: Partial<RenderPlacement> = {}): RenderPlacement {
  return {
    deviceId,
    name: null,
    kind: 'sensor',
    at: { x: 0, y: 0 },
    rotationDeg: 0,
    height: 1,
    tiltDeg: 0,
    mount: 'wall',
    auto: true,
    camera: null,
    roomId: null,
    wall: null,
    ...patch,
  };
}

function floor(id: string, patch: Partial<SceneObjectsFloor> = {}): SceneObjectsFloor {
  return { id, elevation: 0, objects: [], placements: [], walls: [], ...patch };
}

interface FakeModel extends SceneObjectModel {
  readonly options: SceneObjectModelOptions;
  disposed: boolean;
}

interface FakeSet extends SceneObjectModelSet<FakeModel> {
  readonly made: FakeModel[];
  disposed: boolean;
}

function fakeSet(): FakeSet {
  const object3d = new Group();
  const batches = new Map<string, { mesh: InstancedMesh; items: Set<FakeModel> }>();
  const made: FakeModel[] = [];
  const set: FakeSet = {
    object3d,
    made,
    disposed: false,
    createSceneModel: (model, options) => {
      const key = JSON.stringify([model.id, options]);
      const batch = batches.get(key) ?? {
        mesh: new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 1024),
        items: new Set<FakeModel>(),
      };
      batches.set(key, batch);
      object3d.add(batch.mesh);
      const item: FakeModel = {
        object3d: new Group(),
        options,
        disposed: false,
        dispose: () => {
          item.disposed = true;
          item.object3d.removeFromParent();
          batch.items.delete(item);
        },
      };
      batch.items.add(item);
      made.push(item);
      return item;
    },
    updateInstances: () => {
      for (const batch of batches.values()) batch.mesh.count = batch.items.size;
    },
    dispose: () => {
      set.disposed = true;
    },
  };
  return set;
}

interface Built {
  readonly scene: SceneObjects<FakeModel>;
  readonly sets: readonly FakeSet[];
}

function build(
  floors: readonly SceneObjectsFloor[],
  patch: Partial<SceneObjectsInput<FakeModel>>,
): Built {
  const sets: FakeSet[] = [];
  const scene = buildSceneObjects<FakeModel>({
    createModelSet: () => {
      const made = fakeSet();
      sets.push(made);
      return made;
    },
    floors,
    specOf: (id) => SPECS.get(id),
    deviceSpecOf: (item) => (item.kind === null ? undefined : DEVICE_SPECS.get(item.kind)),
    theme: 'light',
    ...patch,
  });
  return { scene, sets };
}

describe('scene objects', () => {
  it('builds known objects through the model set at LOD 0 with finish and params, placed on the map', () => {
    const item = object('a', {
      finish: 'oak',
      params: { width: 1.2 },
      at: { x: 3, y: 4 },
      rotationDeg: 90,
      elevation: 0.4,
    });
    const { scene } = build([floor('g', { objects: [item] })], {});
    const built = scene.item(objectKey('a'));
    expect(built?.model?.options).toEqual({ lod: 0, finish: 'oak', params: { width: 1.2 } });
    const node = built?.model?.object3d;
    expect(node?.position.toArray()).toEqual([3, 0.4, -4]);
    expect(node?.rotation.y).toBeCloseTo(Math.PI);
  });

  it('builds the selected item at LOD 1 and moves the lift with the selection', () => {
    const floors = [floor('g', { objects: [object('a'), object('b')] })];
    const { scene, sets } = build(floors, { selectedKey: objectKey('a') });
    expect(scene.item(objectKey('a'))?.lod).toBe(1);
    expect(scene.item(objectKey('b'))?.lod).toBe(0);
    const first = scene.item(objectKey('a'))?.model;
    scene.select(objectKey('b'));
    expect(first?.disposed).toBe(true);
    expect(scene.item(objectKey('a'))?.lod).toBe(0);
    expect(scene.item(objectKey('b'))?.lod).toBe(1);
    expect(sets.flatMap((set) => set.made)).toHaveLength(4);
  });

  it('keeps a higher scaler LOD when selected', () => {
    const { scene } = build([floor('g', { objects: [object('a')] })], {
      selectedKey: objectKey('a'),
      lodOf: () => 2,
    });
    expect(scene.item(objectKey('a'))?.lod).toBe(2);
  });

  it('re-levels the built items when the scaler LOD changes and keeps the rest', () => {
    let level: 0 | 1 | 2 = 2;
    const { scene } = build([floor('g', { objects: [object('a')] })], { lodOf: () => level });
    const first = scene.item(objectKey('a'))?.model;
    expect(first?.options.lod).toBe(2);
    scene.refreshLevels();
    expect(scene.item(objectKey('a'))?.model).toBe(first);
    level = 0;
    scene.refreshLevels();
    expect(first?.disposed).toBe(true);
    expect(scene.item(objectKey('a'))?.model?.options.lod).toBe(0);
  });

  it('draws unknown ids as labelled boxes merged into one mesh per floor', () => {
    const objects = [
      object('x', { modelId: 'cat.unknown', label: 'Piano' }),
      object('y', { modelId: null, kind: 'bench' }),
      object('z', { modelId: 'cat.mystery' }),
    ];
    const placements = [placement('d1', { kind: 'odd', name: 'Hall sensor' })];
    const { scene } = build([floor('g', { objects, placements, elevation: 3 })], {});
    const boxes = scene.root.getObjectsByProperty('name', 'unknown-models');
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toBeInstanceOf(Mesh);
    expect(scene.labels.map((label) => label.text)).toEqual([
      'Piano',
      'bench',
      'cat.mystery',
      'Hall sensor',
    ]);
    const box = scene.item(objectKey('x'))?.box;
    expect(box?.min.y).toBeCloseTo(3);
    expect(scene.labels[0]?.position[1]).toBeGreaterThan(box?.max.y ?? Infinity);
    expect(scene.item(deviceKey('d1'))?.model).toBeNull();
  });

  it('gives each floor its own group at its elevation and its own model set', () => {
    const floors = [
      floor('g', { objects: [object('a')] }),
      floor('u', { elevation: 2.8, objects: [object('b')] }),
    ];
    const { scene, sets } = build(floors, {});
    expect(scene.root.children.map((group) => [group.name, group.position.y])).toEqual([
      ['floor:g', 0],
      ['floor:u', 2.8],
    ]);
    expect(sets).toHaveLength(4);
    expect(scene.item(objectKey('b'))?.floorId).toBe('u');
  });

  it('hangs a device from its mount anchor at the placement height', () => {
    const placements = [placement('lamp', { kind: 'light', mount: 'ceiling', height: 2.6 })];
    const { scene } = build([floor('g', { placements })], {});
    expect(scene.item(deviceKey('lamp'))?.model?.object3d.position.y).toBeCloseTo(2.5);
  });

  it.each([
    ['floor', 0, 0],
    ['table', 0.75, 0.75],
    ['wall', 2.2, 1.8],
    ['ceiling', 2.6, 2.9],
  ] as const)(
    'places the %s mount using its matching, converted or geometric anchor',
    (mount, height, y) => {
      const deviceSpec: ModelSpec = {
        ...spec('dev.camera'),
        anchors: [{ kind: 'mount', id: 'desk', mount: 'desk', position: [0, 0.3, 0] }],
      };
      const node = new Group();
      const model = modelledDevice(placement('camera', { mount, height }), deviceSpec, new Map());
      model.place(node);
      expect(node.position.y).toBeCloseTo(mount === 'table' ? height - 0.3 : y);
    },
  );

  it.each(['desk', 'floor'] as const)(
    'hangs a %s-mounted body downward from its socket with its yaw intact',
    (mount) => {
      const deviceSpec: ModelSpec = {
        ...spec('dev.bulb'),
        anchors: [{ kind: 'mount', id: 'socket', mount, position: [0.1, 0.2, -0.1] }],
      };
      const node = new Group();
      const body = new Mesh(new BoxGeometry(0.5, 0.8, 0.5));
      body.position.set(0.1, 0.6, -0.1);
      node.add(body);
      modelledDevice(
        placement('bulb', { mount: 'ceiling', height: 2.6, at: { x: 2, y: 3 }, rotationDeg: 35 }),
        deviceSpec,
        new Map(),
      ).place(node);
      const socket = node.localToWorld(new Vector3(0.1, 0.2, -0.1));
      expect(socket.x).toBeCloseTo(2);
      expect(socket.y).toBeCloseTo(2.6);
      expect(socket.z).toBeCloseTo(-3);
      const bounds = new Box3().setFromObject(node);
      expect(bounds.max.y).toBeCloseTo(2.6);
      expect(bounds.min.y).toBeCloseTo(1.8);
      const up = new Vector3(0, 1, 0).applyQuaternion(node.quaternion);
      expect(up.y).toBeCloseTo(-1);
      const forward = new Vector3(0, 0, 1).applyQuaternion(node.quaternion);
      expect(forward.x).toBeCloseTo(Math.sin((125 * Math.PI) / 180));
      expect(forward.z).toBeCloseTo(Math.cos((125 * Math.PI) / 180));
      body.geometry.dispose();
    },
  );

  it.each(['floor', 'table', 'ceiling'] as const)(
    'keeps an authored matching %s mount upright',
    (mount) => {
      const anchorMount = mount === 'table' ? 'desk' : mount;
      const deviceSpec: ModelSpec = {
        ...spec('dev.fixture'),
        anchors: [
          { kind: 'mount', id: 'base', mount: 'floor', position: [0, 0, 0] },
          { kind: 'mount', id: 'requested', mount: anchorMount, position: [0.1, 0.8, -0.1] },
        ],
      };
      const node = new Group();
      const body = new Mesh(new BoxGeometry(0.5, 0.8, 0.5));
      body.position.y = 0.4;
      node.add(body);
      modelledDevice(placement('fixture', { mount, height: 2.6 }), deviceSpec, new Map()).place(
        node,
      );
      expect(new Vector3(0, 1, 0).applyQuaternion(node.quaternion).y).toBeCloseTo(1);
      if (mount !== 'floor')
        expect(node.localToWorld(new Vector3(0.1, 0.8, -0.1)).y).toBeCloseTo(2.6);
      if (mount === 'ceiling') {
        const bounds = new Box3().setFromObject(node);
        expect(bounds.max.y).toBeCloseTo(2.6);
        expect(bounds.min.y).toBeCloseTo(1.8);
      }
      body.geometry.dispose();
    },
  );

  it('keeps the geometric ceiling offset when a model has no mount anchor', () => {
    const node = new Group();
    modelledDevice(
      placement('unknown', { mount: 'ceiling', height: 2.6 }),
      spec('dev.unknown'),
      new Map(),
    ).place(node);
    expect(node.position.y).toBeCloseTo(1.8);
    expect(new Vector3(0, 1, 0).applyQuaternion(node.quaternion).y).toBeCloseTo(1);
  });

  it('disposes every model set and detaches the root', () => {
    const parent = new Group();
    const { scene, sets } = build([floor('g', { objects: [object('a')] }), floor('u')], {});
    parent.add(scene.root);
    scene.dispose();
    expect(sets.every((made) => made.disposed)).toBe(true);
    expect(scene.root.parent).toBeNull();
  });
});

const FINISHES = ['oak', 'ash', 'slate'] as const;

function furniture(id: string): ModelSpec {
  const leg = (side: number): ModelSpec['parts'][number] => ({
    id: side > 0 ? 'leg-right' : 'leg-left',
    parent: 'top',
    geometry: { type: 'cylinder', height: 0.7, topRadius: 0.02, bottomRadius: 0.02 },
    material: 'frame',
    transform: { position: [{ param: 'width', scale: side * 0.4 }, -0.35, 0] },
  });
  return {
    schema: 1,
    id,
    version: '1.0.0',
    title: id,
    category: 'furniture',
    footprint: { width: 1, depth: 0.5, height: 0.75 },
    framing: { tile: VIEW, card: VIEW, hero: VIEW },
    params: { width: { min: 0.4, max: 3, default: 1, unit: 'm' } },
    materials: { top: { finish: 'warm-white' }, frame: { finish: 'satin-black' } },
    finishes: {
      oak: {},
      ash: { top: { finish: 'matte-white' } },
      slate: { top: { finish: 'graphite' } },
    },
    defaultFinish: 'oak',
    parts: [
      {
        id: 'top',
        geometry: { type: 'roundedBox', width: 1, height: 0.04, depth: 0.5, radius: 0.01 },
        material: 'top',
        transform: { position: [0, 0.73, 0] },
      },
      leg(-1),
      leg(1),
    ],
  };
}

function sensor(): ModelSpec {
  return {
    schema: 1,
    id: 'dev.test.sensor',
    version: '1.0.0',
    title: 'Sensor',
    category: 'sensor',
    footprint: { width: 0.05, depth: 0.05, height: 0.03 },
    framing: { tile: VIEW, card: VIEW, hero: VIEW },
    materials: { body: { finish: 'matte-white' }, lens: { finish: 'satin-black' } },
    parts: [
      {
        id: 'body',
        geometry: { type: 'cylinder', height: 0.02, topRadius: 0.025, bottomRadius: 0.025 },
        material: 'body',
      },
      {
        id: 'lens',
        parent: 'body',
        geometry: { type: 'sphere', radius: 0.01 },
        material: 'lens',
        transform: { position: [0, 0.01, 0] },
      },
    ],
  };
}

function bulb(): ModelSpec {
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
    ],
  };
}

const HOUSE_SPECS = new Map(
  ['cat.table', 'cat.desk', 'cat.bench', 'cat.shelf', 'cat.console'].map((id) => [
    id,
    furniture(id),
  ]),
);

const HOUSE_DEVICES = new Map([
  ['light', bulb()],
  ['sensor', sensor()],
]);

function house(): SceneObjectsFloor {
  const kinds = [...HOUSE_SPECS.keys()];
  const distinct = Array.from({ length: 130 }, (_, index) =>
    object(`o${String(index)}`, {
      modelId: kinds[index % kinds.length] ?? null,
      finish: FINISHES[Math.floor(index / kinds.length) % FINISHES.length] ?? null,
      params: { width: 0.4 + index * 0.01 },
      at: { x: index % 13, y: Math.floor(index / 13) },
    }),
  );
  const chairs = Array.from({ length: 20 }, (_, index) =>
    object(`r${String(index)}`, { modelId: 'cat.table', at: { x: index, y: 20 } }),
  );
  const unknown = Array.from({ length: 10 }, (_, index) =>
    object(`u${String(index)}`, { modelId: 'cat.unlisted' }),
  );
  const placements = Array.from({ length: 30 }, (_, index) =>
    placement(`d${String(index)}`, {
      kind: index < 4 ? 'light' : 'sensor',
      at: { x: index, y: 0 },
    }),
  );
  return floor('g', { objects: [...distinct, ...chairs, ...unknown], placements });
}

function buildHouse(selectedKey: string | null = null): SceneObjects<SceneModel> {
  return buildSceneObjects<SceneModel>({
    createModelSet: createSceneModelSet,
    floors: [house()],
    specOf: (id) => HOUSE_SPECS.get(id),
    deviceSpecOf: (item) => (item.kind === null ? undefined : HOUSE_DEVICES.get(item.kind)),
    theme: 'light',
    selectedKey,
  });
}

const isMesh = (node: Object3D): node is Mesh => node instanceof Mesh;

function trianglesOf(node: Object3D): number {
  if (!isMesh(node)) return 0;
  const { index } = node.geometry;
  return (index === null ? node.geometry.getAttribute('position').count : index.count) / 3;
}

function instancedOf(root: Object3D): InstancedMesh[] {
  const nodes: Object3D[] = [];
  root.traverse((node) => nodes.push(node));
  return nodes.filter((node): node is InstancedMesh => node instanceof InstancedMesh);
}

function named(root: Object3D, name: string): Object3D[] {
  return root.getObjectsByProperty('name', name);
}

function expectedTriangles(floorPlan: SceneObjectsFloor, selected: string | null): number {
  let total = 0;
  for (const item of floorPlan.objects) {
    const model = item.modelId === null ? undefined : HOUSE_SPECS.get(item.modelId);
    if (model === undefined) continue;
    const lod = objectKey(item.id) === selected ? 1 : 0;
    const built = buildModel(model, { lod, finish: item.finish ?? undefined, params: item.params });
    total += built.triangles;
    built.dispose();
  }
  for (const item of floorPlan.placements) {
    const model = item.kind === null ? undefined : HOUSE_DEVICES.get(item.kind);
    if (model === undefined) continue;
    const built = buildModel(model, { lod: deviceKey(item.deviceId) === selected ? 1 : 0 });
    total += built.triangles;
    built.dispose();
  }
  return total;
}

describe('scene objects on real model geometry', () => {
  it('merges the static output of a synthetic house per floor within the quality target, dropping nothing', () => {
    const scene = buildHouse();
    const merged = named(scene.root, 'merged-statics')[0];
    const boxes = named(scene.root, 'unknown-models')[0];
    expect(scene.keys()).toHaveLength(190);
    expect(scene.labels).toHaveLength(10);
    expect(merged?.children).toHaveLength(4);
    const instanced = instancedOf(scene.root);
    expect(instanced.map((mesh) => [mesh.name, mesh.count]).sort()).toEqual([
      ['cat.table:leg-left', 20],
      ['cat.table:leg-right', 20],
      ['cat.table:top', 20],
      ['dev.test.bulb:base', 4],
      ['dev.test.sensor:body', 26],
      ['dev.test.sensor:lens', 26],
    ]);
    const stats = scene.stats();
    expect(stats.drawCalls).toBe(4 + 6 + 4 + 1);
    expect(stats.drawCalls).toBeLessThanOrEqual(VACUUM_QUALITY_TARGET.drawCalls);
    expect(stats.triangles).toBeLessThanOrEqual(VACUUM_QUALITY_TARGET.triangles);
    const boxTriangles = boxes === undefined ? 0 : trianglesOf(boxes);
    expect(stats.triangles - boxTriangles).toBe(expectedTriangles(house(), null));
    scene.dispose();
  });

  it('pulls the selected item out of the merge at LOD 1 and merges it back when deselected', () => {
    const scene = buildHouse();
    const before = scene.stats();
    const key = objectKey('o7');
    scene.select(key);
    expect(scene.item(key)?.lod).toBe(1);
    const sources = named(scene.root, 'merge-sources')[0];
    let parent = scene.item(key)?.model?.object3d.parent;
    expect(parent).not.toBe(sources);
    expect(scene.stats().drawCalls).toBe(before.drawCalls + 3);
    expect(scene.stats().triangles).toBe(
      expectedTriangles(house(), key) + before.triangles - expectedTriangles(house(), null),
    );
    scene.select(null);
    parent = scene.item(key)?.model?.object3d.parent;
    expect(parent).toBe(sources);
    expect(scene.stats()).toEqual(before);
    scene.dispose();
  });

  it('keeps the rest of a repeat instanced when one copy is selected', () => {
    const scene = buildHouse(objectKey('r3'));
    const instanced = instancedOf(scene.root);
    const top = instanced.filter((mesh) => mesh.name === 'cat.table:top').map((mesh) => mesh.count);
    expect(top.sort()).toEqual([1, 19]);
    expect(scene.keys()).toHaveLength(190);
    scene.dispose();
  });
});
