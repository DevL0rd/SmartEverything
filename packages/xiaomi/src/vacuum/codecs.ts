import { z } from 'zod';
import { parseJson } from '../json';

export class VacuumCodecError extends Error {
  override readonly name = 'VacuumCodecError';

  constructor(
    readonly codec: string,
    readonly expected: string,
    readonly received: string,
  ) {
    super(`The ${codec} value was refused: expected ${expected}, received ${received}.`);
  }
}

function refuse(codec: string, expected: string, received: string): VacuumCodecError {
  return new VacuumCodecError(codec, expected, received);
}

function readJson<T>(codec: string, expected: string, schema: z.ZodType<T>, text: string): T {
  const raw = parseJson(text, () => refuse(codec, expected, 'text that is not JSON'));
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw refuse(codec, expected, result.error.issues[0]?.message ?? 'another shape');
  }
  return result.data;
}

function writeJson<T>(
  codec: string,
  expected: string,
  schema: z.ZodType<T>,
  value: unknown,
): string {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw refuse(codec, expected, result.error.issues[0]?.message ?? 'another shape');
  }
  return JSON.stringify(result.data);
}

function inRange(codec: string, label: string, value: number, max: number): number {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw refuse(codec, `${label} 0 to ${String(max)}`, String(value));
  }
  return value;
}

const BYTE = 256;

export interface DoNotDisturbWindow {
  readonly startHour: number;
  readonly startMinute: number;
  readonly endHour: number;
  readonly endMinute: number;
}

const DND = 'do-not-disturb window';
const HOUR_MAX = 23;
const MINUTE_MAX = 59;
const UINT32_MAX = 4294967295;
const DND_FIELDS = [
  ['startHour', HOUR_MAX],
  ['startMinute', MINUTE_MAX],
  ['endHour', HOUR_MAX],
  ['endMinute', MINUTE_MAX],
] as const;

function checkedWindow(window: DoNotDisturbWindow): DoNotDisturbWindow {
  for (const [key, max] of DND_FIELDS) inRange(DND, key, window[key], max);
  if (window.startHour === window.endHour && window.startMinute === window.endMinute) {
    throw refuse(DND, 'a start and an end that differ', 'equal times');
  }
  return window;
}

export function encodeDndWindow(window: DoNotDisturbWindow): number {
  const { startHour, startMinute, endHour, endMinute } = checkedWindow(window);
  return ((startHour * BYTE + startMinute) * BYTE + endHour) * BYTE + endMinute;
}

export function decodeDndWindow(value: number): DoNotDisturbWindow {
  inRange(DND, 'a uint32', value, UINT32_MAX);
  const endMinute = value % BYTE;
  const endHour = Math.floor(value / BYTE) % BYTE;
  const startMinute = Math.floor(value / BYTE ** 2) % BYTE;
  const startHour = Math.floor(value / BYTE ** 3);
  return checkedWindow({ startHour, startMinute, endHour, endMinute });
}

const CORNER_COUNT = 8;
const COORDINATES = z.array(z.number());

export interface RestrictedAreaDraft {
  readonly corners: readonly number[];
  readonly kind: 'no-go' | 'no-mop';
}

export interface RestrictedArea extends RestrictedAreaDraft {
  readonly id: number;
}

export interface VirtualWallDraft {
  readonly points: readonly number[];
}

export interface VirtualWall extends VirtualWallDraft {
  readonly id: number;
}

const FORBIDDEN_REGIONS = z.object({
  forbidden_regions: z.array(
    z.object({
      id: z.number().int().nonnegative(),
      fb_point: COORDINATES.length(CORNER_COUNT),
      fb_attr: z.union([z.literal(0), z.literal(1)]),
    }),
  ),
});

const RESTRICTED_WALLS = z.object({
  restricted_walls: z.array(
    z.object({
      id: z.number().int().nonnegative(),
      wall_points: COORDINATES.length(4),
    }),
  ),
});

export function encodeRestrictedAreas(areas: readonly RestrictedAreaDraft[]): string {
  const forbidden = areas.map((area, id) => ({
    id,
    fb_point: area.corners,
    fb_attr: area.kind === 'no-go' ? 0 : 1,
  }));
  return writeJson('restricted areas 2.13', '8 numbers per area', FORBIDDEN_REGIONS, {
    forbidden_regions: forbidden,
  });
}

export function decodeRestrictedAreas(text: string): readonly RestrictedArea[] {
  const read = readJson(
    'restricted areas 2.13',
    '{"forbidden_regions":[...]}',
    FORBIDDEN_REGIONS,
    text,
  );
  return read.forbidden_regions.map((region) => ({
    id: region.id,
    corners: region.fb_point,
    kind: region.fb_attr === 0 ? 'no-go' : 'no-mop',
  }));
}

export function encodeVirtualWalls(walls: readonly VirtualWallDraft[]): string {
  const restricted = walls.map((wall, id) => ({ id, wall_points: wall.points }));
  return writeJson('virtual walls 2.14', '4 numbers per wall', RESTRICTED_WALLS, {
    restricted_walls: restricted,
  });
}

export function decodeVirtualWalls(text: string): readonly VirtualWall[] {
  const read = readJson('virtual walls 2.14', '{"restricted_walls":[...]}', RESTRICTED_WALLS, text);
  return read.restricted_walls.map((wall) => ({ id: wall.id, points: wall.wall_points }));
}

const INT = z.number().int();

const PRESET = 'custom cleanup (plugin-derived, live-unconfirmed)';
const PRESET_TASKS_MAX = 5;
const PRESET_TASK = z.object({
  mode: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  mop: INT,
  fan_level: INT,
  water_level: INT,
  more: INT,
  clean_path: INT,
  clean_count: INT,
  room_ids: z.array(INT).optional(),
  parts: z.array(COORDINATES.length(CORNER_COUNT)).optional(),
});
const PRESET_WRITE = z.object({
  id: INT,
  source: INT,
  name: z.string().min(1),
  user_cfg: z.array(PRESET_TASK).min(1).max(PRESET_TASKS_MAX),
});
const PRESET_LABELS = z.object({
  user_labels: z.array(z.object({ id: INT, name: z.string(), source: INT })),
});

export type VacuumPreset = z.infer<typeof PRESET_WRITE>;
export type VacuumPresetLabel = z.infer<typeof PRESET_LABELS>['user_labels'][number];

export function encodePreset(preset: VacuumPreset): string {
  return writeJson(PRESET, 'id, name and 1 to 5 tasks', PRESET_WRITE, preset);
}

export function decodePreset(text: string): VacuumPreset {
  return readJson(PRESET, '{"id","name","user_cfg":[1 to 5 tasks]}', PRESET_WRITE, text);
}

export function decodePresetLabels(text: string): readonly VacuumPresetLabel[] {
  return readJson(PRESET, '{"user_labels":[...]}', PRESET_LABELS, text).user_labels;
}
