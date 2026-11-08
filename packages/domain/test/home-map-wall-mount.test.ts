import { describe, expect, it } from 'vitest';
import * as domain from '../src/index';
import { HOME_MAP_OBJECT, HOME_MAP_OBJECT_WRITE, HOME_MAP_WALL_ID } from '../src/home-map-elements';
import { HOME_MAP_PLACEMENT, HOME_MAP_PLACEMENT_WRITE } from '../src/home-map-placement';
import {
  homeMapFollowWall,
  homeMapMountOnWall,
  homeMapWallPose,
  type HomeMapMountRoom,
  type HomeMapMountWall,
} from '../src/home-map-wall-mount';

const wall = (id: string, from: [number, number], to: [number, number]): HomeMapMountWall => ({
  id: HOME_MAP_WALL_ID.parse(id),
  from: { x: from[0], y: from[1] },
  to: { x: to[0], y: to[1] },
  thickness: 0.2,
});

const room = (x0: number, y0: number, x1: number, y1: number): HomeMapMountRoom => ({
  polygon: {
    outer: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
    holes: [],
  },
});

const SOUTH = wall('south', [0, 0], [4, 0]);
const ABOVE = room(0, 0, 4, 3);
const BELOW = room(0, -3, 4, 0);
const ROOMS = [ABOVE, BELOW];

describe('wall snap', () => {
  it('snaps to the nearest wall with its offset and the side the point is on', () => {
    const mount = homeMapMountOnWall([SOUTH, wall('east', [4, 0], [4, 3])], ROOMS, {
      x: 1.5,
      y: 0.8,
    });
    expect(mount?.wall.id).toBe('south');
    expect(mount?.attachment).toEqual({ wallId: 'south', offset: 1.5, side: 'left' });
    expect(mount?.at.x).toBeCloseTo(1.5);
    expect(mount?.at.y).toBeCloseTo(0.1);
    expect(mount?.rotation).toBeCloseTo(90);
    expect(mount?.room).toBe(ABOVE);
  });

  it('faces the other way for a point on the other side', () => {
    const other = homeMapMountOnWall([SOUTH], ROOMS, { x: 2.2, y: -0.7 });
    expect(other?.attachment).toEqual({ wallId: 'south', offset: 2.2, side: 'right' });
    expect(other?.at.y).toBeCloseTo(-0.1);
    expect(other?.rotation).toBeCloseTo(270);
    expect(other?.room).toBe(BELOW);
  });

  it('clamps the offset to the wall and picks the wall by distance', () => {
    const mount = homeMapMountOnWall([SOUTH, wall('north', [0, 3], [4, 3])], ROOMS, {
      x: 6,
      y: 2.5,
    });
    expect(mount?.wall.id).toBe('north');
    expect(mount?.attachment.offset).toBe(4);
    expect(mount?.attachment.side).toBe('right');
  });

  it('faces the room when the point is exactly on the wall line', () => {
    const into = homeMapMountOnWall([SOUTH], [ABOVE], { x: 2, y: 0 });
    expect(into?.attachment.side).toBe('left');
    const away = homeMapMountOnWall([SOUTH], [BELOW], { x: 2, y: 0 });
    expect(away?.attachment.side).toBe('right');
  });

  it('finds nothing with no usable wall', () => {
    expect(homeMapMountOnWall([], ROOMS, { x: 1, y: 1 })).toBeNull();
    expect(homeMapMountOnWall([wall('dot', [1, 1], [1, 1])], ROOMS, { x: 1, y: 1 })).toBeNull();
  });
});

describe('attachment follows its wall', () => {
  it('moves with the wall and keeps its place proportionally when the wall changes length', () => {
    const attachment = {
      wallId: HOME_MAP_WALL_ID.parse('south'),
      offset: 1,
      side: 'left',
    } as const;
    const longer = wall('south', [0, 0], [8, 0]);
    const followed = homeMapFollowWall(attachment, SOUTH, longer);
    expect(followed).toEqual({ ...attachment, offset: 2 });
    const shorter = homeMapFollowWall(followed, longer, wall('south', [0, 0], [2, 0]));
    expect(shorter.offset).toBeCloseTo(0.5);
  });

  it('stays on the wall and ignores a pure move', () => {
    const attachment = {
      wallId: HOME_MAP_WALL_ID.parse('south'),
      offset: 3.9,
      side: 'right',
    } as const;
    const moved = wall('south', [5, 5], [9, 5]);
    expect(homeMapFollowWall(attachment, SOUTH, moved).offset).toBeCloseTo(3.9);
    const pose = homeMapWallPose(moved, homeMapFollowWall(attachment, SOUTH, moved));
    expect(pose?.at.x).toBeCloseTo(8.9);
    expect(pose?.at.y).toBeCloseTo(4.9);
    const collapsed = wall('south', [5, 5], [5, 5]);
    expect(homeMapFollowWall(attachment, SOUTH, collapsed).offset).toBe(0);
    expect(homeMapWallPose(collapsed, attachment)).toBeNull();
    expect(
      homeMapFollowWall({ ...attachment, offset: 9 }, SOUTH, wall('south', [0, 0], [8, 0])).offset,
    ).toBe(8);
  });
});

describe('wall attachment schemas', () => {
  const object = {
    id: 'obj-1',
    modelId: 'cat.shelf',
    finish: null,
    params: {},
    at: { x: 1, y: 1 },
    rotation: 0,
    elevation: 1.6,
    label: null,
    locked: false,
    origin: { kind: 'hand' },
  };
  const placement = {
    deviceId: '3f2b8f9a-6d3c-4d6e-8d4e-0a1b2c3d4e5f',
    floorId: 'floor-1',
    at: { x: 1, y: 1 },
    rotation: 0,
    height: 2.15,
    tilt: 0,
    mount: 'wall',
    auto: false,
    camera: null,
  };
  const wallRef = { wallId: 'south', offset: 1.5, side: 'left' };

  it('keeps style, flipped and wall optional on objects and validates them', () => {
    expect(HOME_MAP_OBJECT_WRITE.safeParse(object).success).toBe(true);
    const full = HOME_MAP_OBJECT_WRITE.parse({
      ...object,
      style: 'slim',
      flipped: true,
      wall: wallRef,
    });
    expect(full).toMatchObject({ style: 'slim', flipped: true, wall: wallRef });
    expect(
      HOME_MAP_OBJECT_WRITE.safeParse({ ...object, wall: { ...wallRef, side: 'up' } }).success,
    ).toBe(false);
    expect(
      HOME_MAP_OBJECT_WRITE.safeParse({ ...object, wall: { ...wallRef, extra: 1 } }).success,
    ).toBe(false);
    expect(HOME_MAP_OBJECT.parse({ ...object, wall: { ...wallRef, extra: 1 } }).wall).toMatchObject(
      wallRef,
    );
  });

  it('keeps wall optional on placements', () => {
    expect(HOME_MAP_PLACEMENT_WRITE.safeParse(placement).success).toBe(true);
    expect(HOME_MAP_PLACEMENT_WRITE.parse({ ...placement, wall: wallRef }).wall).toEqual(wallRef);
    expect(HOME_MAP_PLACEMENT.parse({ ...placement, wall: wallRef, extra: 1 }).wall).toEqual(
      wallRef,
    );
  });

  it('exports the module through the domain index', () => {
    expect(domain.homeMapMountOnWall).toBe(homeMapMountOnWall);
  });
});
