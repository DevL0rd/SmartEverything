import { HOME_MAP_WALL_ID, homeMapBoxCorners, type ModelSpec } from '@smarteverything/domain';
import { Group } from 'three';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { floorOf, placement } from '../lighting-fixture';
import type { RenderFloor, RenderObject, RenderWall } from '../render-scene';
import {
  ObjectsLayer,
  SCENE_MODELS,
  lodForBias,
  objectsLayerOf,
  objectModelsOf,
  type ObjectModels,
} from './render-core-objects';
import {
  deviceKey,
  objectKey,
  type SceneObjectModel,
  type SceneObjectModelOptions,
  type SceneObjectModelSet,
} from './scene-objects';

type FakeModel = SceneObjectModel & { disposed: boolean };

function recordingSet(made: SceneObjectModelOptions[]): SceneObjectModelSet<FakeModel> {
  const object3d = new Group();
  return {
    object3d,
    createSceneModel: (_spec, options): FakeModel => {
      made.push(options);
      const model: FakeModel = {
        object3d: new Group(),
        disposed: false,
        dispose: () => {
          model.disposed = true;
          model.object3d.removeFromParent();
        },
      };
      return model;
    },
    updateInstances: () => undefined,
    dispose: () => undefined,
  };
}

function createModelSet(): SceneObjectModelSet<FakeModel> {
  return recordingSet([]);
}

const VIEW = { yaw: 30, pitch: 18, fov: 28, padding: 0.1 } as const;

function spec(id: string, anchors?: ModelSpec['anchors']): ModelSpec {
  return {
    schema: 1,
    id,
    version: '1.0.0',
    title: id,
    category: 'furniture',
    footprint: { width: 0.6, depth: 0.4, height: 0.8 },
    framing: { tile: VIEW, card: VIEW, hero: VIEW },
    materials: { body: { finish: 'matte-white' } },
    parts: [
      {
        id: 'body',
        geometry: { type: 'roundedBox', width: 0.6, height: 0.8, depth: 0.4, radius: 0.02 },
        material: 'body',
      },
    ],
    ...(anchors === undefined ? {} : { anchors }),
  };
}

const PICTURE = spec('cat.picture');

const SCREEN = spec('dev.screen', [
  { kind: 'mount', id: 'stand', mount: 'desk', position: [0, 0, 0] },
  { kind: 'mount', id: 'wall', mount: 'wall', position: [0, 0.4, -0.1] },
]);

const SENSOR = spec('dev.sensor');

const NORTH: RenderWall = {
  id: 'north',
  from: { x: 0, y: 0 },
  to: { x: 4, y: 0 },
  thickness: 0.2,
  height: 2.5,
  kind: 'solid',
  exterior: false,
};

const onNorth = (offset: number): RenderObject['wall'] => ({
  wallId: HOME_MAP_WALL_ID.parse('north'),
  offset,
  side: 'left',
});

function object(id: string, extra: Partial<RenderObject> = {}): RenderObject {
  return {
    id,
    modelId: PICTURE.id,
    kind: 'picture',
    label: null,
    finish: null,
    params: {},
    at: { x: 3, y: 3 },
    rotationDeg: 40,
    elevation: 1.4,
    footprint: null,
    height: null,
    locked: false,
    roomId: null,
    wall: null,
    ...extra,
  };
}

function house(): RenderFloor {
  return {
    ...floorOf([
      placement('tv', 3, 3, { kind: 'screen', mount: 'wall', height: 1.2, wall: onNorth(2) }),
      placement('motion', 3, 3, { kind: 'sensor', mount: 'wall', height: 2, wall: onNorth(3) }),
      placement('loose', 1, 1, { kind: 'sensor', mount: 'table', height: 0.75 }),
    ]),
    elevation: 2.8,
    walls: [NORTH],
    objects: [object('art', { wall: onNorth(1) }), object('chair', { at: { x: 2, y: 2 } })],
  };
}

const MODELS: ObjectModels = objectModelsOf(
  SCENE_MODELS.parse({
    specs: [PICTURE, SCREEN, SENSOR],
    devices: { tv: SCREEN.id, motion: SENSOR.id, loose: SENSOR.id },
  }),
);

function layer(): {
  readonly objects: ObjectsLayer<FakeModel>;
  readonly changed: Mock<() => void>;
} {
  const changed = vi.fn<() => void>();
  const objects = new ObjectsLayer<FakeModel>({ createModelSet, onChange: changed });
  objects.setFloor(house(), 'light');
  objects.setModels(MODELS);
  return { objects, changed };
}

