import { z } from 'zod';
import { MapBlobError } from '../errors';

const COORDINATES = z.array(z.number());

const POINT = z.object({ x: z.number(), y: z.number() });

export const PATH_POINT = z.object({
  x: z.number(),
  y: z.number(),
  type: z.number().int(),
  yaw: z.number().optional(),
  sweep_mop_mode: z.number().int().optional(),
});

export const MAP_PATHS = z.object({
  pose_id: z.number().int(),
  points: z.array(PATH_POINT),
});

export const MAP_ENVELOPE = z.object({ version: z.literal(2), data: z.string().min(1) });

const ROOM_ATTRIBUTE = z.object({
  id: z.number().int(),
  room_name: z.string(),
  fan_level: z.number().int().optional(),
  water_level: z.number().int().optional(),
  clean_mode: z.number().int().optional(),
  clean_times: z.number().int().optional(),
  mop_mode: z.number().int().optional(),
  floor: z.number().int().optional(),
  name_pos_x: z.number().optional(),
  name_pos_y: z.number().optional(),
  notshow: z.number().int().optional(),
  on: z.boolean().optional(),
});

const WALL_LINE = z.object({
  type: z.number().int(),
  update: z.number().int(),
  segment: COORDINATES.length(4),
});

const CLEANING_CONFIG = z.object({
  rooms: z.array(z.number().int()).optional(),
  zones: z.array(COORDINATES).optional(),
  clean_mode: z.number().int().optional(),
  is_ai_cleaning: z.boolean().optional(),
  dirty_cleaning: z.boolean().optional(),
});

export const MAP_DOCUMENT = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  origin_x: z.number(),
  origin_y: z.number(),
  resolution: z.number().positive(),
  map_data: z.string().min(1),
  map_id: z.number().int().optional(),
  map_type: z.number().int().optional(),
  temp: z.number().int().optional(),
  map_name: z.string().optional(),
  task_id: z.number().int().optional(),
  rotate: z.number().int().optional(),
  additional_map_data: z.string().min(1).optional(),
  dirty_map_data: z.string().min(1).optional(),
  have_pile: z.boolean().optional(),
  pile_x: z.number().optional(),
  pile_y: z.number().optional(),
  pile_yaw: z.number().optional(),
  position: POINT.extend({ yaw: z.number() }).optional(),
  map_room_info: z
    .array(
      z.object({
        grid_id: z.number().int(),
        room_id: z.number().int(),
        color: z.number().int(),
      }),
    )
    .optional(),
  room_attrs: z.array(ROOM_ATTRIBUTE).optional(),
  carpets: z.array(z.object({ p: COORDINATES, d: z.string() })).optional(),
  map_3d_info: z
    .object({
      rooms: z.array(z.object({ room_id: z.number().int(), lines: z.array(WALL_LINE) })).optional(),
      carpets: z
        .array(z.object({ p: COORDINATES, p_3d: COORDINATES.optional(), d: z.string() }))
        .optional(),
    })
    .optional(),
  current_cleaning_config: CLEANING_CONFIG.optional(),
  paths: MAP_PATHS.optional(),
});

export type MapDocument = z.infer<typeof MAP_DOCUMENT>;
export type MapPaths = z.infer<typeof MAP_PATHS>;
export type PathPoint = z.infer<typeof PATH_POINT>;

export interface TrajectoryPoint {
  readonly x: number;
  readonly y: number;
  readonly mopping: boolean;
}

export function describeFailure(error: unknown): string {
  if (error instanceof z.ZodError) {
    return `invalid fields ${error.issues.map((issue) => issue.path.join('.') || '(root)').join(', ')}`;
  }
  if (error instanceof SyntaxError) return 'text that is not JSON';
  if (error instanceof MapBlobError) return error.received;
  if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
    return `${error.name} ${error.code}`;
  }
  return error instanceof Error ? error.name : typeof error;
}

export function stage<T>(step: string, expected: string, work: () => T): T {
  try {
    return work();
  } catch (error) {
    throw new MapBlobError(step, expected, describeFailure(error));
  }
}
