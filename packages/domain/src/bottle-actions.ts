import { z } from 'zod';
import {
  BOTTLE_BODY,
  BOTTLE_CALIBRATION_POINT,
  BOTTLE_DEVICE_INFORMATION,
  BOTTLE_SERIAL,
  BOTTLE_UV_STARTS,
} from './bottle';
import { BOTTLE_DAY, BOTTLE_STATS_RANGES } from './bottle-days';
import { BOTTLE_STATS } from './bottle-stats-types';
import {
  BOTTLE_CARE_VIEW,
  BOTTLE_DIAGNOSTICS_VIEW,
  BOTTLE_SETTINGS_VIEW,
} from './bottle-views-care';
import {
  BOTTLE_DRINKS_VIEW,
  BOTTLE_READINGS_VIEW,
  BOTTLE_SESSIONS_VIEW,
  BOTTLE_STATUS_VIEW,
} from './bottle-views';
import { BOTTLE_FILTER_TYPE, BOTTLE_QUIET_CHANGE, BOTTLE_REMINDER_CHANGE } from './bottle-settings';

const MOMENT = z.iso.datetime({ offset: true });

export const BOTTLE_VIEW = z.discriminatedUnion('view', [
  BOTTLE_STATUS_VIEW,
  BOTTLE_DRINKS_VIEW,
  BOTTLE_READINGS_VIEW,
  BOTTLE_SESSIONS_VIEW,
  BOTTLE_STATS,
  BOTTLE_CARE_VIEW,
  BOTTLE_SETTINGS_VIEW,
  BOTTLE_DIAGNOSTICS_VIEW,
]);

export type BottleView = z.infer<typeof BOTTLE_VIEW>;

export const BOTTLE_VIEW_NAMES = [
  'status',
  'drinks',
  'readings',
  'sessions',
  'stats',
  'care',
  'settings',
  'diagnostics',
] as const;

export const BOTTLE_READ_QUERY = z.strictObject({
  view: z
    .enum(BOTTLE_VIEW_NAMES)
    .describe('status, drinks, readings, sessions, stats, care, settings or diagnostics'),
  range: z.enum(BOTTLE_STATS_RANGES).optional().describe('day, week, month or year (view stats)'),
  day: BOTTLE_DAY.optional().describe('One day, default today (views drinks and readings)'),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe('Rows per page (views drinks, readings and sessions)'),
  before: MOMENT.optional().describe(
    'Only rows before this moment (views drinks, readings, sessions)',
  ),
});

export type BottleReadQuery = z.infer<typeof BOTTLE_READ_QUERY>;

export const BOTTLE_ACTION = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('sync') }),
  z.strictObject({ action: z.literal('measure') }),
  z.strictObject({ action: z.literal('read_sensors') }),
  z.strictObject({ action: z.literal('read_orientation') }),
  z.strictObject({ action: z.literal('uv_stop') }),
  z.strictObject({ action: z.literal('take_over') }),
  z.strictObject({ action: z.literal('rederive') }),
  z.strictObject({ action: z.literal('set_reminder'), reminder: BOTTLE_REMINDER_CHANGE }),
  z.strictObject({ action: z.literal('set_quiet_hours'), quiet: BOTTLE_QUIET_CHANGE }),
  z.strictObject({ action: z.literal('set_body'), body: BOTTLE_BODY }),
  z.strictObject({
    action: z.literal('set_filter'),
    installed: z.boolean(),
    type: BOTTLE_FILTER_TYPE.optional(),
    installedOn: BOTTLE_DAY.optional(),
  }),
  z.strictObject({ action: z.literal('reset_filter') }),
  z.strictObject({ action: z.literal('bind_person'), personId: z.uuid().nullable() }),
  z.strictObject({ action: z.literal('keep_binding') }),
  z.strictObject({
    action: z.literal('set_calibration'),
    points: z.array(BOTTLE_CALIBRATION_POINT).min(5),
  }),
  z.strictObject({ action: z.literal('clear_calibration') }),
]);

export type BottleAction = z.infer<typeof BOTTLE_ACTION>;

export const BOTTLE_ACT_RESULT = z.strictObject({ ok: z.boolean(), detail: z.string() });

export type BottleActResult = z.infer<typeof BOTTLE_ACT_RESULT>;

export const BOTTLE_UV_START = z.strictObject({ mode: z.enum(BOTTLE_UV_STARTS) });

export type BottleUvStartBody = z.infer<typeof BOTTLE_UV_START>;

export const BOTTLE_ADD = z.strictObject({
  serial: BOTTLE_SERIAL,
  name: z.string().trim().min(1).max(80),
  room: z.string().min(1).nullable(),
  profileId: z.uuid().nullable(),
  body: BOTTLE_BODY,
  filter: z.boolean(),
  dis: BOTTLE_DEVICE_INFORMATION.nullable(),
});

export type BottleAdd = z.infer<typeof BOTTLE_ADD>;