function positionOf(objects: ObjectsLayer<FakeModel>, key: string): readonly number[] {
  const node = objects.item(key)?.model?.object3d;
  return (node?.position.toArray() ?? []).map((value) => Math.round(value * 1000) / 1000);
}

describe('the render core objects layer', () => {
  it('maps the scaler LOD bias to a model level, full detail without a bias', () => {
    expect([0, 1, 2, 3].map(lodForBias)).toEqual([2, 1, 0, 0]);
  });

  it('builds nothing until the scene models arrive, then one scene objects root per floor', () => {
    const objects = new ObjectsLayer<FakeModel>({ createModelSet, onChange: vi.fn() });
    objects.setFloor(house(), 'light');
    expect(objects.group.children).toHaveLength(0);
    objects.setModels(MODELS);
    expect(objects.group.children.map((child) => child.name)).toEqual(['scene-objects']);
    const first = objects.group.children[0];
    objects.setFloor({ ...house(), id: 'upper' }, 'light');
    expect(objects.group.children).toHaveLength(1);
    expect(objects.group.children[0]).not.toBe(first);
    expect(first?.parent).toBeNull();
    objects.dispose();
    expect(objects.group.children).toHaveLength(0);
  });

  it('hangs a wall object flat on the wall face at its elevation, facing the room', () => {
    const { objects } = layer();
    expect(positionOf(objects, objectKey('art'))).toEqual([1, 1.4, -0.3]);
    expect(objects.item(objectKey('art'))?.model?.object3d.rotation.y).toBeCloseTo(Math.PI);
    expect(positionOf(objects, objectKey('chair'))).toEqual([2, 1.4, -2]);
  });

  it('hangs a wall device from its wall mount anchor, or its back, at its height', () => {
    const { objects } = layer();
    expect(positionOf(objects, deviceKey('tv'))).toEqual([2, 0.8, -0.2]);
    expect(positionOf(objects, deviceKey('motion'))).toEqual([3, 1.6, -0.3]);
    expect(positionOf(objects, deviceKey('loose'))).toEqual([1, 0.75, -1]);
  });

  it('draws the floor at ground level like the structure layers', () => {
    const { objects } = layer();
    const root = objects.group.children[0];
    expect(root?.children.map((group) => group.position.y)).toEqual([0]);
  });

  it('re-levels the built objects when the scaler LOD bias changes and asks for a frame', () => {
    const { objects, changed } = layer();
    const before = objects.item(objectKey('chair'))?.model;
    expect(objects.item(objectKey('chair'))?.lod).toBe(2);
    changed.mockClear();
    objects.setLodBias(2);
    expect(objects.item(objectKey('chair'))?.lod).toBe(0);
    expect(before?.disposed).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);
    objects.setLodBias(3);
    expect(changed).toHaveBeenCalledTimes(1);
    objects.dispose();
  });

  it('lifts the selected item to at least LOD 1 at the lowest quality', () => {
    const { objects } = layer();
    objects.setLodBias(3);
    objects.select(deviceKey('tv'));
    expect(objects.item(deviceKey('tv'))?.lod).toBe(1);
    expect(objects.item(objectKey('chair'))?.lod).toBe(0);
    objects.setFloor({ ...house(), id: 'again' }, 'dark');
    expect(objects.item(deviceKey('tv'))?.lod).toBe(1);
    objects.dispose();
  });

  it('hides furniture or device models by the look flags', () => {
    const { objects } = layer();
    objects.setLook({ showFurniture: false, showDeviceModels: true });
    expect(objects.item(objectKey('chair'))).toBeUndefined();
    expect(objects.item(deviceKey('tv'))).toBeDefined();
    objects.setLook({ showFurniture: true, showDeviceModels: false });
    expect(objects.item(objectKey('chair'))).toBeDefined();
    expect(objects.item(deviceKey('tv'))).toBeUndefined();
    objects.dispose();
  });

  it('gives furniture pick boxes on the editor corners with their lock, and devices a model box', () => {
    const { objects } = layer();
    const chair = objects.objectBoxes().find((box) => box.id === 'chair');
    const expected = homeMapBoxCorners({ at: { x: 2, y: 2 }, rotation: 40, w: 0.6, d: 0.4 });
    for (const corner of expected) {
      const gaps = (chair?.ring ?? []).map((p) => Math.hypot(p.x - corner.x, p.y - corner.y));
      expect(Math.min(...gaps)).toBeLessThan(1e-9);
    }
    expect(chair?.locked).toBe(false);
    expect(chair?.base).toBeCloseTo(1.4);
    expect(chair?.top).toBeCloseTo(2.2);
    expect(objects.deviceBoxes().filter((box) => box.id === 'loose')).toHaveLength(2);
    objects.setLook({ showFurniture: false, showDeviceModels: true });
    expect(objects.objectBoxes()).toEqual([]);
    objects.dispose();
  });

  it('exists only when the core is given a model builder', () => {
    expect(objectsLayerOf(undefined, vi.fn())).toBeNull();
    expect(objectsLayerOf(createModelSet, vi.fn())).toBeInstanceOf(ObjectsLayer);
  });

  it('resolves device specs through the sent device to model table', () => {
    expect(MODELS.deviceSpecOf(placement('tv', 0, 0))?.id).toBe(SCREEN.id);
    expect(MODELS.deviceSpecOf(placement('other', 0, 0))).toBeUndefined();
    expect(MODELS.specOf('cat.picture')?.id).toBe(PICTURE.id);
  });
});

