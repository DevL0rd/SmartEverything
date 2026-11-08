import { z } from 'zod';
import {
  HOME_MAP_OPENING_KINDS,
  HOME_MAP_WALL_ATTACHMENT,
  HOME_MAP_WALL_KINDS,
} from '@smarteverything/domain/home-map-elements';
import { HOME_MAP_CAMERA, HOME_MAP_MOUNTS } from '@smarteverything/domain/home-map-placement';
import type { RenderFloor, RenderSceneSource } from '../render-scene';

export const RENDER_SCENE_SOURCES = [
  'home_map',
  'vacuum',
] as const satisfies readonly RenderSceneSource[];

const POINT = z.strictObject({ x: z.number(), y: z.number() });

const RING = z.array(POINT);

const POSE = z.strictObject({ x: z.number(), y: z.number(), yawDeg: z.number() });

const BOUNDS = z.strictObject({
  minX: z.number(),
  minY: z.number(),
  maxX: z.number(),
  maxY: z.number(),
});

const ROOM_FLOOR = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('none') }),
  z.strictObject({
    status: z.literal('material'),
    kind: z.string(),
    variant: z.string().nullable(),
    tint: z.string().nullable(),
  }),
  z.strictObject({ status: z.literal('unknown'), code: z.number(), label: z.string() }),
]);

const ROOM = z.strictObject({
  id: z.string(),
  name: z.string().nullable(),
  homeRoomId: z.string().nullable(),
  polygons: z.array(z.strictObject({ outer: RING, holes: z.array(RING) })),
  labelAt: POINT,
  colourSlot: z.number(),
  floor: ROOM_FLOOR,
  wallPaint: z.string().nullable(),
  ceilingHeight: z.number(),
  areaM2: z.number(),
  hidden: z.boolean(),
});

const WALL = z.strictObject({
  id: z.string(),
  from: POINT,
  to: POINT,
  thickness: z.number(),
  height: z.number(),
  kind: z.enum(HOME_MAP_WALL_KINDS),
  exterior: z.boolean(),
});

const OPENING = z.strictObject({
  id: z.string(),
  wallId: z.string().nullable(),
  from: POINT,
  to: POINT,
  kind: z.enum(HOME_MAP_OPENING_KINDS),
  sourceKind: z.string().nullable(),
  sillHeight: z.number(),
  headHeight: z.number(),
  hinge: z.enum(['left', 'right']),
  swing: z.enum(['in', 'out']),
  contactDeviceId: z.string().nullable(),
  lockDeviceId: z.string().nullable(),
  roomIds: z.array(z.string()),
});

const OBJECT = z.strictObject({
  id: z.string(),
  modelId: z.string().nullable(),
  kind: z.string(),
  label: z.string().nullable(),
  finish: z.string().nullable(),
  params: z.record(z.string(), z.number()),
  at: POINT,
  rotationDeg: z.number(),
  elevation: z.number(),
  footprint: RING.nullable(),
  height: z.number().nullable(),
  locked: z.boolean(),
  roomId: z.string().nullable(),
  wall: HOME_MAP_WALL_ATTACHMENT.nullable(),
});

const PLACEMENT = z.strictObject({
  deviceId: z.string(),
  name: z.string().nullable(),
  kind: z.string().nullable(),
  at: POINT,
  rotationDeg: z.number(),
  height: z.number(),
  tiltDeg: z.number(),
  mount: z.enum(HOME_MAP_MOUNTS),
  auto: z.boolean(),
  camera: HOME_MAP_CAMERA.nullable(),
  roomId: z.string().nullable(),
  wall: HOME_MAP_WALL_ATTACHMENT.nullable(),
});

const VACUUM = z.strictObject({
  dock: POSE.nullable(),
  robot: POSE.nullable(),
  trail: z.array(z.strictObject({ mopping: z.boolean(), points: RING })),
  zones: z.array(z.strictObject({ id: z.string(), kind: z.string(), points: RING })),
});

export const RENDER_FLOOR: z.ZodType<RenderFloor> = z.strictObject({
  id: z.string(),
  name: z.string(),
  level: z.number(),
  elevation: z.number(),
  ceilingHeight: z.number(),
  bounds: BOUNDS.nullable(),
  rooms: z.array(ROOM),
  walls: z.array(WALL),
  openings: z.array(OPENING),
  objects: z.array(OBJECT),
  placements: z.array(PLACEMENT),
  carpets: z.array(z.strictObject({ id: z.string(), kind: z.string(), ring: RING })),
  markers: z.array(
    z.strictObject({ id: z.string(), kind: z.string(), at: POINT, label: z.string().nullable() }),
  ),
  measures: z.array(z.strictObject({ id: z.string(), from: POINT, to: POINT, text: z.string() })),
  vacuum: VACUUM.nullable(),
});
