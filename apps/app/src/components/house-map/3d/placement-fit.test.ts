import {
  HOME_MAP_WALL_ID,
  homeMapBoxCorners,
  homeMapObjectBox,
  homeMapWallPose,
  modelSizeParams,
  type HomeMapVec,
  type ModelSpec,
  type ModelSpecAnchor,
} from '@smarteverything/domain';
import { Group, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { sizedModel } from '../../models/three/sized-model';
import type { RenderObject, RenderPlacement, RenderWall } from '../render-scene';
import {
  buildSceneObjects,
  deviceKey,
  objectKey,
  type SceneObjectModel,
  type SceneObjectModelSet,
  type SceneObjectsFloor,
} from './scene-objects';

const VIEW = { yaw: 30, pitch: 18, fov: 28, padding: 0.1 } as const;

const ROTATIONS = [0, 30, 45, 90, 180, 270, 333] as const;

const WALL: RenderWall = {
  id: 'north',
  from: { x: -1, y: 4 },
  to: { x: 7, y: 1 },
  thickness: 0.2,
  height: 2.6,
  kind: 'solid',
  exterior: false,
};

interface Shape {
  readonly name: string;
  readonly footprint: ModelSpec['footprint'];
  readonly params?: ModelSpec['params'];
  readonly size?: ModelSpec['size'];
  readonly anchors?: readonly ModelSpecAnchor[];
  readonly given: Readonly<Record<string, number>>;
}

const back = (depth: number): ModelSpecAnchor => ({
  kind: 'mount',
  id: 'wall',
  mount: 'wall',
  position: [0, 0, -depth / 2],
});

const SHAPES: readonly Shape[] = [
  { name: 'square', footprint: { width: 0.5, depth: 0.5, height: 0.8 }, given: {} },
  { name: 'long table', footprint: { width: 2.4, depth: 0.6, height: 0.75 }, given: {} },
  { name: 'deep cabinet', footprint: { width: 0.4, depth: 1.6, height: 2 }, given: {} },
  {
    name: 'sized desk',
    footprint: { width: 1.4, depth: 0.7, height: 0.74 },
    params: {
      width: { min: 1, max: 2, default: 1.4, unit: 'm' },
      depth: { min: 0.5, max: 0.9, default: 0.7, unit: 'm' },
    },
    size: {
      width: { param: 'width', extra: 0, resizes: true },
      depth: { param: 'depth', extra: 0, resizes: true },
    },
    anchors: [
      { kind: 'mount', id: 'floor', mount: 'floor', position: [0, 0, 0] },
      back(0.7),
      { kind: 'mount', id: 'surface', mount: 'desk', position: [0, 0.74, 0] },
    ],
    given: { width: 1.9, depth: 0.55 },
  },
  {
    name: 'long bench',
    footprint: { width: 1.2, depth: 0.4, height: 0.45 },
    params: { length: { min: 0.8, max: 3, default: 1.2, unit: 'm' } },
    size: { width: { param: 'length', extra: 0, resizes: true } },
    given: { length: 2.6 },
  },
  {
    name: 'fringed mat',
    footprint: { width: 2.52, depth: 1.7, height: 0.02 },
    params: { width: { min: 1.2, max: 4, default: 2.4, unit: 'm' } },
    size: { width: { param: 'width', extra: 0.12, resizes: true } },
    given: { width: 3.1 },
  },
  {
    name: 'long mat',
    footprint: { width: 0.6, depth: 1.8, height: 0.01 },
    params: { length: { min: 1.2, max: 2.4, default: 1.8, unit: 'm' } },
    size: { depth: { param: 'length', extra: 0, resizes: true } },
    given: { length: 2.2 },
  },
  {
    name: 'wall shelf',
    footprint: { width: 1.1, depth: 0.25, height: 0.3 },
    anchors: [back(0.25)],
    given: {},
  },
];

function specOf(shape: Shape): ModelSpec {
  const { width, depth, height } = shape.footprint;
  return {
    schema: 1,
    id: `cat.test.${shape.name.replace(' ', '-')}`,
    version: '1.0.0',
    title: shape.name,
    category: 'furniture',
    footprint: shape.footprint,
    framing: { tile: VIEW, card: VIEW, hero: VIEW },
    materials: { body: { finish: 'matte-white' } },
    parts: [
      {
        id: 'body',
        geometry: { type: 'roundedBox', width, height, depth, radius: 0.01 },
        material: 'body',
      },
    ],
    ...(shape.params === undefined ? {} : { params: shape.params }),
    ...(shape.size === undefined ? {} : { size: shape.size }),
    ...(shape.anchors === undefined ? {} : { anchors: [...shape.anchors] }),
  };
}

function object(spec: ModelSpec, patch: Partial<RenderObject>): RenderObject {
  return {
    id: 'piece',
    modelId: spec.id,
    kind: spec.id,
    label: null,
    finish: null,
    params: {},
    at: { x: 2, y: 1.5 },
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

function placement(patch: Partial<RenderPlacement>): RenderPlacement {
  return {
    deviceId: 'gadget',
    name: null,
    kind: 'gadget',
    at: { x: -1, y: 3 },
    rotationDeg: 0,
    height: 0,
    tiltDeg: 0,
    mount: 'floor',
    auto: false,
    camera: null,
    roomId: null,
    wall: null,
    ...patch,
  };
}

const idle = (): void => undefined;

const MOUNT_WALL = { ...WALL, id: HOME_MAP_WALL_ID.parse(WALL.id) };

function placedNode(
  spec: ModelSpec,
  floor: Partial<SceneObjectsFloor>,
  key: string,
): Group | undefined {
  const scene = buildSceneObjects<SceneObjectModel>({
    createModelSet: (): SceneObjectModelSet<SceneObjectModel> => ({
      object3d: new Group(),
      createSceneModel: (): SceneObjectModel => ({ object3d: new Group(), dispose: idle }),
      updateInstances: idle,
      dispose: idle,
    }),
    floors: [{ id: 'g', elevation: 0, objects: [], placements: [], walls: [WALL], ...floor }],
    specOf: () => spec,
    deviceSpecOf: () => spec,
    theme: 'light',
  });
  scene.root.updateMatrixWorld(true);
  const node = scene.item(key)?.model?.object3d;
  return node instanceof Group ? node : undefined;
}

function modelCorners(
  node: Group,
  spec: ModelSpec,
  given: Readonly<Record<string, number>>,
): readonly HomeMapVec[] {
  const { width, depth } = sizedModel(spec, given).size;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx = 0, sz = 0]) => {
    const world = new Vector3((sx * width) / 2, 0, (sz * depth) / 2).applyMatrix4(node.matrixWorld);
    return { x: world.x, y: -world.z };
  });
}

