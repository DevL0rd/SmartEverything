import { z } from 'zod';
import { MOMENT } from './api/primitives';
import {
  HOME_MAP_ELEMENT_ID,
  HOME_MAP_FLOOR_ID,
  HOME_MAP_NOTICE_ID,
  HOME_MAP_OPENING_KINDS,
  HOME_MAP_POINT,
  HOME_MAP_POLYGON,
  HOME_MAP_SOURCE_ID,
  HOME_MAP_WALL_KINDS,
} from './home-map-elements';

export const HOME_MAP_SOURCE_KINDS = ['xiaomi_vacuum'] as const;

export const HOME_MAP_NOTICE_KINDS = [
  'source_changed',
  'source_missing',
  'source_moved',
  'link_stale',
  'source_new_robot_map',
] as const;

const REF = z.string().min(1);

const SOURCE_BASE = z.looseObject({
  rooms: z.array(z.looseObject({ ref: REF, polygon: HOME_MAP_POLYGON, labelAt: HOME_MAP_POINT })),
  walls: z.array(
    z.looseObject({
      ref: REF,
      from: HOME_MAP_POINT,
      to: HOME_MAP_POINT,
      thickness: z.number().positive(),
      kind: z.enum(HOME_MAP_WALL_KINDS),
    }),
  ),
  openings: z.array(
    z.looseObject({
      ref: REF,
      wallRef: REF,
      offset: z.number().nonnegative(),
      width: z.number().positive(),
      kind: z.enum(HOME_MAP_OPENING_KINDS),
    }),
  ),
});

const SOURCE_SHAPE = {
  id: HOME_MAP_SOURCE_ID,
  kind: z.enum(HOME_MAP_SOURCE_KINDS),
  deviceId: z.uuid(),
  robotMapId: z.number().int().nonnegative().optional(),
  robotMapName: z.string().optional(),
  floorId: HOME_MAP_FLOOR_ID,
  transform: z.looseObject({
    rotationDeg: z.number(),
    tx: z.number(),
    ty: z.number(),
    mirrored: z.boolean(),
  }),
  frame: z.looseObject({
    uid: z.string().min(1).nullable(),
    name: z.string().nullable(),
    boundsSignature: z.string().min(1),
  }),
  lastVersion: z.string().min(1).nullable(),
  lastImportedAt: MOMENT.nullable(),
  base: SOURCE_BASE,
  tombstones: z.array(z.string().min(1)),
};

const NOTICE_SHAPE = {
  id: HOME_MAP_NOTICE_ID,
  kind: z.enum(HOME_MAP_NOTICE_KINDS),
  elementId: HOME_MAP_ELEMENT_ID,
  detail: z.string(),
  createdAt: MOMENT,
};

export const HOME_MAP_SOURCE_WRITE = z.strictObject(SOURCE_SHAPE);
export const HOME_MAP_NOTICE_WRITE = z.strictObject(NOTICE_SHAPE);

export type HomeMapSource = z.infer<typeof HOME_MAP_SOURCE_WRITE>;
export type HomeMapNotice = z.infer<typeof HOME_MAP_NOTICE_WRITE>;

export const HOME_MAP_SOURCE: z.ZodType<HomeMapSource> = z.looseObject(SOURCE_SHAPE);
export const HOME_MAP_NOTICE: z.ZodType<HomeMapNotice> = z.looseObject(NOTICE_SHAPE);
