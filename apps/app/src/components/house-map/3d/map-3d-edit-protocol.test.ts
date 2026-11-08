import { describe, expect, it, vi, type Mock } from 'vitest';
import { HOME_MAP_FLOOR_WRITE } from '@smarteverything/domain/home-map';
import { HOME_MAP_WALL_ATTACHMENT_WRITE } from '@smarteverything/domain/home-map-elements';
import { EditSender } from './map-3d-bridge';
import {
  CLEAR_EDIT_MESSAGE,
  EDIT_EVENT,
  EDIT_FLOOR,
  EDIT_FLOOR_MESSAGE,
  EDIT_MESSAGE,
  EDIT_OVERLAY,
  EDIT_RESULT_MESSAGE,
  NO_EDIT_OVERLAY,
  type EditEvent,
  type EditFloorWire,
  type EditOverlay,
  type Map3dEditHandle,
} from './map-3d-edit-protocol';

const floor = HOME_MAP_FLOOR_WRITE.parse({
  id: 'ground',
  name: 'Ground',
  level: 0,
  elevation: 0,
  ceilingHeight: 2.6,
  rooms: [],
  walls: [],
  openings: [],
  objects: [],
  placements: [],
  annotations: [],
});

const floorWire: EditFloorWire = { floor, boxes: { sofa: { w: 2, d: 0.9, h: 0.8 } } };

const overlay: EditOverlay = {
  mode: 'select',
  selection: ['sofa'],
  gizmo: {
    mode: 'move',
    space: 'local',
    centre: { x: 1, y: 2, height: 0.4 },
    axes: ['x', 'y', 'z'],
    turn: 30,
  },
  handles: [
    {
      id: 'h1',
      kind: 'plane',
      at: { x: 1, y: 2, height: 0 },
      surface: { kind: 'ground' },
      target: { kind: 'scan' },
    },
    {
      id: 'h2',
      kind: 'point',
      at: { x: 0, y: 0, height: 2.6 },
      surface: { kind: 'ceiling' },
      target: { kind: 'room-corner', roomId: 'r', index: 2 },
    },
    {
      id: 'h3',
      kind: 'side',
      at: { x: 0, y: 0, height: 1 },
      surface: { kind: 'wall', wallId: 'w' },
      target: { kind: 'opening', openingId: 'o', part: 'to' },
    },
    {
      id: 'h4',
      kind: 'cone-yaw',
      at: { x: 0, y: 0, height: 1 },
      surface: { kind: 'along-wall', wallId: 'w' },
      target: { kind: 'cone', deviceId: 'd' },
    },
    {
      id: 'h5',
      kind: 'ring',
      at: { x: 0, y: 0, height: 1 },
      surface: { kind: 'table', objectId: 'o' },
      target: { kind: 'wall-end', wallId: 'w', end: 'from' },
    },
    {
      id: 'h6',
      kind: 'edge',
      at: { x: 0, y: 0, height: 0 },
      surface: { kind: 'ground' },
      target: { kind: 'room-side', roomId: 'r', index: 0 },
    },
    {
      id: 'h7',
      kind: 'edge',
      at: { x: 0, y: 0, height: 0 },
      surface: { kind: 'ground' },
      target: { kind: 'wall-middle', wallId: 'w' },
    },
    {
      id: 'h8',
      kind: 'corner',
      at: { x: 0, y: 0, height: 0 },
      surface: { kind: 'ground' },
      target: { kind: 'rect-corner', anchor: { x: 1, y: 1 } },
    },
    {
      id: 'h9',
      kind: 'axis-x',
      at: { x: 1, y: 2, height: 0.4 },
      surface: { kind: 'ground' },
      target: { kind: 'gizmo', id: 'sofa' },
    },
    {
      id: 'h10',
      kind: 'point',
      at: { x: 2, y: 2, height: 0 },
      surface: { kind: 'ground' },
      target: { kind: 'shape-corner', shapeId: 'zone', index: 1 },
    },
    {
      id: 'h11',
      kind: 'point',
      at: { x: 4, y: 1, height: 0 },
      surface: { kind: 'ground' },
      target: { kind: 'line-end', lineId: 'barrier', end: 'to' },
    },
  ],
  shapes: [
    {
      kind: 'ring',
      id: 'zone',
      points: [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
        { x: 1, y: 3 },
      ],
    },
    { kind: 'line', id: 'barrier', from: { x: 0, y: 1 }, to: { x: 4, y: 1 } },
  ],
  ghosts: [
    {
      shape: 'polyline',
      points: [
        { x: 0, y: 0, height: 0 },
        { x: 1, y: 1, height: 2.4 },
      ],
      tone: 'accent',
    },
    {
      shape: 'polygon',
      points: [
        { x: 0, y: 0, height: 0 },
        { x: 1, y: 0, height: 0 },
        { x: 1, y: 1, height: 0 },
      ],
      tone: 'info',
    },
    { shape: 'wall-face', wallId: 'w', face: 'both', tone: 'accent' },
    { shape: 'wall-face', wallId: 'w', face: 'left', tone: 'snap' },
  ],
  labels: [{ at: { x: 0, y: 0, height: 0 }, text: '2.40 m', tone: 'neutral' }],
  snapping: true,
  readOnly: false,
  roomDrag: false,
  place: null,
  paint: null,
  frame: { key: 'rooms-draw', bounds: { minX: 0, minY: 0, maxX: 5, maxY: 4 }, top: false },
  scanExtent: { minX: -2, minY: -1.5, maxX: 2, maxY: 1.5 },
};