function planCorners(
  spec: ModelSpec,
  at: HomeMapVec,
  rotation: number,
  params: Readonly<Record<string, number>>,
): readonly HomeMapVec[] {
  return homeMapBoxCorners(
    homeMapObjectBox(
      {
        id: 'piece',
        modelId: spec.id,
        at,
        rotation,
        params,
        footprint: { w: spec.footprint.width, d: spec.footprint.depth },
        locked: false,
      },
      { sizeParams: modelSizeParams(spec), presets: [] },
    ),
  );
}

function expectSameBox(actual: readonly HomeMapVec[], expected: readonly HomeMapVec[]): void {
  expect(actual).toHaveLength(expected.length);
  for (const corner of expected) {
    const nearest = Math.min(
      ...actual.map((point) => Math.hypot(point.x - corner.x, point.y - corner.y)),
    );
    expect(nearest).toBeLessThan(1e-9);
  }
}

function frontOf(node: Group): HomeMapVec {
  const ahead = new Vector3(0, 0, 1).transformDirection(node.matrixWorld);
  return { x: ahead.x, y: -ahead.z };
}

const turned = (deg: number): HomeMapVec => ({
  x: Math.cos((deg * Math.PI) / 180),
  y: Math.sin((deg * Math.PI) / 180),
});

const ATTACHMENTS = [
  { wallId: HOME_MAP_WALL_ID.parse('north'), offset: 2.5, side: 'left' },
  { wallId: HOME_MAP_WALL_ID.parse('north'), offset: 6, side: 'right' },
] as const;

