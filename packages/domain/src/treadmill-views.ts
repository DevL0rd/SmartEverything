import { z } from 'zod';
import {
  BELT_LINK_PHASES,
  BELT_MODES,
  BELT_STATES,
  PAD_PREFERENCES,
  PANEL_BUTTONS,
  TREADMILL_FAMILIES,
  TREADMILL_IDENTITY,
  TREADMILL_GATT_DUMP,
  HEART_RATE_SOURCES,
} from './treadmill';
import { KCAL_SOURCES } from './treadmill-calories';
import { INCLINE_SCALES } from './treadmill-incline';
import { LOCAL_DAY, STATS_RANGES } from './treadmill-days';
import { SESSION_DETAIL, SESSION_ZONE_SECONDS, TREADMILL_SESSION } from './treadmill-sessions';
import {
  TREADMILL_GOALS,
  TREADMILL_SETTINGS,
  TREADMILL_SETTINGS_CHANGE,
} from './treadmill-settings';
import { TREADMILL_STATS } from './treadmill-stats';

const MOMENT = z.iso.datetime({ offset: true });

export const LIVE_BELT = z.strictObject({
  state: z.enum(BELT_STATES),
  mode: z.enum(BELT_MODES).nullable(),
  speedKmh: z.number().nonnegative(),
  targetSpeedKmh: z.number().nonnegative().nullable(),
  timeS: z.number().nonnegative(),
  distanceM: z.number().nonnegative(),
  steps: z.number().int().nonnegative().nullable(),
  cadence: z.number().nonnegative().nullable(),
  inclinePercent: z.number().nullable(),
  inclineTarget: z.number().nullable().default(null),
  inclineGrade: z.number().nonnegative().nullable().default(null),
  inclineScale: z.enum(INCLINE_SCALES).default('unconfirmed'),
  button: z.enum(PANEL_BUTTONS).nullable(),
  childLock: z.boolean().nullable(),
  controlLost: z.boolean(),
  link: z.enum(BELT_LINK_PHASES),
});

export type LiveBelt = z.infer<typeof LIVE_BELT>;

export const LIVE_BODY = z.strictObject({
  kcal: z.number().nonnegative(),
  kcalNet: z.number().nonnegative(),
  met: z.number().nullable(),
  weightKg: z.number().positive().nullable(),
  heartRate: z.number().int().nullable(),
  kcalSource: z.enum(KCAL_SOURCES).nullable().default(null),
  heartRateSource: z.enum(HEART_RATE_SOURCES).nullable().default(null),
});

export type LiveBody = z.infer<typeof LIVE_BODY>;

export const LIVE_SESSION = z.strictObject({
  startedAt: MOMENT,
  activeSeconds: z.number().nonnegative(),
  pausedSeconds: z.number().nonnegative(),
  zones: SESSION_ZONE_SECONDS,
  maxKmh: z.number().nonnegative(),
  splits: z.array(z.number().positive()),
  climbM: z.number().nonnegative().nullable().default(null),
});

export const TREADMILL_LIVE_FRAME = z.strictObject({
  at: MOMENT,
  belt: LIVE_BELT,
  session: LIVE_SESSION.nullable(),
  body: LIVE_BODY.nullable(),
});

export type TreadmillLiveFrame = z.infer<typeof TREADMILL_LIVE_FRAME>;

export const TREADMILL_LIVE_NOTICE = z.strictObject({
  type: z.literal('treadmill_live'),
  deviceId: z.uuid(),
  frame: TREADMILL_LIVE_FRAME,
});

export type TreadmillLiveNotice = z.infer<typeof TREADMILL_LIVE_NOTICE>;

const FAULT = z.strictObject({
  code: z.string(),
  cause: z.string(),
  tip: z.string(),
});

export const TREADMILL_LINK_VIEW = z.strictObject({
  phase: z.enum(BELT_LINK_PHASES),
  holderName: z.string().nullable(),
  holderIsYou: z.boolean(),
  rssi: z.number().int().nullable(),
  reconnects: z.number().int().nonnegative(),
  lastHeardAt: MOMENT.nullable(),
  detail: z.string().nullable(),
  walkerProfileId: z.string().nullable(),
  walkerName: z.string().nullable(),
});

const INCLINE_LIMITS = z.strictObject({
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  remoteMax: z.number().nullable(),
});

export const TREADMILL_STATE_VIEW = z.strictObject({
  view: z.literal('state'),
  deviceId: z.uuid(),
  family: z.enum(TREADMILL_FAMILIES),
  model: z.string(),
  link: TREADMILL_LINK_VIEW,
  frame: TREADMILL_LIVE_FRAME,
  recentSpeed: z.array(z.strictObject({ at: MOMENT, kmh: z.number() })),
  limits: z.strictObject({
    minKmh: z.number(),
    maxKmh: z.number(),
    stepKmh: z.number(),
    capKmh: z.number().nullable(),
    remoteCapKmh: z.number().nullable(),
    incline: INCLINE_LIMITS.nullable().default(null),
  }),
  inclineScale: z.enum(INCLINE_SCALES).default('unconfirmed'),
  pad: PAD_PREFERENCES,
  fault: FAULT.nullable(),
  lastSession: TREADMILL_SESSION.nullable(),
  start: z.strictObject({ allowed: z.boolean(), reason: z.string().nullable() }),
  mayConfigure: z.boolean(),
  bodyVisible: z.boolean(),
  maintenance: z.strictObject({
    lubricatedAt: MOMENT.nullable(),
    dueInDays: z.number().int().nullable(),
    beltKmSince: z.number().nonnegative(),
  }),
});

