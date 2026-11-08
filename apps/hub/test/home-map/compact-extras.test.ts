import { HOME_MAP_COMPACT, HOME_MAP_WRITE } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { compactHomeMap } from '../../src/home-map/compact-read';
import { deviceId, houseFloor, mapOf, NOW, objectAt, tenRoomHouse } from './compact-fixtures';

const nameOf = (modelId: string): string => modelId;

const SCAN = {
  file: { hash: 'a'.repeat(64), format: 'ply', bytes: 4096, name: 'house.ply' },
  lod: null,
  transform: { tx: 1.5, ty: -2, tz: 0, yawDeg: 90, scale: 1.25, levelled: true },
  opacity: 0.8,
  points: [{ scan: { x: 0, y: 0, z: 0 }, map: { x: 1, y: 1 } }],
  residualM: 0.04,
  uploadedAt: NOW,
  uploadedBy: 'profile:owner',
} as const;

const DOOR = {
  id: 'door',
  wallId: 'wall-0-0',
  offset: 1,
  width: 0.9,
  kind: 'door',
  sillHeight: 0,
  headHeight: 2.1,
  hinge: 'left',
  swing: 'in',
  contactDeviceId: null,
  lockDeviceId: null,
  origin: { kind: 'hand' },
} as const;

const floorOf = (index: number): ReturnType<typeof compactHomeMap>['floors'][number] => {
  const floor = compactHomeMap(tenRoomHouse(), nameOf).floors[index];
  if (floor === undefined) throw new Error('missing floor');
  return floor;
};

const OPENINGS = z.array(z.looseObject({ id: z.string(), roomIds: z.array(z.string()) }));

const openingOf = (id: string): z.infer<typeof OPENINGS>[number] | undefined =>
  OPENINGS.parse(floorOf(0)['openings']).find((opening) => opening.id === id);

describe('compact home map doors and windows', () => {
  it('names the rooms on both sides of each opening and its sensor bindings', () => {
    expect(openingOf('door-0')).toEqual({
      id: 'door-0',
      kind: 'door',
      wallId: 'wall-0-0',
      offsetM: 1,
      widthM: 0.9,
      roomIds: ['room-0'],
      contactDeviceId: null,
      lockDeviceId: null,
    });
    expect(openingOf('door-5')?.roomIds).toEqual(['room-5', 'room-0']);
  });

  it('shows a bound contact sensor, a lock and how the opening opens', () => {
    const floor = houseFloor(1);
    const door = {
      ...DOOR,
      id: 'win',
      wallId: 'wall-0-1',
      offset: 0.5,
      width: 1.2,
      kind: 'window',
      sillHeight: 0.9,
      headHeight: 2,
      opens: 'tilt_turn',
      contactDeviceId: deviceId(1),
      lockDeviceId: deviceId(2),
    };
    const compact = compactHomeMap(mapOf([{ ...floor, openings: [door] }]), nameOf);
    expect(compact.floors[0]?.['openings']).toEqual([
      {
        id: 'win',
        kind: 'window',
        opens: 'tilt_turn',
        wallId: 'wall-0-1',
        offsetM: 0.5,
        widthM: 1.2,
        roomIds: ['room-0'],
        contactDeviceId: deviceId(1),
        lockDeviceId: deviceId(2),
      },
    ]);
  });

  it('names no room for an opening on a wall that no room touches', () => {
    const floor = houseFloor(1);
    const stray = {
      id: 'stray',
      from: { x: 90, y: 90 },
      to: { x: 95, y: 90 },
      thickness: 0.1,
      height: null,
      kind: 'solid',
      origin: { kind: 'hand' },
    };
    const gate = { ...DOOR, id: 'gate', wallId: 'stray' };
    const compact = compactHomeMap(mapOf([{ ...floor, walls: [stray], openings: [gate] }]), nameOf);
    expect(compact.floors[0]?.['openings']).toMatchObject([{ id: 'gate', roomIds: [] }]);
  });

  it('keeps walls out so the answer stays small', () => {
    expect(floorOf(0)).not.toHaveProperty('walls');
  });
});

describe('compact home map furniture facts and scan', () => {
  it('carries place, size, colour, style, flip and wall mount of a piece', () => {
    const floor = houseFloor(1);
    const shelf = {
      ...objectAt('shelf', 'cat.storage.bookcase', { x: 1.236, y: 0.1 }),
      rotation: 90,
      finish: 'walnut',
      params: { width: 1.4 },
      style: 'open',
      flipped: true,
      wall: { wallId: 'wall-0-0', offset: 1.2, side: 'left' },
      locked: true,
    };
    const compact = compactHomeMap(mapOf([{ ...floor, objects: [shelf] }]), nameOf);
    expect(compact.floors[0]?.objects[0]).toMatchObject({
      id: 'shelf',
      at: { x: 1.24, y: 0.1 },
      rotation: 90,
      finish: 'walnut',
      locked: true,
      params: { width: 1.4 },
      style: 'open',
      flipped: true,
      wall: { wallId: 'wall-0-0', offset: 1.2, side: 'left' },
    });
  });

  it('leaves size, style, flip and wall out of a plain piece', () => {
    const plain = floorOf(0).objects[0];
    expect(plain).toBeDefined();
    for (const key of [
      'params',
      'style',
      'flipped',
      'wall',
      'rotation',
      'elevation',
      'finish',
      'locked',
    ])
      expect(plain).not.toHaveProperty(key);
  });

  it('states there is no scan, or gives its file and transform by numbers', () => {
    expect(compactHomeMap(tenRoomHouse(), nameOf)['scan']).toBeNull();
    const withScan = HOME_MAP_WRITE.parse({ ...tenRoomHouse(), scan: SCAN });
    const compact = compactHomeMap(withScan, nameOf);
    expect(HOME_MAP_COMPACT.parse(compact)).toEqual(compact);
    expect(compact['scan']).toEqual({
      name: 'house.ply',
      format: 'ply',
      bytes: 4096,
      hasLod: false,
      transform: SCAN.transform,
      opacity: 0.8,
      residualM: 0.04,
      alignedPoints: 1,
      uploadedAt: NOW,
    });
  });
});