describe('3D placement matches the 2D outline', () => {
  for (const shape of SHAPES) {
    const spec = specOf(shape);
    for (const rotation of ROTATIONS) {
      it(`fits a free ${shape.name} turned ${String(rotation)} degrees`, () => {
        const item = object(spec, { rotationDeg: rotation, params: shape.given, elevation: 0.3 });
        const node = placedNode(spec, { objects: [item] }, objectKey(item.id));
        expect(node).toBeDefined();
        if (node === undefined) return;
        expectSameBox(
          modelCorners(node, spec, shape.given),
          planCorners(spec, item.at, rotation, shape.given),
        );
        const front = frontOf(node);
        expect(front.x).toBeCloseTo(turned(rotation).x, 9);
        expect(front.y).toBeCloseTo(turned(rotation).y, 9);
      });
    }

    for (const attachment of ATTACHMENTS) {
      it(`hangs a ${shape.name} on the ${attachment.side} face of a slanted wall`, () => {
        const pose = homeMapWallPose(MOUNT_WALL, attachment);
        expect(pose).not.toBeNull();
        if (pose === null) return;
        const half = spec.footprint.depth / 2;
        const at = { x: pose.at.x + pose.normal.x * half, y: pose.at.y + pose.normal.y * half };
        const item = object(spec, { at, rotationDeg: pose.rotation, wall: attachment });
        const node = placedNode(spec, { objects: [item] }, objectKey(item.id));
        expect(node).toBeDefined();
        if (node === undefined) return;
        const sized = sizedModel(spec, {}).size;
        const centre = {
          x: pose.at.x + (pose.normal.x * sized.depth) / 2,
          y: pose.at.y + (pose.normal.y * sized.depth) / 2,
        };
        expectSameBox(modelCorners(node, spec, {}), planCorners(spec, centre, pose.rotation, {}));
        expectSameBox(modelCorners(node, spec, {}), planCorners(spec, at, item.rotationDeg, {}));
      });
    }

    for (const rotation of ROTATIONS) {
      it(`stands a ${shape.name} device turned ${String(rotation)} degrees on its plan box`, () => {
        const item = placement({ rotationDeg: rotation });
        const node = placedNode(spec, { placements: [item] }, deviceKey(item.deviceId));
        expect(node).toBeDefined();
        if (node === undefined) return;
        const box = planCorners(spec, item.at, rotation, {});
        const anchor = (spec.anchors ?? []).find(
          (each) => each.kind === 'mount' && each.mount === 'floor',
        );
        if (anchor === undefined && spec.anchors !== undefined) return;
        expectSameBox(modelCorners(node, spec, {}), box);
      });
    }

    it(`puts a ${shape.name} device on a wall with its back on the face`, () => {
      const [attachment] = ATTACHMENTS;
      const pose = homeMapWallPose(MOUNT_WALL, attachment);
      expect(pose).not.toBeNull();
      if (pose === null) return;
      const item = placement({
        at: pose.at,
        rotationDeg: pose.rotation,
        height: 1.4,
        mount: 'wall',
        wall: attachment,
      });
      const node = placedNode(spec, { placements: [item] }, deviceKey(item.deviceId));
      expect(node).toBeDefined();
      if (node === undefined) return;
      const anchors = (spec.anchors ?? []).filter((each) => each.kind === 'mount');
      if (anchors.length > 0 && !anchors.some((each) => each.mount === 'wall')) return;
      const half = spec.footprint.depth / 2;
      const centre = { x: pose.at.x + pose.normal.x * half, y: pose.at.y + pose.normal.y * half };
      expectSameBox(modelCorners(node, spec, {}), planCorners(spec, centre, pose.rotation, {}));
    });
  }

  it('hangs a ceiling device with its top on the ceiling height', () => {
    const spec = specOf({
      name: 'pendant',
      footprint: { width: 0.6, depth: 0.2, height: 0.5 },
      anchors: [{ kind: 'mount', id: 'ceiling', mount: 'ceiling', position: [0, 0.5, 0] }],
      given: {},
    });
    const item = placement({ rotationDeg: 45, height: 2.6, mount: 'ceiling' });
    const node = placedNode(spec, { placements: [item] }, deviceKey(item.deviceId));
    expect(node).toBeDefined();
    if (node === undefined) return;
    expectSameBox(modelCorners(node, spec, {}), planCorners(spec, item.at, 45, {}));
    expect(new Vector3(0, 0.5, 0).applyMatrix4(node.matrixWorld).y).toBeCloseTo(2.6, 9);
  });

  it('moves the wall back of a resized piece with its depth', () => {
    const spec = specOf(SHAPES[3] ?? SHAPES[0]!);
    const [attachment] = ATTACHMENTS;
    const pose = homeMapWallPose(MOUNT_WALL, attachment);
    if (pose === null) throw new Error('the wall has no face');
    const given = { width: 1.2, depth: 0.9 };
    const item = object(spec, { rotationDeg: pose.rotation, params: given, wall: attachment });
    const node = placedNode(spec, { objects: [item] }, objectKey(item.id));
    if (node === undefined) throw new Error('nothing was placed');
    const centre = { x: pose.at.x + pose.normal.x * 0.45, y: pose.at.y + pose.normal.y * 0.45 };
    expectSameBox(modelCorners(node, spec, given), planCorners(spec, centre, pose.rotation, given));
  });
});