const TABLE: ModelSpec = {
  ...spec('cat.table'),
  params: { width: { min: 0.4, max: 3, default: 0.6, unit: 'm' } },
  size: { width: { param: 'width', extra: 0, resizes: true } },
};

describe('the render core objects layer preview', () => {
  const moved = {
    at: { x: 1, y: 2 },
    rotationDeg: 90,
    height: 0.2,
    wall: null,
    size: null,
  } as const;

  it('draws an object at the previewed pose and puts it back on an empty preview', () => {
    const { objects, changed } = layer();
    const before = positionOf(objects, objectKey('chair'));
    changed.mockClear();
    objects.preview([{ id: 'chair', pose: moved, lift: 0 }]);
    expect(positionOf(objects, objectKey('chair'))).toEqual([1, 0.2, -2]);
    expect(objects.item(objectKey('chair'))?.model?.object3d.rotation.y).toBeCloseTo(Math.PI);
    expect(changed).toHaveBeenCalledTimes(1);
    objects.preview([{ id: 'chair', pose: { ...moved, at: { x: 1.5, y: 2 } }, lift: 0 }]);
    expect(positionOf(objects, objectKey('chair'))).toEqual([1.5, 0.2, -2]);
    objects.preview([]);
    expect(positionOf(objects, objectKey('chair'))).toEqual(before);
    objects.dispose();
  });

  it('draws a device at the previewed pose and leaves the other items where they are', () => {
    const { objects } = layer();
    const chair = positionOf(objects, objectKey('chair'));
    objects.preview([{ id: 'loose', pose: { ...moved, height: 0.9 }, lift: 0 }]);
    expect(positionOf(objects, deviceKey('loose'))).toEqual([1, 0.9, -2]);
    expect(positionOf(objects, objectKey('chair'))).toEqual(chair);
    objects.dispose();
  });

  it('lifts an item in place by the pick-up lift and keeps the preview across a new floor', () => {
    const { objects } = layer();
    objects.preview([{ id: 'chair', pose: null, lift: 0.08 }]);
    expect(positionOf(objects, objectKey('chair'))).toEqual([2, 1.48, -2]);
    objects.setFloor({ ...house(), id: 'again' }, 'light');
    expect(positionOf(objects, objectKey('chair'))).toEqual([2, 1.48, -2]);
    objects.preview([]);
    expect(positionOf(objects, objectKey('chair'))).toEqual([2, 1.4, -2]);
    objects.dispose();
  });

  it('sizes a previewed piece through its size params', () => {
    const made: SceneObjectModelOptions[] = [];
    const objects = new ObjectsLayer<FakeModel>({
      createModelSet: (): SceneObjectModelSet<FakeModel> => recordingSet(made),
      onChange: vi.fn(),
    });
    objects.setFloor(
      { ...house(), objects: [object('desk', { modelId: TABLE.id, elevation: 0 })] },
      'light',
    );
    objects.setModels(objectModelsOf(SCENE_MODELS.parse({ specs: [TABLE], devices: {} })));
    made.length = 0;
    objects.preview([
      { id: 'desk', pose: { ...moved, size: { w: 1.5, d: 0.4, h: null } }, lift: 0 },
    ]);
    expect(made.at(-1)?.params).toEqual({ width: 1.5 });
    objects.preview([]);
    expect(made.at(-1)?.params).toBeUndefined();
    objects.dispose();
  });

  it('changes nothing when no preview was ever set', () => {
    const { objects, changed } = layer();
    const before = positionOf(objects, objectKey('chair'));
    changed.mockClear();
    objects.preview([]);
    expect(changed).not.toHaveBeenCalled();
    expect(positionOf(objects, objectKey('chair'))).toEqual(before);
    objects.dispose();
  });
});
