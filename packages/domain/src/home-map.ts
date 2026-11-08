import { z } from 'zod';
import { MOMENT } from './api/primitives';
import {
  HOME_MAP_ANNOTATION,
  HOME_MAP_ANNOTATION_WRITE,
  HOME_MAP_FLOOR_ID,
  HOME_MAP_OBJECT,
  HOME_MAP_OBJECT_WRITE,
  HOME_MAP_OPENING,
  HOME_MAP_OPENING_WRITE,
  HOME_MAP_ROOM,
  HOME_MAP_ROOM_WRITE,
  HOME_MAP_WALL,
  HOME_MAP_WALL_WRITE,
} from './home-map-elements';
import { HOME_MAP_PLACEMENT, HOME_MAP_PLACEMENT_WRITE } from './home-map-placement';
import { HOME_MAP_SCAN, HOME_MAP_SCAN_WRITE } from './home-map-scan';
import { HOME_MAP_MAP_ID } from './home-map-set';
import {
  HOME_MAP_NOTICE,
  HOME_MAP_NOTICE_WRITE,
  HOME_MAP_SOURCE,
  HOME_MAP_SOURCE_WRITE,
} from './home-map-source';

export const HOME_MAP_SCHEMA_VERSION = 1;

export const HOME_MAP_ID = HOME_MAP_MAP_ID.parse('home');

export const HOME_MAP_DEFAULT_CEILING_HEIGHT = 2.6;

const FLOOR_BASE = {
  id: HOME_MAP_FLOOR_ID,
  name: z.string(),
  level: z.number().int(),
  elevation: z.number(),
  ceilingHeight: z.number().positive().default(HOME_MAP_DEFAULT_CEILING_HEIGHT),
};

export const HOME_MAP_FLOOR_WRITE = z.strictObject({
  ...FLOOR_BASE,
  rooms: z.array(HOME_MAP_ROOM_WRITE),
  walls: z.array(HOME_MAP_WALL_WRITE),
  openings: z.array(HOME_MAP_OPENING_WRITE),
  objects: z.array(HOME_MAP_OBJECT_WRITE),
  placements: z.array(HOME_MAP_PLACEMENT_WRITE),
  annotations: z.array(HOME_MAP_ANNOTATION_WRITE),
});

export type HomeMapFloor = z.infer<typeof HOME_MAP_FLOOR_WRITE>;

export const HOME_MAP_FLOOR: z.ZodType<HomeMapFloor> = z.looseObject({
  ...FLOOR_BASE,
  rooms: z.array(HOME_MAP_ROOM),
  walls: z.array(HOME_MAP_WALL),
  openings: z.array(HOME_MAP_OPENING),
  objects: z.array(HOME_MAP_OBJECT),
  placements: z.array(HOME_MAP_PLACEMENT),
  annotations: z.array(HOME_MAP_ANNOTATION),
});

const MAP_BASE = {
  id: HOME_MAP_MAP_ID,
  schemaVersion: z.literal(HOME_MAP_SCHEMA_VERSION),
  revision: z.number().int().nonnegative(),
  name: z.string(),
  north: z.number(),
  updatedAt: MOMENT,
};

export const HOME_MAP_WRITE = z.strictObject({
  ...MAP_BASE,
  floors: z.array(HOME_MAP_FLOOR_WRITE),
  sources: z.array(HOME_MAP_SOURCE_WRITE),
  notices: z.array(HOME_MAP_NOTICE_WRITE),
  scan: HOME_MAP_SCAN_WRITE.optional(),
});

export type HomeMap = z.infer<typeof HOME_MAP_WRITE>;

export const HOME_MAP: z.ZodType<HomeMap> = z.looseObject({
  ...MAP_BASE,
  floors: z.array(HOME_MAP_FLOOR),
  sources: z.array(HOME_MAP_SOURCE),
  notices: z.array(HOME_MAP_NOTICE),
  scan: HOME_MAP_SCAN.optional(),
});
