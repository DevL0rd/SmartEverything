import { z } from 'zod';

export const HOME_MAP_ELEMENT_ID = z.string().min(1);

export const HOME_MAP_FLOOR_ID = HOME_MAP_ELEMENT_ID.brand<'HomeMapFloorId'>();
export const HOME_MAP_ROOM_ID = HOME_MAP_ELEMENT_ID.brand<'HomeMapRoomId'>();
export const HOME_MAP_WALL_ID = HOME_MAP_ELEMENT_ID.brand<'HomeMapWallId'>();
export const HOME_MAP_OPENING_ID = HOME_MAP_ELEMENT_ID.brand<'HomeMapOpeningId'>();
export const HOME_MAP_OBJECT_ID = HOME_MAP_ELEMENT_ID.brand<'HomeMapObjectId'>();
export const HOME_MAP_ANNOTATION_ID = HOME_MAP_ELEMENT_ID.brand<'HomeMapAnnotationId'>();
export const HOME_MAP_SOURCE_ID = HOME_MAP_ELEMENT_ID.brand<'HomeMapSourceId'>();
export const HOME_MAP_NOTICE_ID = HOME_MAP_ELEMENT_ID.brand<'HomeMapNoticeId'>();
export const HOME_MAP_MODEL_ID = z.string().min(1).brand<'HomeMapModelId'>();

export type HomeMapFloorId = z.infer<typeof HOME_MAP_FLOOR_ID>;
export type HomeMapRoomId = z.infer<typeof HOME_MAP_ROOM_ID>;
export type HomeMapWallId = z.infer<typeof HOME_MAP_WALL_ID>;
export type HomeMapOpeningId = z.infer<typeof HOME_MAP_OPENING_ID>;
export type HomeMapObjectId = z.infer<typeof HOME_MAP_OBJECT_ID>;
export type HomeMapAnnotationId = z.infer<typeof HOME_MAP_ANNOTATION_ID>;
export type HomeMapSourceId = z.infer<typeof HOME_MAP_SOURCE_ID>;
export type HomeMapNoticeId = z.infer<typeof HOME_MAP_NOTICE_ID>;
export type HomeMapModelId = z.infer<typeof HOME_MAP_MODEL_ID>;

export const HOME_MAP_WALL_KINDS = ['solid', 'half', 'glass', 'railing'] as const;

export const HOME_MAP_OPENING_KINDS = [
  'door',
  'double_door',
  'sliding_door',
  'pocket_door',
  'window',
  'opening',
  'garage_door',
] as const;

export const HOME_MAP_OPENING_OPENS = [
  'side_hung',
  'tilt_turn',
  'sliding',
  'fixed',
  'swing',
] as const;

export const HOME_MAP_WALL_SIDES = ['left', 'right'] as const;

export const HOME_MAP_ANNOTATION_KINDS = ['note', 'pin', 'measure'] as const;

export const HOME_MAP_POINT = z.looseObject({ x: z.number(), y: z.number() });

export type HomeMapPoint = z.infer<typeof HOME_MAP_POINT>;

export const HOME_MAP_RING = z.array(HOME_MAP_POINT).min(3);

export const HOME_MAP_POLYGON = z.looseObject({
  outer: HOME_MAP_RING,
  holes: z.array(HOME_MAP_RING),
});

export const HOME_MAP_ORIGIN = z.discriminatedUnion('kind', [
  z.looseObject({ kind: z.literal('hand') }),
  z.looseObject({
    kind: z.literal('source'),
    sourceId: HOME_MAP_SOURCE_ID,
    ref: z.string().min(1),
    overridden: z.array(z.string().min(1)),
  }),
]);

export type HomeMapOrigin = z.infer<typeof HOME_MAP_ORIGIN>;

const WALL_ATTACHMENT_SHAPE = {
  wallId: HOME_MAP_WALL_ID,
  offset: z.number().nonnegative(),
  side: z.enum(HOME_MAP_WALL_SIDES),
};

export const HOME_MAP_WALL_ATTACHMENT_WRITE = z.strictObject(WALL_ATTACHMENT_SHAPE);

export type HomeMapWallAttachment = z.infer<typeof HOME_MAP_WALL_ATTACHMENT_WRITE>;

export const HOME_MAP_WALL_ATTACHMENT: z.ZodType<HomeMapWallAttachment> =
  z.looseObject(WALL_ATTACHMENT_SHAPE);

