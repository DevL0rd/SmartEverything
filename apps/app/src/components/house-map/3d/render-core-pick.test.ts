import { homeMapBoxCorners } from '@smarteverything/domain';
import { Group, Vector3, type PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { floorOf, placement } from '../lighting-fixture';
import type { RenderOpening, RenderPoint, RenderWall } from '../render-scene';
import { metresForPixels, planeAt, screenRay } from './edit/ground';
import type { MeshLayer } from './mesh';
import { NO_INSETS, buildCamera, presetOrbit, type Ndc } from './render-core-orbit';
import {
  deviceBoxesOf,
  viewerInput,
  nodePrism,
  objectBoxesOf,
  openingSegmentsOf,
  pickScene,
  pressPick,
  wallSegmentsOf,
  type ObjectPickBox,
  type PickBox,
  type PickInput,
  type PickSegment,
} from './render-core-pick';
import { DEVICE_BOX_METRES } from './scene-object-boxes';

const frame = { centre: [4, 0, -2] as const, radius: 5 };

const viewport = { width: 400, height: 300, insets: NO_INSETS };

const cameraOf = (preset: 'top' | 'angled'): PerspectiveCamera =>
  buildCamera(presetOrbit(preset, frame, viewport.width / viewport.height), viewport, frame);

const TOP = cameraOf('top');

const ANGLED = cameraOf('angled');

function ndcOf(camera: PerspectiveCamera, at: RenderPoint, height: number): Ndc {
  const point = new Vector3(at.x, height, -at.y).project(camera);
  return { x: point.x, y: point.y };
}

const shifted = (ndc: Ndc, pixels: number): Ndc => ({
  x: ndc.x + (pixels * 2) / viewport.width,
  y: ndc.y,
});

function layer(id: MeshLayer['id'], quads: readonly (readonly Vector3[])[]): MeshLayer {
  const positions = Float32Array.from(quads.flatMap((quad) => quad.flatMap((v) => v.toArray())));
  const indices = Uint32Array.from(
    quads.flatMap((_, q) => [0, 1, 2, 0, 2, 3].map((corner) => q * 4 + corner)),
  );
  return {
    id,
    positions,
    normals: new Float32Array(positions.length),
    colours: new Float32Array(positions.length),
    uvs: new Float32Array((positions.length / 3) * 2),
    indices,
    opacity: 1,
    triangles: quads.length * 2,
  };
}

const FLOOR = layer('floor', [
  [
    new Vector3(-10, 0, 10),
    new Vector3(20, 0, 10),
    new Vector3(20, 0, -20),
    new Vector3(-10, 0, -20),
  ],
]);

const ROOMS = {
  floor: FLOOR,
  walls: null,
  ranges: [{ roomId: 'kitchen', firstTriangle: 0, triangleCount: 2 }],
};

function wallMesh(from: RenderPoint, to: RenderPoint, height: number): MeshLayer {
  return layer('walls', [
    [
      new Vector3(from.x, 0, -from.y),
      new Vector3(to.x, 0, -to.y),
      new Vector3(to.x, height, -to.y),
      new Vector3(from.x, height, -from.y),
    ],
  ]);
}

function boxAt(
  id: string,
  at: RenderPoint,
  size: { readonly w: number; readonly d: number },
  rotation = 0,
): PickBox {
  return { id, ring: homeMapBoxCorners({ at, rotation, ...size }), base: 0, top: 0.75 };
}

function input(patch: Partial<PickInput>): PickInput {
  return { ...viewerInput(ROOMS, viewport, []), ...patch };
}

const segment = (id: string, from: RenderPoint, to: RenderPoint, top = 2.5): PickSegment => ({
  id,
  from,
  to,
  thickness: 0.1,
  base: 0,
  top,
});

const TABLE: ObjectPickBox = {
  ...boxAt('table', { x: 4, y: 2 }, { w: 1.6, d: 0.8 }),
  locked: false,
};

const LAMP: PickBox = {
  id: 'lamp',
  ring: homeMapBoxCorners({ at: { x: 4, y: 2 }, rotation: 0, w: 0.2, d: 0.2 }),
  base: 0.75,
  top: 1.1,
};

const EAST = segment('east', { x: 6, y: 0 }, { x: 6, y: 4 });

const DOOR = segment('door', { x: 6, y: 1.5 }, { x: 6, y: 2.5 }, 2.1);

describe('3D scene pick boxes', () => {
  it('gives every placed device its mount box and adds the sized model box', () => {
    const floor = floorOf([placement('lamp', 2, 1, { mount: 'floor', height: 0.1 })]);
    const [mount] = deviceBoxesOf(floor, () => null);
    const xs = mount?.ring.map((point) => point.x) ?? [];
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(DEVICE_BOX_METRES);
    const model = { ring: mount?.ring ?? [], base: 0, top: 2 };
    expect(deviceBoxesOf(floor, () => model).map((box) => [box.id, box.top])).toEqual([
      ['lamp', mount?.top],
      ['lamp', 2],
    ]);
  });

  it('turns a placed model node into the editor box corners of a rotated, non square piece', () => {
    const node = new Group();
    node.position.set(2, 0.3, -1.5);
    node.rotation.set(0, ((30 + 90) * Math.PI) / 180, 0);
    const prism = nodePrism(node, { width: 2.4, depth: 0.6, height: 0.75 });
    const expected = homeMapBoxCorners({ at: { x: 2, y: 1.5 }, rotation: 30, w: 2.4, d: 0.6 });
    for (const corner of expected) {
      const gap = Math.min(...prism.ring.map((p) => Math.hypot(p.x - corner.x, p.y - corner.y)));
      expect(gap).toBeLessThan(1e-9);
    }
    expect([prism.base, prism.top]).toEqual([0.3, 1.05]);
  });

  it('keeps the drawn box of furniture without a model and carries the lock', () => {
    const [box] = objectBoxesOf(
      [
        {
          id: 'crate',
          modelId: null,
          kind: 'crate',
          label: null,
          finish: null,
          params: { width: 0.5, depth: 0.5 },
          at: { x: 1, y: 1 },
          rotationDeg: 0,
          elevation: 0.2,
          footprint: null,
          height: 0.4,
          locked: true,
          roomId: null,
          wall: null,
        },
      ],
      () => null,
    );
    expect(box).toMatchObject({ id: 'crate', locked: true, base: 0.2 });
    expect(box?.top).toBeCloseTo(0.6);
  });

  it('cuts wall and opening tops to what the cutaway and wall style leave visible', () => {
    const wall = (id: string): RenderWall => ({
      id,
      from: { x: 0, y: 0 },
      to: { x: 4, y: 0 },
      thickness: 0.2,
      height: 2.5,
      kind: 'solid',
      exterior: false,
    });
    const view = { style: 'cutaway' as const, cutIds: new Set(['cut']), lowHeight: 1.2 };
    const walls = wallSegmentsOf([wall('cut'), wall('kept')], { view, cutHeight: 0.3 }, 0);
    expect(walls.map((each) => each.top)).toEqual([0.3, 2.5]);
    const low = wallSegmentsOf(
      [wall('kept')],
      { view: { ...view, style: 'low' }, cutHeight: 0.3 },
      0,
    );
    expect(low[0]?.top).toBe(1.2);
    const opening = (id: string, sill: number, head: number): RenderOpening => ({
      id,
      wallId: 'cut',
      from: { x: 1, y: 0 },
      to: { x: 2, y: 0 },
      kind: 'door',
      sourceKind: null,
      sillHeight: sill,
      headHeight: head,
      hinge: 'left',
      swing: 'in',
      contactDeviceId: null,
      lockDeviceId: null,
      roomIds: [],
    });
    const openings = openingSegmentsOf(
      [opening('door', 0, 2.1), opening('window', 0.9, 2)],
      walls,
      0,
    );
    expect(openings.map((each) => [each.id, each.top, each.thickness])).toEqual([
      ['door', 0.3, 0.2],
    ]);
  });
});

describe('3D scene pick', () => {
  it('picks a device, then furniture, then the room, then nothing', () => {
    const scene = input({ devices: [LAMP], objects: [TABLE] });
    expect(pickScene(TOP, ndcOf(TOP, { x: 4, y: 2 }, 1.1), scene)).toEqual({
      kind: 'device',
      id: 'lamp',
    });
    expect(pickScene(TOP, ndcOf(TOP, { x: 4, y: 2.6 }, 0.75), scene)).toEqual({
      kind: 'object',
      id: 'table',
      locked: false,
    });
    expect(pickScene(TOP, ndcOf(TOP, { x: 2, y: 3 }, 0), scene)).toEqual({
      kind: 'room',
      id: 'kitchen',
    });
    expect(
      pickScene(TOP, ndcOf(TOP, { x: 2, y: 3 }, 0), input({ targets: { ...ROOMS, floor: null } })),
    ).toEqual({
      kind: 'none',
    });
  });

  it('marks a locked piece as locked and still picks it', () => {
    const scene = input({ objects: [{ ...TABLE, locked: true }] });
    expect(pickScene(TOP, ndcOf(TOP, { x: 4, y: 2 }, 0.75), scene)).toEqual({
      kind: 'object',
      id: 'table',
      locked: true,
    });
  });

  it('prefers furniture over a wall and an opening over its wall where they overlap', () => {
    const scene = input({
      objects: [{ ...boxAt('shelf', { x: 5.8, y: 3 }, { w: 0.6, d: 0.3 }), locked: false }],
      openings: [DOOR],
      walls: [EAST],
    });
    expect(pickScene(TOP, ndcOf(TOP, { x: 5.9, y: 3 }, 0.75), scene)).toMatchObject({
      kind: 'object',
      id: 'shelf',
    });
    expect(pickScene(TOP, ndcOf(TOP, { x: 6, y: 2 }, 2.1), scene)).toEqual({
      kind: 'opening',
      id: 'door',
    });
    const wall = pickScene(TOP, ndcOf(TOP, { x: 6, y: 0.2 }, 2.5), scene);
    expect(wall).toMatchObject({ kind: 'wall', id: 'east' });
    expect(wall.kind === 'wall' ? wall.offset : null).toBeCloseTo(0.2, 2);
  });

  it('picks a rotated long piece along its length and not across it, in Top and angled views', () => {
    const turned: ObjectPickBox = {
      ...boxAt('bench', { x: 4, y: 2 }, { w: 0.4, d: 2.4 }, 45),
      locked: false,
    };
    const along = { x: 4 + Math.SQRT1_2, y: 2 + Math.SQRT1_2 };
    const across = { x: 4 - Math.SQRT1_2, y: 2 + Math.SQRT1_2 };
    for (const camera of [TOP, ANGLED]) {
      const scene = input({ objects: [turned] });
      expect(pickScene(camera, ndcOf(camera, along, 0.75), scene).kind).toBe('object');
      expect(pickScene(camera, ndcOf(camera, across, 0.75), scene).kind).toBe('room');
    }
  });

  it('lets a full wall block what is behind it and a cut away wall let it through', () => {
    const cameraAt = { x: ANGLED.position.x, y: -ANGLED.position.z };
    const target = { x: 4, y: 2 };
    const crate: ObjectPickBox = {
      ...boxAt('crate', target, { w: 0.4, d: 0.4 }),
      top: 0.4,
      locked: false,
    };
    const share = (1.5 - 0.4) / (ANGLED.position.y - 0.4);
    const mid = {
      x: target.x + (cameraAt.x - target.x) * share,
      y: target.y + (cameraAt.y - target.y) * share,
    };
    const across = { x: -(cameraAt.y - target.y), y: cameraAt.x - target.x };
    const length = Math.hypot(across.x, across.y);
    const from = { x: mid.x - across.x / length, y: mid.y - across.y / length };
    const to = { x: mid.x + across.x / length, y: mid.y + across.y / length };
    const tap = ndcOf(ANGLED, target, 0.4);
    const full = input({
      targets: { ...ROOMS, walls: wallMesh(from, to, 2.5) },
      objects: [crate],
      walls: [segment('front', from, to, 2.5)],
    });
    expect(pickScene(ANGLED, tap, full)).toMatchObject({ kind: 'wall', id: 'front' });
    const cut = input({
      targets: { ...ROOMS, walls: wallMesh(from, to, 0.3) },
      objects: [crate],
      walls: [segment('front', from, to, 0.3)],
    });
    expect(pickScene(ANGLED, tap, cut)).toMatchObject({ kind: 'object', id: 'crate' });
  });

  it('keeps the wall hit radius a constant number of screen pixels near and far', () => {
    const ahead = ANGLED.getWorldDirection(new Vector3());
    const forward = {
      x: ahead.x / Math.hypot(ahead.x, ahead.z),
      y: -ahead.z / Math.hypot(ahead.x, ahead.z),
    };
    const radii = [-0.6, 0.6].map((y) => {
      const hit = planeAt(screenRay(ANGLED, { x: 0, y }), 0);
      if (hit === null) throw new Error('no ground under the screen');
      const at = { x: hit.world[0], y: -hit.world[2] };
      const wall: PickSegment = {
        ...segment(
          'thin',
          { x: at.x - forward.x * 0.2, y: at.y - forward.y * 0.2 },
          { x: at.x + forward.x * 0.2, y: at.y + forward.y * 0.2 },
          0.01,
        ),
        thickness: 0.02,
      };
      const scene = input({ walls: [wall] });
      const centre = ndcOf(ANGLED, at, 0);
      expect(pickScene(ANGLED, shifted(centre, 12), scene).kind).toBe('wall');
      expect(pickScene(ANGLED, shifted(centre, -12), scene).kind).toBe('wall');
      expect(pickScene(ANGLED, shifted(centre, 34), scene).kind).toBe('room');
      return metresForPixels(ANGLED, hit.world, viewport, 22) ?? 0;
    });
    expect(radii[1]).toBeGreaterThan((radii[0] ?? 0) * 1.2);
  });

  it('says whether a press lands on a given body even when another item wins the pick', () => {
    const scene = input({ devices: [LAMP], objects: [TABLE] });
    const onLamp = ndcOf(TOP, { x: 4, y: 2 }, 1.1);
    expect(pressPick(TOP, onLamp, scene, 'table')).toEqual({
      pick: { kind: 'device', id: 'lamp' },
      onBody: true,
    });
    expect(pressPick(TOP, onLamp, scene, 'sofa').onBody).toBe(false);
    expect(pressPick(TOP, onLamp, scene, null).onBody).toBe(false);
    expect(pressPick(TOP, ndcOf(TOP, { x: 2, y: 3 }, 0), scene, 'kitchen').onBody).toBe(true);
  });
});
