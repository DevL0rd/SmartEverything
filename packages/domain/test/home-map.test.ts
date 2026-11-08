import { describe, expect, it } from 'vitest';
import { HOME_MAP, HOME_MAP_WRITE, type HomeMap } from '../src/home-map';
import { HOME_MAP_ANNOTATION, HOME_MAP_ROOM_WRITE } from '../src/home-map-elements';
import { HOME_MAP_PLACEMENT, HOME_MAP_PLACEMENT_WRITE } from '../src/home-map-placement';

const DEVICE = '3f2b8f9a-6d3c-4d6e-8d4e-0a1b2c3d4e5f';
const ORIGIN_HAND = { kind: 'hand' };
const SQUARE = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 3 },
  { x: 0, y: 3 },
];

const MAP = {
  id: 'home',
  schemaVersion: 1,
  revision: 3,
  name: 'House',
  north: 15,
  updatedAt: '2026-10-25T10:00:00.000Z',
  sources: [
    {
      id: 'src-1',
      kind: 'xiaomi_vacuum',
      deviceId: DEVICE,
      floorId: 'floor-1',
      transform: { rotationDeg: 90, tx: 1, ty: -2, mirrored: false },
      frame: { uid: 'map-1', name: null, boundsSignature: 'b1' },
      lastVersion: 'v1',
      lastImportedAt: '2026-10-25T09:00:00.000Z',
      base: { rooms: [], walls: [], openings: [] },
      tombstones: ['wall:a'],
    },
  ],
  notices: [
    {
      id: 'n-1',
      kind: 'source_changed',
      elementId: 'room-1',
      detail: 'Two rooms changed',
      createdAt: '2026-10-25T09:30:00.000Z',
    },
  ],
  floors: [
    {
      id: 'floor-1',
      name: 'Ground',
      level: 0,
      elevation: 0,
      rooms: [
        {
          id: 'room-1',
          name: 'Kitchen',
          homeRoomId: DEVICE,
          polygon: { outer: SQUARE, holes: [] },
          labelAt: { x: 2, y: 1.5 },
          colourSlot: 3,
          floorMaterial: { kind: 'wood', variant: 'oak', tint: null },
          wallPaint: '#ffffff',
          ceilingHeight: null,
          origin: { kind: 'source', sourceId: 'src-1', ref: 'room:7', overridden: ['name'] },
        },
      ],
      walls: [
        {
          id: 'wall-1',
          from: { x: 0, y: 0 },
          to: { x: 4, y: 0 },
          thickness: 0.1,
          height: null,
          kind: 'solid',
          origin: ORIGIN_HAND,
        },
      ],
      openings: [
        {
          id: 'op-1',
          wallId: 'wall-1',
          offset: 1,
          width: 0.9,
          kind: 'door',
          sillHeight: 0,
          headHeight: 2.1,
          hinge: 'left',
          swing: 'in',
          contactDeviceId: null,
          lockDeviceId: DEVICE,
          origin: ORIGIN_HAND,
        },
      ],
      objects: [
        {
          id: 'obj-1',
          modelId: 'cat.future.hologram_table',
          finish: null,
          params: { width: 1.2, depth: 0.8 },
          at: { x: 1, y: 1 },
          rotation: 45,
          elevation: 0,
          label: 'Table',
          locked: false,
          origin: ORIGIN_HAND,
        },
      ],
      placements: [
        {
          deviceId: DEVICE,
          floorId: 'floor-1',
          at: { x: 2, y: 2 },
          rotation: 0,
          height: 2.4,
          tilt: 0,
          mount: 'ceiling',
          auto: true,
          camera: {
            hfovDeg: 100,
            vfovDeg: 60,
            rangeM: 8,
            fovSource: 'estimated',
            pan: { mode: 'presets', yawDeg: 10, presets: { home: { yawDeg: 0, tiltDeg: -10 } } },
            showCone: true,
          },
        },
      ],
      annotations: [
        { id: 'a-1', kind: 'pin', at: { x: 1, y: 1 }, text: 'Leak' },
        { id: 'a-2', kind: 'measure', from: { x: 0, y: 0 }, to: { x: 4, y: 0 }, text: '4 m' },
      ],
    },
  ],
};

const map = (): typeof MAP => structuredClone(MAP);

