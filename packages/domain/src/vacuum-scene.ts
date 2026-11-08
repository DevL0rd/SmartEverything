import { z } from 'zod';
import { MOMENT } from './api/primitives';

export const VACUUM_SLOTS = ['current', 'saved', 'backup'] as const;

export const VACUUM_SLOT = z.enum(VACUUM_SLOTS);

export type VacuumSlot = z.infer<typeof VACUUM_SLOT>;

export const VACUUM_POINT = z.object({ x: z.number(), y: z.number() });

export type VacuumPoint = z.infer<typeof VACUUM_POINT>;

export const VACUUM_POSE = z.object({ x: z.number(), y: z.number(), yaw: z.number() });

export type VacuumPose = z.infer<typeof VACUUM_POSE>;

export const VACUUM_RING = z.array(VACUUM_POINT).min(3);

export const VACUUM_SEGMENT = z.object({ from: VACUUM_POINT, to: VACUUM_POINT });

export const VACUUM_ROOM_SETTINGS = z.object({
  suction: z.number().int().nullable(),
  water: z.number().int().nullable(),
  mode: z.number().int().nullable(),
  repeats: z.number().int().nullable(),
});

export const VACUUM_ROOM = z.object({
  id: z.number().int(),
  name: z.string(),
  colour: z.number().int(),
  floor: z.number().int(),
  hidden: z.boolean(),
  areaM2: z.number().nonnegative(),
  label: VACUUM_POINT,
  rings: z.array(VACUUM_RING),
  settings: VACUUM_ROOM_SETTINGS.nullable(),
});

export type VacuumRoom = z.infer<typeof VACUUM_ROOM>;

export const VACUUM_WALL = VACUUM_SEGMENT.extend({
  kind: z.string(),
  height: z.number().nonnegative().nullable(),
});

export const VACUUM_DOOR = VACUUM_SEGMENT.extend({
  kind: z.string(),
  rooms: z.array(z.number().int()),
});

export const VACUUM_CARPET = z.object({
  id: z.number().int(),
  kind: z.string(),
  ring: VACUUM_RING,
});

export const VACUUM_FURNITURE = z.object({
  id: z.number().int(),
  kind: z.string(),
  ring: VACUUM_RING,
  height: z.number().nonnegative().nullable(),
});

export const VACUUM_OBJECT = z.object({
  id: z.number().int(),
  kind: z.string(),
  at: VACUUM_POINT,
  label: z.string().nullable(),
});

export const VACUUM_ZONE_KINDS = ['no_go', 'no_mop', 'wall', 'hidden'] as const;

export const VACUUM_ZONE = z.object({
  id: z.number().int(),
  kind: z.string(),
  points: z.array(VACUUM_POINT).min(2),
});

export const VACUUM_TRAIL_RUN = z.object({
  mopping: z.boolean(),
  points: z.array(VACUUM_POINT),
});

export type VacuumTrailRun = z.infer<typeof VACUUM_TRAIL_RUN>;

export const VACUUM_BOUNDS = z.object({
  minX: z.number(),
  minY: z.number(),
  maxX: z.number(),
  maxY: z.number(),
});

export const VACUUM_SCENE = z.object({
  index: z.number().int(),
  slot: VACUUM_SLOT,
  name: z.string().nullable(),
  robotMapId: z.number().int().optional(),
  robotMapName: z.string().optional(),
  isCurrent: z.boolean().optional(),
  fetchedAt: MOMENT,
  bounds: VACUUM_BOUNDS,
  rooms: z.array(VACUUM_ROOM),
  walls: z.array(VACUUM_WALL),
  doors: z.array(VACUUM_DOOR),
  carpets: z.array(VACUUM_CARPET),
  furniture: z.array(VACUUM_FURNITURE),
  objects: z.array(VACUUM_OBJECT),
  zones: z.array(VACUUM_ZONE),
  dock: VACUUM_POSE.nullable(),
  robot: VACUUM_POSE.nullable(),
  trail: z.array(VACUUM_TRAIL_RUN),
});

export type VacuumScene = z.infer<typeof VACUUM_SCENE>;

export function vacuumSceneVersion(scene: Pick<VacuumScene, 'index' | 'slot'>): string {
  return `${String(scene.index)}:${scene.slot}`;
}

export const VACUUM_SAVED_MAPS_KEY = 'raw:vacuum_saved_maps';

export const VACUUM_SAVED_MAP = z.object({
  robotMapId: z.number().int(),
  name: z.string(),
  isCurrent: z.boolean(),
  rooms: z.number().int().nonnegative(),
  version: z.string().min(1),
});

export type VacuumSavedMap = z.infer<typeof VACUUM_SAVED_MAP>;

export const VACUUM_SAVED_MAPS = z.array(VACUUM_SAVED_MAP);

export function vacuumSavedMapVersion(
  scene: Pick<VacuumScene, 'index'> & { readonly robotMapId: number },
): string {
  return `${String(scene.index)}:saved:${String(scene.robotMapId)}`;
}

export const VACUUM_OUTCOMES = ['finished', 'stopped', 'error', 'returned_low_battery'] as const;

export const VACUUM_CLEAN_ROOM = z.object({ id: z.number().int(), name: z.string() });

export const VACUUM_CLEAN_SUMMARY = z.object({
  id: z.string().min(1),
  startedAt: MOMENT,
  endedAt: MOMENT.nullable(),
  seconds: z.number().int().nonnegative(),
  areaM2: z.number().nonnegative(),
  scope: z.string().nullable(),
  mode: z.string().nullable(),
  rooms: z.array(VACUUM_CLEAN_ROOM),
  outcome: z.string().nullable(),
  batteryStart: z.number().min(0).max(100).nullable(),
  batteryEnd: z.number().min(0).max(100).nullable(),
});

export const VACUUM_CLEAN = VACUUM_CLEAN_SUMMARY.extend({
  mapIndex: z.number().int().nullable(),
  zones: z.array(z.array(VACUUM_POINT)),
  trail: z.array(VACUUM_TRAIL_RUN),
});

export type VacuumClean = z.infer<typeof VACUUM_CLEAN>;

export type VacuumCleanSummary = z.infer<typeof VACUUM_CLEAN_SUMMARY>;
