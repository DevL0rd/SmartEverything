import { z } from 'zod';
import type { DOMImperativeFactory } from 'expo/dom';
import { HOME_MAP_FLOOR_WRITE } from '@smarteverything/domain/home-map';
import {
  HOME_MAP_WALL_ATTACHMENT_WRITE,
  HOME_MAP_WALL_SIDES,
} from '@smarteverything/domain/home-map-elements';
import { HOME_MAP_MOUNTS } from '@smarteverything/domain/home-map-placement';

type WireMessage = DOMImperativeFactory[string];

export interface Map3dEditHandle extends DOMImperativeFactory {
  setEditFloor: WireMessage;
  setEdit: WireMessage;
  editResult: WireMessage;
  clearEdit: WireMessage;
}

export const EDIT_FLOOR_MESSAGE = z.tuple([
  z.string(),
  z.string(),
  z.int().nonnegative().nullable(),
]);

export const EDIT_MESSAGE = z.tuple([z.string()]);

export const EDIT_RESULT_MESSAGE = z.tuple([z.int().nonnegative(), z.boolean()]);

export const CLEAR_EDIT_MESSAGE = z.tuple([]);

const POINT = z.strictObject({ x: z.number(), y: z.number() });

const SCREEN_POINT = z.strictObject({ x: z.number(), y: z.number() });

const ID = z.string().min(1);

export const EDIT_MOUNTS = HOME_MAP_MOUNTS;

const MOUNT = z.enum(EDIT_MOUNTS);

export const EDIT_SURFACE = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ground') }),
  z.strictObject({ kind: z.literal('ceiling') }),
  z.strictObject({ kind: z.literal('wall'), wallId: ID }),
  z.strictObject({ kind: z.literal('along-wall'), wallId: ID }),
  z.strictObject({ kind: z.literal('table'), objectId: ID }),
]);

export type EditSurface = z.infer<typeof EDIT_SURFACE>;

export const EDIT_FLOOR = z.strictObject({
  floor: HOME_MAP_FLOOR_WRITE,
  boxes: z.record(ID, z.strictObject({ w: z.number(), d: z.number(), h: z.number() })),
});

export type EditFloorWire = z.infer<typeof EDIT_FLOOR>;

export const EDIT_MODES = ['select', 'draw-rect', 'draw-points', 'place', 'paint', 'none'] as const;

export const GIZMO_MODES = ['move', 'rotate', 'scale'] as const;

export const GIZMO_SPACES = ['local', 'world'] as const;

export const EDIT_HANDLE_KINDS = [
  'point',
  'edge',
  'axis-x',
  'axis-y',
  'axis-z',
  'plane',
  'ring',
  'corner',
  'side',
  'top',
  'uniform',
  'cone-yaw',
  'cone-pitch',
] as const;

export const EDIT_TONES = ['neutral', 'accent', 'info', 'warn', 'danger', 'snap'] as const;

const HEIGHT_POINT = z.strictObject({ x: z.number(), y: z.number(), height: z.number() });

export const EDIT_GIZMO = z.strictObject({
  mode: z.enum(GIZMO_MODES),
  space: z.enum(GIZMO_SPACES),
  centre: HEIGHT_POINT,
  axes: z.array(z.enum(['x', 'y', 'z'])),
  turn: z.number(),
});

export const EDIT_SEGMENT_ENDS = ['from', 'to'] as const;

const INDEX = z.int().nonnegative();

export const EDIT_HANDLE_TARGET = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('room-corner'), roomId: ID, index: INDEX }),
  z.strictObject({ kind: z.literal('room-side'), roomId: ID, index: INDEX }),
  z.strictObject({ kind: z.literal('wall-end'), wallId: ID, end: z.enum(EDIT_SEGMENT_ENDS) }),
  z.strictObject({ kind: z.literal('wall-middle'), wallId: ID }),
  z.strictObject({ kind: z.literal('rect-corner'), anchor: POINT }),
  z.strictObject({
    kind: z.literal('opening'),
    openingId: ID,
    part: z.enum(['body', ...EDIT_SEGMENT_ENDS]),
  }),
  z.strictObject({ kind: z.literal('scan') }),
  z.strictObject({ kind: z.literal('cone'), deviceId: ID }),
  z.strictObject({ kind: z.literal('gizmo'), id: ID }),
  z.strictObject({ kind: z.literal('shape-corner'), shapeId: ID, index: INDEX }),
  z.strictObject({ kind: z.literal('line-end'), lineId: ID, end: z.enum(EDIT_SEGMENT_ENDS) }),
]);

