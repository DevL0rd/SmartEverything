import { HOME_MAP_WALL_ID } from '@smarteverything/domain';
import { BufferAttribute, BufferGeometry, Line, LineDashedMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { placement } from '../lighting-fixture';
import type { RenderObject, RenderWall } from '../render-scene';
import { CUT_HEIGHT_METRES } from './cutaway';
import { OVERLAY_LOOKS } from './overlay-kit';
import {
  buildWallStems,
  mountedPose,
  STEM_M,
  wallCutOf,
  wallFacePose,
  wallMountItems,
  wallMountKey,
  type WallMountItem,
} from './wall-mounts';

const wall = (id: string, extra: Partial<RenderWall> = {}): RenderWall => ({
  id,
  from: { x: 0, y: 0 },
  to: { x: 4, y: 0 },
  thickness: 0.2,
  height: 2.5,
  kind: 'solid',
  exterior: false,
  ...extra,
});

const AC: WallMountItem = {
  id: 'ac',
  wallId: 'north',
  offset: 1,
  side: 'left',
  height: 2.15,
  device: true,
};

const SHELF: WallMountItem = { ...AC, id: 'shelf', side: 'right', height: 1.6, device: false };

describe('3d wall mounts', () => {
  it('puts a wall object on the face of the side it faces, turned into the room', () => {
    const left = wallFacePose(wall('north'), AC);
    expect(left?.at).toEqual({ x: 1, y: 0.1 });
    expect(left?.facingRad).toBeCloseTo(Math.PI / 2);
    const right = wallFacePose(wall('north'), { offset: 9, side: 'right' });
    expect(right?.at.x).toBeCloseTo(4);
    expect(right?.at.y).toBeCloseTo(-0.1);
    expect(right?.facingRad).toBeCloseTo(-Math.PI / 2);
    expect(wallFacePose(wall('dot', { to: { x: 0, y: 0 } }), AC)).toBeNull();
  });

  it('knows which walls are cut and the height of their top for every wall style', () => {
    const walls = [wall('north'), wall('south'), wall('short', { height: 1 })];
    const none = new Set<string>();
    expect(wallCutOf(walls, { style: 'full', cutIds: none, lowHeight: 1.2 }).size).toBe(0);
    const low = wallCutOf(walls, { style: 'low', cutIds: none, lowHeight: 1.2 });
    expect([...low]).toEqual([
      ['north', 1.2],
      ['south', 1.2],
    ]);
    const cut = wallCutOf(walls, { style: 'cutaway', cutIds: new Set(['south']), lowHeight: 1.2 });
    expect([...cut]).toEqual([['south', CUT_HEIGHT_METRES]]);
    const lowCut = wallCutOf(walls, { style: 'low', cutIds: new Set(['south']), lowHeight: 1.2 });
    expect([...lowCut]).toEqual([
      ['north', 1.2],
      ['south', CUT_HEIGHT_METRES],
    ]);
  });

  it('raises a dotted stem from the cut wall top to the object, and none on a full wall', () => {
    const walls = [wall('north')];
    const look = OVERLAY_LOOKS.light;
    const cut = new Map([['north', 1.2]]);
    const built = buildWallStems({ walls, items: [AC, SHELF], cut, y: 3, look });
    expect(built.map((item) => item.name)).toEqual([
      'stem:ac',
      'stem-foot:ac',
      'stem:shelf',
      'stem-foot:shelf',
    ]);
    const [line, foot] = built;
    if (!(line instanceof Line)) throw new Error('no stem line');
    expect(line.material).toBeInstanceOf(LineDashedMaterial);
    const geometry: unknown = line.geometry;
    if (!(geometry instanceof BufferGeometry)) throw new Error('no stem geometry');
    const ys: unknown = geometry.getAttribute('position');
    if (!(ys instanceof BufferAttribute)) throw new Error('no stem points');
    expect(ys.getY(0)).toBeCloseTo(3 + 1.2);
    expect(ys.getY(1)).toBeCloseTo(3 + AC.height - STEM_M.clear);
    expect(ys.getX(0)).toBeCloseTo(1);
    expect(ys.getZ(0)).toBeCloseTo(-0.1);
    expect(foot?.position.y).toBeCloseTo(4.2);
    expect(buildWallStems({ walls, items: [AC], cut: new Map(), y: 0, look })).toHaveLength(0);
    const tall = new Map([['north', 2.2]]);
    expect(buildWallStems({ walls, items: [AC], cut: tall, y: 0, look })).toHaveLength(0);
  });

  it('keys the stems by the items and the cut of their own walls only', () => {
    const cut = new Map([['north', 0.3]]);
    expect(wallMountKey([AC], cut)).toBe(wallMountKey([AC], new Map([...cut, ['east', 0.3]])));
    expect(wallMountKey([AC], cut)).not.toBe(wallMountKey([AC], new Map()));
  });

  it('reads wall items from the wall attachments of placements and objects, at their own height', () => {
    const shelf: RenderObject = {
      id: 'shelf',
      modelId: null,
      kind: 'cat.shelf',
      label: null,
      finish: null,
      params: {},
      at: { x: 1, y: 0 },
      rotationDeg: 0,
      elevation: 1.6,
      footprint: null,
      height: null,
      locked: false,
      roomId: null,
      wall: { wallId: HOME_MAP_WALL_ID.parse('north'), offset: 1, side: 'right' },
    };
    const ac = placement('ac', 1, 0, { height: 2.15, mount: 'wall' });
    const items = wallMountItems({
      placements: [
        placement('lamp', 2, 2),
        { ...ac, wall: { wallId: HOME_MAP_WALL_ID.parse('north'), offset: 1, side: 'left' } },
      ],
      objects: [shelf, { ...shelf, id: 'sofa', wall: null }],
    });
    expect(items).toEqual([AC, SHELF]);
  });
});

describe('mountedPose', () => {
  const walls = new Map([['north', wall('north')]]);
  const attached = (side: 'left' | 'right'): Parameters<typeof mountedPose>[1] => ({
    at: { x: 9, y: 9 },
    rotationDeg: 33,
    wall: { wallId: HOME_MAP_WALL_ID.parse('north'), offset: 1, side },
  });

  it('puts a wall item on the wall face with its front towards the room side', () => {
    expect(mountedPose(walls, attached('left'))).toEqual({
      at: { x: 1, y: 0.1 },
      rotationDeg: 90,
      normal: { x: -0, y: 1 },
    });
    const right = mountedPose(walls, attached('right'));
    expect(right.at).toEqual({ x: 1, y: -0.1 });
    expect(right.rotationDeg).toBeCloseTo(-90);
  });

  it('keeps the placed point and rotation off the wall or for a missing wall', () => {
    const free = { at: { x: 2, y: 3 }, rotationDeg: 45, wall: null };
    expect(mountedPose(walls, free)).toEqual({ at: free.at, rotationDeg: 45, normal: null });
    expect(mountedPose(new Map(), attached('left'))).toEqual({
      at: { x: 9, y: 9 },
      rotationDeg: 33,
      normal: null,
    });
  });
});
