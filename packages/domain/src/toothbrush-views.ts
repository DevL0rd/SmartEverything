import { z } from 'zod';
import { BRUSHING_GOAL, BRUSHING_SESSION } from './brushing-session';
import { BRUSHING_STATS } from './brushing-stats-schema';
import {
  BRUSH_ACTIVITIES,
  SONICARE_FAMILIES,
  BRUSH_HEADS,
  BRUSH_HEAD_TYPES,
  BRUSH_INTENSITIES,
  BRUSH_LINK_PHASES,
  BRUSH_MODES,
  BRUSH_PRESSURES,
  BRUSH_PROFILE,
  BRUSH_SESSION_STATES,
  LIVE_SOURCES,
  ORALB_FORCE_BANDS,
  ORALB_HEAD_BASELINE,
  ORALB_IDENTITY,
  ORALB_MODES,
  ORALB_PROBES,
  ORALB_PROBE_RESULT,
  ORALB_RING_VALUES,
  SONICARE_IDENTITY,
  ZONE_SOURCES,
} from './toothbrush';
import { BRUSH_SETTINGS, BRUSH_SETTINGS_CHANGE } from './toothbrush-settings';
import { LOCAL_DAY, STATS_RANGES } from './treadmill-days';

const MOMENT = z.iso.datetime({ offset: true });

const PRESSURE_CODE = z.union([z.literal(0), z.literal(1), z.literal(2)]);

export const BRUSH_LIVE_FRAME = z.strictObject({
  at: MOMENT,
  activity: z.enum(BRUSH_ACTIVITIES),
  session: z.enum(BRUSH_SESSION_STATES),
  link: z.enum(BRUSH_LINK_PHASES),
  mode: z.enum(BRUSH_MODES).nullable(),
  intensity: z.enum(BRUSH_INTENSITIES).nullable(),
  elapsedS: z.number().nonnegative(),
  routineS: z.number().positive().nullable(),
  zone: z.number().int().positive().nullable(),
  battery: z.number().min(0).max(100).nullable(),
  detailVisible: z.boolean(),
  pressure: z.enum(BRUSH_PRESSURES).nullable(),
  pressureValue: z.number().nullable(),
  temperatureC: z.number().nullable(),
  strip: z.array(PRESSURE_CODE),
  excessS: z.number().nonnegative(),
  zoneSource: z.enum(ZONE_SOURCES),
  zoneSeconds: z.array(z.number().nonnegative()),
  sectorS: z.number().nonnegative().nullable(),
  force: z.number().nullable(),
  angleDeg: z.number().nullable(),
  face: z.number().int().min(0).max(11).nullable(),
  liveSource: z.enum(LIVE_SOURCES).nullable(),
});

export type BrushLiveFrame = z.infer<typeof BRUSH_LIVE_FRAME>;

export const BRUSH_LIVE_NOTICE = z.strictObject({
  type: z.literal('toothbrush_live'),
  deviceId: z.uuid(),
  frame: BRUSH_LIVE_FRAME,
});

export type BrushLiveNotice = z.infer<typeof BRUSH_LIVE_NOTICE>;

export const BRUSH_LINK_VIEW = z.strictObject({
  phase: z.enum(BRUSH_LINK_PHASES),
  holderName: z.string().nullable(),
  holderIsYou: z.boolean(),
  rssi: z.number().int().nullable(),
  lastHeardAt: MOMENT.nullable(),
  detail: z.string().nullable(),
  fetching: z.number().int().nonnegative(),
});

export const HEAD_REMINDERS = ['on', 'reset', 'snooze', 'interval', 'off'] as const;

const HEAD_VIEW = z.strictObject({
  state: z.enum(BRUSH_HEADS),
  type: z.enum(BRUSH_HEAD_TYPES).nullable(),
  usageS: z.number().nonnegative().nullable(),
  limitS: z.number().positive().nullable(),
  wearPercent: z.number().min(0).max(100).nullable(),
  sessionsLeft: z.number().int().nonnegative().nullable(),
  replaceBy: MOMENT.nullable(),
  madeOn: z.string().nullable(),
  daysLeft: z.number().int().nonnegative().nullable(),
  secondsLeft: z.number().int().nonnegative().nullable(),
  reminder: z.enum(HEAD_REMINDERS).nullable(),
  baselineDays: z.number().int().nonnegative().nullable(),
});

const BATTERY_VIEW = z.strictObject({
  percent: z.number().min(0).max(100).nullable(),
  millivolts: z.number().int().nullable(),
  daysLeft: z.number().nonnegative().nullable(),
  low: z.boolean(),
  charging: z.boolean(),
});

