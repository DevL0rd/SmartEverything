import { z } from 'zod';
import {
  HOME_MAP_FLOOR_ID,
  HOME_MAP_POINT,
  HOME_MAP_WALL_ATTACHMENT,
  HOME_MAP_WALL_ATTACHMENT_WRITE,
} from './home-map-elements';

export const HOME_MAP_MOUNTS = ['floor', 'wall', 'ceiling', 'table'] as const;

export const HOME_MAP_PAN_MODES = ['fixed', 'presets', 'live'] as const;

export const HOME_MAP_FOV_SOURCES = ['exact', 'estimated'] as const;

const CAMERA_SHAPE = {
  hfovDeg: z.number().positive().max(360),
  vfovDeg: z.number().positive().max(360),
  rangeM: z.number().positive(),
  fovSource: z.enum(HOME_MAP_FOV_SOURCES),
  pan: z.looseObject({
    mode: z.enum(HOME_MAP_PAN_MODES),
    yawDeg: z.number(),
    presets: z.record(
      z.string().min(1),
      z.looseObject({ yawDeg: z.number(), tiltDeg: z.number() }),
    ),
  }),
  showCone: z.boolean(),
};

export const HOME_MAP_CAMERA_WRITE = z.strictObject(CAMERA_SHAPE);

export type HomeMapCamera = z.infer<typeof HOME_MAP_CAMERA_WRITE>;

export const HOME_MAP_CAMERA: z.ZodType<HomeMapCamera> = z.looseObject(CAMERA_SHAPE);

const PLACEMENT_BASE = {
  deviceId: z.uuid(),
  floorId: HOME_MAP_FLOOR_ID,
  at: HOME_MAP_POINT,
  rotation: z.number(),
  height: z.number().nonnegative(),
  tilt: z.number(),
  mount: z.enum(HOME_MAP_MOUNTS),
  auto: z.boolean(),
};

export const HOME_MAP_PLACEMENT_WRITE = z.strictObject({
  ...PLACEMENT_BASE,
  camera: HOME_MAP_CAMERA_WRITE.nullable(),
  wall: HOME_MAP_WALL_ATTACHMENT_WRITE.optional(),
});

export type HomeMapPlacement = z.infer<typeof HOME_MAP_PLACEMENT_WRITE>;

export const HOME_MAP_PLACEMENT: z.ZodType<HomeMapPlacement> = z.looseObject({
  ...PLACEMENT_BASE,
  camera: HOME_MAP_CAMERA.nullable(),
  wall: HOME_MAP_WALL_ATTACHMENT.optional(),
});