export type EditHandleTarget = z.infer<typeof EDIT_HANDLE_TARGET>;

export const EDIT_HANDLE = z.strictObject({
  id: ID,
  kind: z.enum(EDIT_HANDLE_KINDS),
  at: HEIGHT_POINT,
  surface: EDIT_SURFACE,
  target: EDIT_HANDLE_TARGET,
});

export const EDIT_PATH_SHAPES = ['polyline', 'polygon'] as const;

export const EDIT_WALL_FACES = ['both', ...HOME_MAP_WALL_SIDES] as const;

export const EDIT_GHOST = z.discriminatedUnion('shape', [
  z.strictObject({
    shape: z.enum(EDIT_PATH_SHAPES),
    points: z.array(HEIGHT_POINT),
    tone: z.enum(EDIT_TONES),
  }),
  z.strictObject({
    shape: z.literal('wall-face'),
    wallId: ID,
    face: z.enum(EDIT_WALL_FACES),
    tone: z.enum(EDIT_TONES),
  }),
]);

export type EditGhost = z.infer<typeof EDIT_GHOST>;

export type EditPathGhost = Extract<EditGhost, { readonly points: unknown }>;

export const EDIT_SHAPE = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ring'), id: ID, points: z.array(POINT).min(3) }),
  z.strictObject({ kind: z.literal('line'), id: ID, from: POINT, to: POINT }),
]);

export type EditShape = z.infer<typeof EDIT_SHAPE>;

const SIZE = z.number().positive();

export const EDIT_PLACE = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('object'),
    footprint: z.strictObject({ w: SIZE, d: SIZE }),
    rotation: z.number(),
  }),
  z.strictObject({ kind: z.literal('device'), mount: MOUNT, height: z.number().nonnegative() }),
]);

export type EditPlace = z.infer<typeof EDIT_PLACE>;

export const EDIT_PAINT_SURFACES = ['floor', 'wall'] as const;

export const EDIT_PAINT = z.strictObject({ surface: z.enum(EDIT_PAINT_SURFACES) });

export const EDIT_EXTENT = z
  .strictObject({ minX: z.number(), minY: z.number(), maxX: z.number(), maxY: z.number() })
  .refine((extent) => extent.minX < extent.maxX && extent.minY < extent.maxY);

export type EditExtent = z.infer<typeof EDIT_EXTENT>;

export const EDIT_FRAME = z.strictObject({
  key: ID,
  bounds: EDIT_EXTENT,
  top: z.boolean(),
});

export type EditFrame = z.infer<typeof EDIT_FRAME>;

export const EDIT_LABEL = z.strictObject({
  at: HEIGHT_POINT,
  text: z.string(),
  tone: z.enum(EDIT_TONES),
});

export const EDIT_OVERLAY = z
  .strictObject({
    mode: z.enum(EDIT_MODES),
    selection: z.array(ID),
    roomDrag: z.boolean(),
    gizmo: EDIT_GIZMO.nullable(),
    handles: z.array(EDIT_HANDLE),
    shapes: z.array(EDIT_SHAPE),
    ghosts: z.array(EDIT_GHOST),
    labels: z.array(EDIT_LABEL),
    snapping: z.boolean(),
    readOnly: z.boolean(),
    place: EDIT_PLACE.nullable(),
    paint: EDIT_PAINT.nullable(),
    frame: EDIT_FRAME.nullable(),
    scanExtent: EDIT_EXTENT.nullable(),
  })
  .refine((overlay) => (overlay.mode === 'place') === (overlay.place !== null), {
    path: ['place'],
    message: 'The place mode and only the place mode carries the armed item',
  })
  .refine((overlay) => (overlay.mode === 'paint') === (overlay.paint !== null), {
    path: ['paint'],
    message: 'The paint mode and only the paint mode carries the painted surface',
  });

export type EditOverlay = z.infer<typeof EDIT_OVERLAY>;

export const EDIT_HIT = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('device'), id: ID }),
  z.strictObject({ kind: z.literal('object'), id: ID, locked: z.boolean() }),
  z.strictObject({ kind: z.literal('opening'), id: ID }),
  z.strictObject({ kind: z.literal('wall'), id: ID, offset: z.number() }),
  z.strictObject({ kind: z.literal('room'), id: ID }),
  z.strictObject({ kind: z.literal('none') }),
]);