const ROOM_SHAPE = {
  id: HOME_MAP_ROOM_ID,
  name: z.string().nullable(),
  homeRoomId: z.uuid().nullable(),
  polygon: HOME_MAP_POLYGON,
  labelAt: HOME_MAP_POINT,
  colourSlot: z.number().int().min(1).max(8),
  floorMaterial: z.looseObject({
    kind: z.string().min(1),
    variant: z.string().nullable(),
    tint: z.string().nullable(),
  }),
  wallPaint: z.string().nullable(),
  ceilingHeight: z.number().positive().nullable(),
  origin: HOME_MAP_ORIGIN,
};

const WALL_SHAPE = {
  id: HOME_MAP_WALL_ID,
  from: HOME_MAP_POINT,
  to: HOME_MAP_POINT,
  thickness: z.number().positive(),
  height: z.number().positive().nullable(),
  kind: z.enum(HOME_MAP_WALL_KINDS),
  origin: HOME_MAP_ORIGIN,
};

const OPENING_SHAPE = {
  id: HOME_MAP_OPENING_ID,
  wallId: HOME_MAP_WALL_ID,
  offset: z.number().nonnegative(),
  width: z.number().positive(),
  kind: z.enum(HOME_MAP_OPENING_KINDS),
  sillHeight: z.number().nonnegative(),
  headHeight: z.number().positive(),
  hinge: z.enum(['left', 'right']),
  swing: z.enum(['in', 'out']),
  opens: z.enum(HOME_MAP_OPENING_OPENS).optional(),
  contactDeviceId: z.uuid().nullable(),
  lockDeviceId: z.uuid().nullable(),
  origin: HOME_MAP_ORIGIN,
};

const OBJECT_SHAPE = {
  id: HOME_MAP_OBJECT_ID,
  modelId: HOME_MAP_MODEL_ID,
  finish: z.string().min(1).nullable(),
  params: z.record(z.string().min(1), z.number()),
  at: HOME_MAP_POINT,
  rotation: z.number(),
  elevation: z.number().nonnegative(),
  label: z.string().nullable(),
  locked: z.boolean(),
  style: z.string().min(1).optional(),
  flipped: z.boolean().optional(),
  origin: HOME_MAP_ORIGIN,
};

const MARK_SHAPE = {
  id: HOME_MAP_ANNOTATION_ID,
  kind: z.enum(['note', 'pin']),
  at: HOME_MAP_POINT,
  text: z.string(),
};

const MEASURE_SHAPE = {
  id: HOME_MAP_ANNOTATION_ID,
  kind: z.literal('measure'),
  from: HOME_MAP_POINT,
  to: HOME_MAP_POINT,
  text: z.string(),
};

export const HOME_MAP_ROOM_WRITE = z.strictObject(ROOM_SHAPE);
export const HOME_MAP_WALL_WRITE = z.strictObject(WALL_SHAPE);
export const HOME_MAP_OPENING_WRITE = z.strictObject(OPENING_SHAPE);
export const HOME_MAP_OBJECT_WRITE = z.strictObject({
  ...OBJECT_SHAPE,
  wall: HOME_MAP_WALL_ATTACHMENT_WRITE.optional(),
});
export const HOME_MAP_ANNOTATION_WRITE = z.discriminatedUnion('kind', [
  z.strictObject(MARK_SHAPE),
  z.strictObject(MEASURE_SHAPE),
]);

export type HomeMapRoom = z.infer<typeof HOME_MAP_ROOM_WRITE>;
export type HomeMapWall = z.infer<typeof HOME_MAP_WALL_WRITE>;
export type HomeMapOpening = z.infer<typeof HOME_MAP_OPENING_WRITE>;
export type HomeMapObject = z.infer<typeof HOME_MAP_OBJECT_WRITE>;
export type HomeMapAnnotation = z.infer<typeof HOME_MAP_ANNOTATION_WRITE>;

export const HOME_MAP_ROOM: z.ZodType<HomeMapRoom> = z.looseObject(ROOM_SHAPE);
export const HOME_MAP_WALL: z.ZodType<HomeMapWall> = z.looseObject(WALL_SHAPE);
export const HOME_MAP_OPENING: z.ZodType<HomeMapOpening> = z.looseObject(OPENING_SHAPE);
export const HOME_MAP_OBJECT: z.ZodType<HomeMapObject> = z.looseObject({
  ...OBJECT_SHAPE,
  wall: HOME_MAP_WALL_ATTACHMENT.optional(),
});
export const HOME_MAP_ANNOTATION: z.ZodType<HomeMapAnnotation> = z.discriminatedUnion('kind', [
  z.looseObject(MARK_SHAPE),
  z.looseObject(MEASURE_SHAPE),
]);