const ORALB_HANDLE = z.strictObject({
  protocol: z.number().int().nonnegative().nullable(),
  modelId: z.number().int().nonnegative(),
  firmware: z.number().int().nonnegative(),
  ringColour: z.enum(ORALB_RING_VALUES).nullable(),
  ringDisplay: z.array(z.number().int().min(0).max(255)).length(3).nullable(),
  modeSlots: z.array(z.enum(ORALB_MODES)),
  pacer: z.array(z.number().int().nonnegative()).nullable(),
  chargeCycles: z.number().int().nonnegative().nullable(),
  brushingCycles: z.number().int().nonnegative().nullable(),
  motorSeconds: z.number().int().nonnegative().nullable(),
});

const HANDLE_VIEW = z.strictObject({
  motorHours: z.number().nonnegative().nullable(),
  lifetimeSessions: z.number().int().nonnegative().nullable(),
  faultHex: z.string().nullable(),
  clockIsUnix: z.boolean().nullable(),
  firmware: z.string().nullable(),
  oralb: ORALB_HANDLE.nullable(),
});

const TODAY_VIEW = z.strictObject({
  day: LOCAL_DAY,
  sessions: z.number().int().nonnegative(),
  counted: z.number().int().nonnegative(),
  goalSessions: z.number().int().positive(),
  seconds: z.number().nonnegative(),
  goalSeconds: z.number().nonnegative(),
  morning: z.boolean(),
  evening: z.boolean(),
  percent: z.number().int().min(0).max(100),
});

export const BRUSH_STATE_VIEW = z.strictObject({
  view: z.literal('state'),
  deviceId: z.uuid(),
  model: z.string().nullable(),
  family: z.enum(SONICARE_FAMILIES).nullable(),
  profile: BRUSH_PROFILE,
  availableModes: z.array(z.enum(BRUSH_MODES)),
  link: BRUSH_LINK_VIEW,
  frame: BRUSH_LIVE_FRAME,
  head: HEAD_VIEW,
  battery: BATTERY_VIEW,
  handle: HANDLE_VIEW,
  personId: z.string().nullable(),
  personName: z.string().nullable(),
  mine: z.boolean(),
  today: TODAY_VIEW.nullable(),
  streak: z.number().int().nonnegative().nullable(),
  score: z.number().int().min(0).max(100).nullable(),
  lastSession: BRUSHING_SESSION.nullable(),
  writes: z.strictObject({ allowed: z.boolean(), reason: z.string().nullable() }),
  mayConfigure: z.boolean(),
});

export type BrushStateView = z.infer<typeof BRUSH_STATE_VIEW>;

export const BRUSH_SESSIONS_VIEW = z.strictObject({
  view: z.literal('sessions'),
  sessions: z.array(BRUSHING_SESSION),
  more: z.boolean(),
  hidden: z.number().int().nonnegative(),
});

export const BRUSH_SESSION_VIEW = z.strictObject({
  view: z.literal('session'),
  session: BRUSHING_SESSION,
  personName: z.string().nullable(),
});

export const BRUSH_STATS_VIEW = z.strictObject({
  view: z.literal('stats'),
  personId: z.string().nullable(),
  personName: z.string().nullable(),
  stats: BRUSHING_STATS,
  today: TODAY_VIEW,
});

const POINT = z.strictObject({ at: MOMENT, value: z.number() });

export const BRUSH_HEAD_ROW = z.strictObject({
  serial: z.string(),
  type: z.enum(BRUSH_HEAD_TYPES).nullable(),
  firstSeen: MOMENT,
  lastSeen: MOMENT,
  usageS: z.number().nonnegative(),
  limitS: z.number().positive(),
  current: z.boolean(),
});

export const BRUSH_HEAD_VIEW = z.strictObject({
  view: z.literal('head'),
  head: HEAD_VIEW,
  timeline: z.array(BRUSH_HEAD_ROW),
  perDayS: z.number().nonnegative().nullable(),
});

export const BRUSH_BATTERY_VIEW = z.strictObject({
  view: z.literal('battery'),
  battery: BATTERY_VIEW,
  levels: z.array(POINT),
  millivolts: z.array(z.strictObject({ at: MOMENT, millivolts: z.number(), percent: z.number() })),
  charges: z.array(MOMENT),
  daysPerCharge: z.array(z.number().nonnegative()),
});

export const BRUSH_HANDLE_VIEW = z.strictObject({
  view: z.literal('handle'),
  handle: HANDLE_VIEW,
  motorHours: z.array(POINT),
  sessionsByWeek: z.array(z.strictObject({ weekStart: LOCAL_DAY, sessions: z.number().int() })),
});

export const BRUSH_SETTINGS_VIEW = z.strictObject({
  view: z.literal('settings'),
  settings: BRUSH_SETTINGS.nullable(),
  goal: BRUSHING_GOAL,
  personId: z.string().nullable(),
  profile: BRUSH_PROFILE,
  writes: z.strictObject({ allowed: z.boolean(), reason: z.string().nullable() }),
  mayConfigure: z.boolean(),
});