describe('home map reader', () => {
  it('parses a full document and applies the default ceiling height', () => {
    const parsed = HOME_MAP.parse(map());
    expect(parsed.floors[0]?.ceilingHeight).toBe(2.6);
    expect(parsed.floors[0]?.rooms[0]?.origin).toEqual({
      kind: 'source',
      sourceId: 'src-1',
      ref: 'room:7',
      overridden: ['name'],
    });
  });

  it('keeps unknown fields at every level', () => {
    const base = map();
    const floor = base.floors[0];
    const room = floor?.rooms[0];
    const placement = floor?.placements[0];
    const doc = {
      ...base,
      futureTop: { a: 1 },
      floors: [
        {
          ...floor,
          underlay: { image: 'x' },
          rooms: [{ ...room, sunlight: 0.4 }],
          placements: [
            {
              ...placement,
              camera: {
                ...placement?.camera,
                pan: { ...placement?.camera.pan, smoothing: 'high' },
              },
            },
          ],
        },
      ],
    };
    const parsed = HOME_MAP.parse(doc);
    expect(parsed).toMatchObject({ futureTop: { a: 1 } });
    expect(parsed.floors[0]).toMatchObject({ underlay: { image: 'x' } });
    expect(parsed.floors[0]?.rooms[0]).toMatchObject({ sunlight: 0.4 });
    expect(parsed.floors[0]?.placements[0]?.camera?.pan).toMatchObject({ smoothing: 'high' });
  });

  it('accepts and keeps model ids the build does not know', () => {
    const parsed = HOME_MAP.parse(map());
    expect(parsed.floors[0]?.objects[0]?.modelId).toBe('cat.future.hologram_table');
    expect(parsed.floors[0]?.objects[0]?.params).toEqual({ width: 1.2, depth: 0.8 });
  });

  it('rejects a document of another schema version and an empty model id', () => {
    expect(HOME_MAP.safeParse({ ...map(), schemaVersion: 2 }).success).toBe(false);
    const base = map();
    const floor = base.floors[0];
    const object = floor?.objects[0];
    const doc = { ...base, floors: [{ ...floor, objects: [{ ...object, modelId: '' }] }] };
    expect(HOME_MAP.safeParse(doc).success).toBe(false);
  });

  it('rejects malformed elements through the element readers', () => {
    expect(HOME_MAP_PLACEMENT.safeParse({ nope: true }).success).toBe(false);
    expect(HOME_MAP_ANNOTATION.safeParse({ id: 'a', kind: 'measure', text: '' }).success).toBe(
      false,
    );
  });
});

describe('home map writer', () => {
  it('round trips a full document without change', () => {
    const doc: HomeMap = HOME_MAP_WRITE.parse(HOME_MAP.parse(map()));
    expect(HOME_MAP_WRITE.parse(doc)).toEqual(doc);
  });

  it('rejects unknown fields at the top and nested', () => {
    expect(HOME_MAP_WRITE.safeParse({ ...HOME_MAP.parse(map()), extra: 1 }).success).toBe(false);
    const doc = HOME_MAP.parse(map());
    const room = doc.floors[0]?.rooms[0];
    expect(HOME_MAP_ROOM_WRITE.safeParse({ ...room, extra: 1 }).success).toBe(false);
    expect(HOME_MAP_ROOM_WRITE.safeParse(room).success).toBe(true);
  });

  it('has no model field on a placement', () => {
    const placement = HOME_MAP.parse(map()).floors[0]?.placements[0];
    expect(Object.keys(HOME_MAP_PLACEMENT_WRITE.shape)).not.toContain('model');
    expect(Object.keys(HOME_MAP_PLACEMENT_WRITE.shape)).not.toContain('modelId');
    expect(HOME_MAP_PLACEMENT_WRITE.safeParse({ ...placement, modelId: 'cat.x' }).success).toBe(
      false,
    );
  });

  it('bounds colour slots to 1 to 8 and mounts to the known set', () => {
    const doc = HOME_MAP.parse(map());
    const room = doc.floors[0]?.rooms[0];
    expect(HOME_MAP_ROOM_WRITE.safeParse({ ...room, colourSlot: 9 }).success).toBe(false);
    expect(HOME_MAP_ROOM_WRITE.safeParse({ ...room, colourSlot: 0 }).success).toBe(false);
    const placement = doc.floors[0]?.placements[0];
    expect(HOME_MAP_PLACEMENT_WRITE.safeParse({ ...placement, mount: 'shelf' }).success).toBe(
      false,
    );
  });
});