export type EditHit = z.infer<typeof EDIT_HIT>;

export const EDIT_PAINT_TARGET = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('floor'), roomId: ID }),
  z.strictObject({ kind: z.literal('wall'), wallId: ID, side: z.enum(HOME_MAP_WALL_SIDES) }),
]);

export type EditPaintTarget = z.infer<typeof EDIT_PAINT_TARGET>;

const SEQ = z.int().nonnegative();

const EVENT_BASE = { seq: SEQ };

export const EDIT_EVENT = z.discriminatedUnion('type', [
  z.strictObject({
    ...EVENT_BASE,
    type: z.literal('tap'),
    point: POINT,
    floorId: ID,
    hit: EDIT_HIT,
    metresPerPx: z.number().positive(),
  }),
  z.strictObject({ ...EVENT_BASE, type: z.literal('pick-up'), id: ID }),
  z.strictObject({
    ...EVENT_BASE,
    type: z.literal('move'),
    id: ID,
    at: POINT,
    rotation: z.number(),
    wall: HOME_MAP_WALL_ATTACHMENT_WRITE.nullable(),
    height: z.number().nonnegative().nullable(),
    elevation: z.number().nonnegative().nullable(),
    mount: MOUNT.nullable(),
  }),
  z.strictObject({
    ...EVENT_BASE,
    type: z.literal('resize'),
    id: ID,
    box: z.strictObject({
      at: POINT,
      rotation: z.number(),
      w: z.number().positive(),
      d: z.number().positive(),
      h: z.number().positive().nullable(),
    }),
  }),
  z.strictObject({ ...EVENT_BASE, type: z.literal('room-move'), id: ID, by: POINT }),
  z.strictObject({
    ...EVENT_BASE,
    type: z.literal('place'),
    at: POINT,
    height: z.number().nonnegative(),
    rotation: z.number(),
    surface: EDIT_SURFACE,
    wall: HOME_MAP_WALL_ATTACHMENT_WRITE.nullable(),
  }),
  z.strictObject({ ...EVENT_BASE, type: z.literal('paint'), target: EDIT_PAINT_TARGET }),
  z.strictObject({ ...EVENT_BASE, type: z.literal('rotate'), id: ID, degrees: z.number() }),
  z.strictObject({ ...EVENT_BASE, type: z.literal('vertex'), handleId: ID, point: POINT }),
  z.strictObject({ ...EVENT_BASE, type: z.literal('edge'), handleId: ID, offset: z.number() }),
  z.strictObject({ ...EVENT_BASE, type: z.literal('rect'), from: POINT, to: POINT }),
  z.strictObject({
    ...EVENT_BASE,
    type: z.literal('slide'),
    id: ID,
    offset: z.number().nonnegative(),
    width: z.number().positive(),
  }),
  z.strictObject({
    ...EVENT_BASE,
    type: z.literal('scan'),
    placement: z.strictObject({
      tx: z.number(),
      ty: z.number(),
      tz: z.number(),
      yawDeg: z.number(),
      scale: z.number().positive(),
    }),
  }),
  z.strictObject({
    ...EVENT_BASE,
    type: z.literal('cone'),
    deviceId: ID,
    yaw: z.number(),
    pitch: z.number(),
  }),
  z.strictObject({
    ...EVENT_BASE,
    type: z.literal('anchor'),
    rect: z
      .strictObject({
        x: z.number(),
        y: z.number(),
        width: z.number().min(0),
        height: z.number().min(0),
      })
      .nullable(),
  }),
  z.strictObject({ ...EVENT_BASE, type: z.literal('menu'), point: SCREEN_POINT, pick: EDIT_HIT }),
  z.strictObject({ ...EVENT_BASE, type: z.literal('snap'), engaged: z.boolean() }),
  z.strictObject({ ...EVENT_BASE, type: z.literal('cancel') }),
]);

export type EditEvent = z.infer<typeof EDIT_EVENT>;

export const NO_EDIT_OVERLAY: EditOverlay = {
  mode: 'none',
  selection: [],
  roomDrag: false,
  gizmo: null,
  handles: [],
  shapes: [],
  ghosts: [],
  labels: [],
  snapping: true,
  readOnly: false,
  place: null,
  paint: null,
  frame: null,
  scanExtent: null,
};