const placing: readonly EditOverlay[] = [
  {
    ...NO_EDIT_OVERLAY,
    mode: 'place',
    place: { kind: 'object', footprint: { w: 0.9, d: 0.8 }, rotation: 90 },
  },
  { ...NO_EDIT_OVERLAY, mode: 'place', place: { kind: 'device', mount: 'wall', height: 1.8 } },
  { ...NO_EDIT_OVERLAY, mode: 'paint', paint: { surface: 'wall' } },
  {
    ...NO_EDIT_OVERLAY,
    mode: 'select',
    selection: ['living'],
    roomDrag: true,
    frame: { key: 'zones', bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 }, top: true },
  },
];

const events: readonly EditEvent[] = [
  {
    seq: 1,
    type: 'tap',
    point: { x: 1, y: 2 },
    floorId: 'ground',
    hit: { kind: 'wall', id: 'w', offset: 0.5 },
    metresPerPx: 0.01,
  },
  {
    seq: 2,
    type: 'tap',
    point: { x: 1, y: 2 },
    floorId: 'ground',
    hit: { kind: 'none' },
    metresPerPx: 0.02,
  },
  { seq: 3, type: 'pick-up', id: 'sofa' },
  {
    seq: 4,
    type: 'move',
    id: 'sofa',
    at: { x: 1, y: 1 },
    rotation: 90,
    wall: HOME_MAP_WALL_ATTACHMENT_WRITE.parse({ wallId: 'w', offset: 1, side: 'left' }),
    height: 1.2,
    elevation: null,
    mount: 'wall',
  },
  {
    seq: 5,
    type: 'resize',
    id: 'sofa',
    box: { at: { x: 1, y: 1 }, rotation: 0, w: 2, d: 1, h: null },
  },
  { seq: 6, type: 'rotate', id: 'sofa', degrees: 15 },
  { seq: 18, type: 'room-move', id: 'living', by: { x: 0.5, y: -0.2 } },
  {
    seq: 19,
    type: 'place',
    at: { x: 2, y: 5.95 },
    height: 1.8,
    rotation: 270,
    surface: { kind: 'wall', wallId: 'w' },
    wall: HOME_MAP_WALL_ATTACHMENT_WRITE.parse({ wallId: 'w', offset: 2, side: 'right' }),
  },
  {
    seq: 20,
    type: 'place',
    at: { x: 1, y: 1 },
    height: 0,
    rotation: 0,
    surface: { kind: 'ground' },
    wall: null,
  },
  { seq: 21, type: 'paint', target: { kind: 'floor', roomId: 'living' } },
  { seq: 22, type: 'paint', target: { kind: 'wall', wallId: 'w', side: 'left' } },
  { seq: 7, type: 'vertex', handleId: 'v1', point: { x: 3, y: 3 } },
  { seq: 8, type: 'edge', handleId: 'e1', offset: 0.4 },
  { seq: 9, type: 'rect', from: { x: 0, y: 0 }, to: { x: 4, y: 3 } },
  { seq: 10, type: 'slide', id: 'door', offset: 1, width: 0.9 },
  {
    seq: 11,
    type: 'scan',
    placement: { tx: 0, ty: 0, tz: 0.1, yawDeg: 10, scale: 1.1 },
  },
  { seq: 12, type: 'cone', deviceId: 'cam', yaw: 20, pitch: -10 },
  { seq: 13, type: 'anchor', rect: { x: 1, y: 2, width: 30, height: 40 } },
  { seq: 14, type: 'anchor', rect: null },
  { seq: 15, type: 'menu', point: { x: 10, y: 20 }, pick: { kind: 'device', id: 'lamp' } },
  { seq: 16, type: 'snap', engaged: true },
  { seq: 17, type: 'cancel' },
];