const SONICARE_DIAGNOSTICS = z.strictObject({
  brand: z.literal('sonicare'),
  identity: SONICARE_IDENTITY,
  headSerial: z.string().nullable(),
  headRing: z.number().int().nullable(),
  nfcVersion: z.string().nullable(),
  nfcUrl: z.string().nullable(),
  errorPersistent: z.number().int().nullable(),
  errorVolatile: z.number().int().nullable(),
  calibration: z.array(z.string()),
  easyStart: z.number().int().nullable(),
  sensorMask: z.number().int().nullable(),
  settingsBits: z.number().int().nullable(),
  handleClock: z.number().int().nullable(),
});

const ORALB_DIAGNOSTICS = z.strictObject({
  brand: z.literal('oralb'),
  identity: ORALB_IDENTITY,
  probes: z.partialRecord(z.enum(ORALB_PROBES), ORALB_PROBE_RESULT),
  forceBands: ORALB_FORCE_BANDS.nullable(),
  headBaseline: ORALB_HEAD_BASELINE.nullable(),
  advertIntervalMs: z.number().nonnegative().nullable(),
  liveSource: z.enum(LIVE_SOURCES).nullable(),
  filterRegistered: z.boolean(),
  records: z.array(z.strictObject({ at: MOMENT, hex: z.string() })),
});

export const BRUSH_DIAGNOSTICS_VIEW = z.strictObject({
  view: z.literal('diagnostics'),
  profile: BRUSH_PROFILE,
  link: BRUSH_LINK_VIEW,
  brand: z.discriminatedUnion('brand', [SONICARE_DIAGNOSTICS, ORALB_DIAGNOSTICS]),
  rawLog: z.strictObject({
    enabled: z.boolean(),
    frames: z.array(z.strictObject({ at: MOMENT, characteristic: z.string(), hex: z.string() })),
  }),
});

export const BRUSH_VIEW = z.discriminatedUnion('view', [
  BRUSH_STATE_VIEW,
  BRUSH_SESSIONS_VIEW,
  BRUSH_SESSION_VIEW,
  BRUSH_STATS_VIEW,
  BRUSH_HEAD_VIEW,
  BRUSH_BATTERY_VIEW,
  BRUSH_HANDLE_VIEW,
  BRUSH_SETTINGS_VIEW,
  BRUSH_DIAGNOSTICS_VIEW,
]);

export type BrushView = z.infer<typeof BRUSH_VIEW>;

export const BRUSH_VIEW_NAMES = [
  'state',
  'sessions',
  'session',
  'stats',
  'head',
  'battery',
  'handle',
  'settings',
  'diagnostics',
] as const;

export const DEFAULT_BRUSH_PAGE = 50;

export const BRUSH_READ_QUERY = z.strictObject({
  view: z
    .enum(BRUSH_VIEW_NAMES)
    .describe('state, sessions, session, stats, head, battery, handle, settings or diagnostics'),
  sessionId: z.string().min(1).optional().describe('The session to read (view session)'),
  range: z.enum(STATS_RANGES).optional().describe('day, week, month or year (view stats)'),
  anchor: LOCAL_DAY.optional().describe('Any day inside the range, default today (view stats)'),
  personId: z
    .uuid()
    .optional()
    .describe('Whose sessions and stats; owners only, default the caller'),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe('Sessions per page (view sessions)'),
  before: MOMENT.optional().describe(
    'Only sessions that started before this moment (view sessions)',
  ),
});

export type BrushReadQuery = z.infer<typeof BRUSH_READ_QUERY>;

export const BRUSH_ACTION = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('assign_session'),
    sessionId: z.string().min(1),
    personId: z.uuid().nullable(),
  }),
  z.strictObject({ action: z.literal('set_person'), personId: z.uuid().nullable() }),
  z.strictObject({
    action: z.literal('set_goal'),
    personId: z.uuid().optional(),
    goal: BRUSHING_GOAL.partial(),
  }),
  z.strictObject({ action: z.literal('configure'), settings: BRUSH_SETTINGS_CHANGE }),
  z.strictObject({ action: z.literal('take_over') }),
  z.strictObject({ action: z.literal('forget_session'), sessionId: z.string().min(1) }),
  z.strictObject({ action: z.literal('raw_log'), enabled: z.boolean() }),
  z.strictObject({
    action: z.literal('set_mode_order'),
    modes: z.array(z.enum(ORALB_MODES)).min(1).max(8),
  }),
  z.strictObject({ action: z.literal('reset_head_reminder') }),
  z.strictObject({ action: z.literal('snooze_head_reminder') }),
  z.strictObject({ action: z.literal('probe'), probe: z.enum(ORALB_PROBES) }),
]);

export type BrushAction = z.infer<typeof BRUSH_ACTION>;
