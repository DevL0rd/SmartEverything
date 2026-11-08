import { z } from 'zod';
import { MOMENT } from './api/primitives';
import { HOME_MAP_ELEMENT_ID, HOME_MAP_FLOOR_ID } from './home-map-elements';

export const HOME_MAP_MAP_ID = HOME_MAP_ELEMENT_ID.brand<'HomeMapId'>();
export const HOME_MAP_VERSION_ID = HOME_MAP_ELEMENT_ID.brand<'HomeMapVersionId'>();

export type HomeMapId = z.infer<typeof HOME_MAP_MAP_ID>;
export type HomeMapVersionId = z.infer<typeof HOME_MAP_VERSION_ID>;

const SUMMARY_SHAPE = {
  id: HOME_MAP_MAP_ID,
  name: z.string(),
  revision: z.number().int().nonnegative(),
  floorNames: z.array(z.string()),
  roomCount: z.number().int().nonnegative(),
  isDefault: z.boolean(),
  position: z.number().int().nonnegative(),
  fedBy: z.array(z.string()),
  hasScan: z.boolean(),
  updatedAt: MOMENT,
};

export const HOME_MAP_SUMMARY_WRITE = z.strictObject(SUMMARY_SHAPE);

export type HomeMapSummary = z.infer<typeof HOME_MAP_SUMMARY_WRITE>;

export const HOME_MAP_SUMMARY: z.ZodType<HomeMapSummary> = z.looseObject(SUMMARY_SHAPE);

const VERSION_SHAPE = {
  mapId: HOME_MAP_MAP_ID,
  versionId: HOME_MAP_VERSION_ID,
  name: z.string().nullable(),
  createdAt: MOMENT,
  actor: z.string().min(1),
};

export const HOME_MAP_VERSION_WRITE = z.strictObject(VERSION_SHAPE);

export type HomeMapVersion = z.infer<typeof HOME_MAP_VERSION_WRITE>;

export const HOME_MAP_VERSION: z.ZodType<HomeMapVersion> = z.looseObject(VERSION_SHAPE);

const FEED_TARGET_SHAPE = {
  mapId: HOME_MAP_MAP_ID,
  floorId: HOME_MAP_FLOOR_ID,
};

export const HOME_MAP_FEED_TARGET_WRITE = z.strictObject(FEED_TARGET_SHAPE);

export type HomeMapFeedTarget = z.infer<typeof HOME_MAP_FEED_TARGET_WRITE>;

export const HOME_MAP_FEED_TARGET: z.ZodType<HomeMapFeedTarget> = z.looseObject(FEED_TARGET_SHAPE);

const FEED_SHAPE = {
  deviceId: z.uuid(),
  robotMapId: z.number().int().nonnegative(),
  robotMapName: z.string().nullable(),
  isCurrent: z.boolean(),
  target: HOME_MAP_FEED_TARGET_WRITE.nullable(),
};

export const HOME_MAP_FEED_WRITE = z.strictObject(FEED_SHAPE);

export type HomeMapFeed = z.infer<typeof HOME_MAP_FEED_WRITE>;

export const HOME_MAP_FEED: z.ZodType<HomeMapFeed> = z.looseObject({
  ...FEED_SHAPE,
  target: HOME_MAP_FEED_TARGET.nullable(),
});

export const HOME_MAP_FEED_ASSIGNMENT_WRITE = z.union([
  HOME_MAP_FEED_TARGET_WRITE,
  z.strictObject({ target: z.null() }),
]);

export type HomeMapFeedAssignment = z.infer<typeof HOME_MAP_FEED_ASSIGNMENT_WRITE>;