describe('edit wire protocol', () => {
  it('round-trips the floor, the overlay and the idle overlay through JSON', () => {
    expect(EDIT_FLOOR.parse(JSON.parse(JSON.stringify(floorWire)))).toEqual(floorWire);
    expect(EDIT_OVERLAY.parse(JSON.parse(JSON.stringify(overlay)))).toEqual(overlay);
    expect(EDIT_OVERLAY.parse(JSON.parse(JSON.stringify(NO_EDIT_OVERLAY)))).toEqual(
      NO_EDIT_OVERLAY,
    );
  });

  it.each(placing.map((each) => [each.mode, each] as const))(
    'round-trips a %s overlay with its armed item, paint surface or frame request',
    (_mode, each) => {
      expect(EDIT_OVERLAY.parse(JSON.parse(JSON.stringify(each)))).toEqual(each);
    },
  );

  it('ties the armed item to the place mode and the paint surface to the paint mode', () => {
    const armed = { kind: 'device', mount: 'floor', height: 0 } as const;
    expect(EDIT_OVERLAY.safeParse({ ...NO_EDIT_OVERLAY, mode: 'place' }).success).toBe(false);
    expect(EDIT_OVERLAY.safeParse({ ...NO_EDIT_OVERLAY, place: armed }).success).toBe(false);
    expect(EDIT_OVERLAY.safeParse({ ...NO_EDIT_OVERLAY, mode: 'paint' }).success).toBe(false);
    expect(
      EDIT_OVERLAY.safeParse({ ...NO_EDIT_OVERLAY, mode: 'place', paint: { surface: 'floor' } })
        .success,
    ).toBe(false);
  });

  it('rejects an empty extent, a two point ring and an armed item without a size', () => {
    const flat = { minX: 1, minY: 0, maxX: 1, maxY: 2 };
    expect(EDIT_OVERLAY.safeParse({ ...overlay, scanExtent: flat }).success).toBe(false);
    expect(
      EDIT_OVERLAY.safeParse({ ...overlay, frame: { key: 'f', bounds: flat, top: true } }).success,
    ).toBe(false);
    const ring = {
      kind: 'ring',
      id: 'z',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    };
    expect(EDIT_OVERLAY.safeParse({ ...overlay, shapes: [ring] }).success).toBe(false);
    const sizeless = { kind: 'object', footprint: { w: 0, d: 1 }, rotation: 0 };
    expect(
      EDIT_OVERLAY.safeParse({ ...NO_EDIT_OVERLAY, mode: 'place', place: sizeless }).success,
    ).toBe(false);
    expect(
      EDIT_OVERLAY.safeParse({
        ...overlay,
        ghosts: [{ shape: 'polyline', points: [{ x: 0, y: 0 }], tone: 'accent' }],
      }).success,
    ).toBe(false);
    expect(
      EDIT_OVERLAY.safeParse({
        ...overlay,
        ghosts: [{ shape: 'wall-face', wallId: 'w', face: 'front', tone: 'accent' }],
      }).success,
    ).toBe(false);
  });

  it.each(events.map((event) => [event.type, event] as const))(
    'round-trips the %s event through JSON',
    (_type, event) => {
      expect(EDIT_EVENT.parse(JSON.parse(JSON.stringify(event)))).toEqual(event);
    },
  );

  it('covers every event type of the scene', () => {
    expect(new Set(events.map((event) => event.type))).toEqual(
      new Set(EDIT_EVENT.options.map((option) => option.shape.type.value)),
    );
  });

  it('validates the call arguments', () => {
    expect(EDIT_FLOOR_MESSAGE.safeParse(['k', '{}', null]).success).toBe(true);
    expect(EDIT_FLOOR_MESSAGE.safeParse(['k', '{}', 4]).success).toBe(true);
    expect(EDIT_FLOOR_MESSAGE.safeParse(['k', '{}']).success).toBe(false);
    expect(EDIT_FLOOR_MESSAGE.safeParse(['k', '{}', -1]).success).toBe(false);
    expect(EDIT_MESSAGE.safeParse(['{}']).success).toBe(true);
    expect(EDIT_RESULT_MESSAGE.safeParse([3, false]).success).toBe(true);
    expect(EDIT_RESULT_MESSAGE.safeParse([-1, true]).success).toBe(false);
    expect(CLEAR_EDIT_MESSAGE.safeParse([]).success).toBe(true);
  });

  it('rejects unknown fields and unknown kinds', () => {
    expect(EDIT_EVENT.safeParse({ seq: 1, type: 'cancel', extra: 1 }).success).toBe(false);
    expect(EDIT_EVENT.safeParse({ seq: 1, type: 'keys' }).success).toBe(false);
    expect(
      EDIT_EVENT.safeParse({ seq: 1, type: 'paint', target: { kind: 'wall', wallId: 'w' } })
        .success,
    ).toBe(false);
    expect(
      EDIT_EVENT.safeParse({ seq: 1, type: 'room-move', id: 'living', by: { x: 1 } }).success,
    ).toBe(false);
    expect(EDIT_OVERLAY.safeParse({ ...overlay, extra: 1 }).success).toBe(false);
    expect(
      EDIT_OVERLAY.safeParse({
        ...overlay,
        handles: [
          {
            id: 'h',
            kind: 'bogus',
            at: { x: 0, y: 0, height: 0 },
            surface: { kind: 'ground' },
            target: { kind: 'scan' },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      EDIT_OVERLAY.safeParse({
        ...overlay,
        handles: [
          {
            id: 'h',
            kind: 'point',
            at: { x: 0, y: 0, height: 0 },
            surface: { kind: 'wall' },
            target: { kind: 'scan' },
          },
        ],
      }).success,
    ).toBe(false);
    for (const target of [
      { kind: 'gizmo' },
      { kind: 'shape-corner', shapeId: 'zone' },
      { kind: 'line-end', lineId: 'barrier', end: 'middle' },
      { kind: 'room-corner', roomId: 'r', index: -1 },
      { kind: 'opening', openingId: 'o', part: 'middle' },
    ]) {
      expect(
        EDIT_OVERLAY.safeParse({
          ...overlay,
          handles: [
            {
              id: 'h',
              kind: 'point',
              at: { x: 0, y: 0, height: 0 },
              surface: { kind: 'ground' },
              target,
            },
          ],
        }).success,
      ).toBe(false);
    }
  });
});

type Spied<T> = { readonly [K in keyof T]: Mock };

function fakeHandle(): Spied<Map3dEditHandle> {
  return {
    setEditFloor: vi.fn(),
    setEdit: vi.fn(),
    editResult: vi.fn(),
    clearEdit: vi.fn(),
  };
}

describe('EditSender', () => {
  it('sends nothing until ready and sends the wanted state once on ready', () => {
    const handle = fakeHandle();
    const sender = new EditSender(() => handle);
    sender.showFloor('f:1', floorWire, 7);
    sender.show(overlay);
    expect(handle.setEdit).not.toHaveBeenCalled();
    sender.ready();
    expect(handle.setEditFloor).toHaveBeenCalledTimes(1);
    expect(handle.setEdit).toHaveBeenCalledTimes(1);
    expect(handle.setEditFloor.mock.calls[0]?.[0]).toBe('f:1');
    expect(handle.setEditFloor.mock.calls[0]?.[2]).toBe(7);
    expect(EDIT_FLOOR.parse(JSON.parse(String(handle.setEditFloor.mock.calls[0]?.[1])))).toEqual(
      floorWire,
    );
    expect(EDIT_OVERLAY.parse(JSON.parse(String(handle.setEdit.mock.calls[0]?.[0])))).toEqual(
      overlay,
    );
  });

  it('dedupes the floor by key and the overlay by content', () => {
    const handle = fakeHandle();
    const sender = new EditSender(() => handle);
    sender.ready();
    sender.showFloor('f:1', floorWire, null);
    sender.show(overlay);
    sender.showFloor('f:1', floorWire, null);
    sender.show({ ...overlay });
    expect(handle.setEditFloor).toHaveBeenCalledTimes(1);
    expect(handle.setEdit).toHaveBeenCalledTimes(1);
    sender.show({ ...overlay, snapping: false });
    sender.showFloor('f:2', floorWire, null);
    expect(handle.setEdit).toHaveBeenCalledTimes(2);
    expect(handle.setEditFloor).toHaveBeenCalledTimes(2);
  });

  it('clears once when the overlay goes away and resends everything after a reconnect', () => {
    const handle = fakeHandle();
    const sender = new EditSender(() => handle);
    sender.ready();
    sender.showFloor('f:1', floorWire, null);
    sender.show(overlay);
    sender.show(null);
    sender.show(null);
    expect(handle.clearEdit).toHaveBeenCalledTimes(1);
    sender.show(overlay);
    expect(handle.setEditFloor).toHaveBeenCalledTimes(2);
    sender.lost();
    sender.ready();
    expect(handle.setEditFloor).toHaveBeenCalledTimes(3);
    expect(handle.setEdit).toHaveBeenCalledTimes(3);
  });

  it('forwards edit results only while connected', () => {
    const handle = fakeHandle();
    const sender = new EditSender(() => handle);
    sender.result(1, true);
    expect(handle.editResult).not.toHaveBeenCalled();
    sender.ready();
    sender.result(2, false);
    expect(handle.editResult).toHaveBeenCalledWith(2, false);
    sender.lost();
    sender.result(3, true);
    expect(handle.editResult).toHaveBeenCalledTimes(1);
  });
});