export type TreadmillStateView = z.infer<typeof TREADMILL_STATE_VIEW>;

export const TREADMILL_SESSIONS_VIEW = z.strictObject({
  view: z.literal('sessions'),
  sessions: z.array(TREADMILL_SESSION),
  more: z.boolean(),
});

export const TREADMILL_SESSION_VIEW = z.strictObject({
  view: z.literal('session'),
  detail: SESSION_DETAIL,
  walkerName: z.string().nullable(),
});

export const TREADMILL_STATS_VIEW = z.strictObject({
  view: z.literal('stats'),
  profileId: z.string().nullable(),
  stats: TREADMILL_STATS,
  goals: TREADMILL_GOALS,
  today: z.strictObject({
    activeSeconds: z.number().nonnegative(),
    distanceM: z.number().nonnegative(),
    steps: z.number().nonnegative(),
    kcal: z.number().nonnegative(),
    sessions: z.number().int().nonnegative(),
  }),
  week: z.strictObject({
    distanceM: z.number().nonnegative(),
    sessions: z.number().int().nonnegative(),
  }),
});

export const TREADMILL_RECORDS_VIEW = z.strictObject({
  view: z.literal('records'),
  remaining: z.number().int().nonnegative().nullable(),
  records: z.array(
    z.strictObject({
      at: MOMENT,
      activeSeconds: z.number().nonnegative(),
      distanceM: z.number().nonnegative(),
      steps: z.number().int().nonnegative(),
      sessionId: z.string().nullable(),
    }),
  ),
});

export const TREADMILL_SETTINGS_VIEW = z.strictObject({
  view: z.literal('settings'),
  settings: TREADMILL_SETTINGS.nullable(),
  pad: PAD_PREFERENCES.nullable(),
  goals: TREADMILL_GOALS,
  walkerProfileId: z.string().nullable(),
  mayConfigure: z.boolean(),
});

export const TREADMILL_DIAGNOSTICS_VIEW = z.strictObject({
  view: z.literal('diagnostics'),
  family: z.enum(TREADMILL_FAMILIES),
  identity: TREADMILL_IDENTITY,
  gatt: TREADMILL_GATT_DUMP,
  link: TREADMILL_LINK_VIEW,
  latencyMs: z.number().nullable(),
  lastError: z.string().nullable(),
  padRecordsRemaining: z.number().int().nonnegative().nullable(),
  rawLog: z.strictObject({
    enabled: z.boolean(),
    frames: z.array(z.strictObject({ at: MOMENT, characteristic: z.string(), hex: z.string() })),
  }),
});

export const TREADMILL_VIEW = z.discriminatedUnion('view', [
  TREADMILL_STATE_VIEW,
  TREADMILL_SESSIONS_VIEW,
  TREADMILL_SESSION_VIEW,
  TREADMILL_STATS_VIEW,
  TREADMILL_RECORDS_VIEW,
  TREADMILL_SETTINGS_VIEW,
  TREADMILL_DIAGNOSTICS_VIEW,
]);

export type TreadmillView = z.infer<typeof TREADMILL_VIEW>;

export const TREADMILL_VIEW_NAMES = [
  'state',
  'sessions',
  'session',
  'stats',
  'records',
  'settings',
  'diagnostics',
] as const;

export const DEFAULT_SESSION_PAGE = 50;

export const TREADMILL_READ_QUERY = z.strictObject({
  view: z
    .enum(TREADMILL_VIEW_NAMES)
    .describe('state, sessions, session, stats, records, settings or diagnostics'),
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

export type TreadmillReadQuery = z.infer<typeof TREADMILL_READ_QUERY>;

export const TREADMILL_ACTION = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('assign_walker'),
    sessionId: z.string().min(1),
    personId: z.uuid().nullable(),
  }),
  z.strictObject({ action: z.literal('set_walker'), personId: z.uuid().nullable() }),
  z.strictObject({
    action: z.literal('set_goal'),
    personId: z.uuid().optional(),
    goals: TREADMILL_GOALS.partial(),
  }),
  z.strictObject({ action: z.literal('configure'), settings: TREADMILL_SETTINGS_CHANGE }),
  z.strictObject({ action: z.literal('mark_lubricated') }),
  z.strictObject({ action: z.literal('take_over') }),
  z.strictObject({ action: z.literal('forget_session'), sessionId: z.string().min(1) }),
  z.strictObject({ action: z.literal('raw_log'), enabled: z.boolean() }),
]);

export type TreadmillAction = z.infer<typeof TREADMILL_ACTION>;
