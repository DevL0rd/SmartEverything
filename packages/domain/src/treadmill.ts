import { z } from 'zod';

export const BELT_STATES = [
  'idle',
  'countdown',
  'running',
  'paused',
  'stopped',
  'standby',
  'safety_stop',
  'fault',
] as const;

export type BeltState = (typeof BELT_STATES)[number];

export const BELT_MODES = ['manual', 'auto', 'standby', 'walk', 'hiit', 'fat_burn'] as const;

export type BeltMode = (typeof BELT_MODES)[number];

export const BELT_LINK_PHASES = [
  'not_linked',
  'searching',
  'connecting',
  'linked',
  'busy',
  'lost',
] as const;

export type BeltLinkPhase = (typeof BELT_LINK_PHASES)[number];

export const BELT_COMMANDS = ['start', 'stop', 'pause', 'resume'] as const;

export type BeltCommand = (typeof BELT_COMMANDS)[number];

export const PANEL_BUTTONS = ['up', 'down', 'stop', 'mode'] as const;

export type PanelButton = (typeof PANEL_BUTTONS)[number];

export const TREADMILL_FAMILIES = ['wilink', 'ftms_odm', 'ftms_supplement', 'ftms'] as const;

export type TreadmillFamily = (typeof TREADMILL_FAMILIES)[number];

export const PAD_GOAL_KINDS = ['none', 'distance', 'calories', 'time'] as const;

export type PadGoalKind = (typeof PAD_GOAL_KINDS)[number];

export const PAD_SENSITIVITIES = ['high', 'medium', 'low'] as const;

export type PadSensitivity = (typeof PAD_SENSITIVITIES)[number];

export const PAD_DISPLAY_FIELDS = ['time', 'speed', 'distance', 'calories', 'steps'] as const;

export type PadDisplayField = (typeof PAD_DISPLAY_FIELDS)[number];

export const SPEED_ZONES = ['walk', 'jog', 'run'] as const;

export type SpeedZone = (typeof SPEED_ZONES)[number];

export const WALK_BELOW_KMH = 6;

export const RUN_ABOVE_KMH = 8;

export const MAX_BELT_KMH = 15;

export const MIN_BELT_KMH = 1;

export const BELT_STEP_KMH = 0.1;

export const SESSION_KINDS = ['walk', 'jog', 'run', 'intervals'] as const;

export type SessionKind = (typeof SESSION_KINDS)[number];

export const SESSION_SOURCES = ['live', 'pad_summary', 'pad_record'] as const;

export type SessionSource = (typeof SESSION_SOURCES)[number];

export const TREADMILL_EXERCISE_CODE = 57;

export const TREADMILL_SOURCE_APP = 'smarteverything.treadmill';

export const HEX = z.string().regex(/^(?:[0-9a-f]{2})*$/, 'lower-case hexadecimal bytes');

export const GATT_UUID = z
  .string()
  .regex(
    /^(?:[0-9a-f]{4}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/,
    'a lower-case 16-bit or 128-bit Bluetooth UUID',
  );

export const GATT_PROPERTIES = [
  'read',
  'write',
  'write_no_response',
  'notify',
  'indicate',
] as const;

export const TREADMILL_GATT_CHARACTERISTIC = z.strictObject({
  uuid: GATT_UUID,
  properties: z.array(z.enum(GATT_PROPERTIES)),
  value: HEX.optional(),
});

export const TREADMILL_GATT_SERVICE = z.strictObject({
  uuid: GATT_UUID,
  characteristics: z.array(TREADMILL_GATT_CHARACTERISTIC),
});

export const TREADMILL_GATT_DUMP = z.strictObject({
  name: z.string().min(1),
  services: z.array(TREADMILL_GATT_SERVICE).min(1),
});

export type TreadmillGattDump = z.infer<typeof TREADMILL_GATT_DUMP>;

export const READABLE_SERVICES = ['1800', '180a', '1826'] as const;

export const PAD_PREFERENCES = z.strictObject({
  goalKind: z.enum(PAD_GOAL_KINDS).optional(),
  goalValue: z.number().int().nonnegative().optional(),
  maxSpeedKmh: z.number().positive().optional(),
  startSpeedKmh: z.number().positive().optional(),
  autoStart: z.boolean().optional(),
  sensitivity: z.enum(PAD_SENSITIVITIES).optional(),
  displayFields: z.array(z.enum(PAD_DISPLAY_FIELDS)).optional(),
  units: z.enum(['km', 'mi']).optional(),
  childLock: z.boolean().optional(),
  autoStopSeconds: z.number().int().nonnegative().optional(),
  buzzer: z.boolean().optional(),
  light: z.boolean().optional(),
  ledColor: z.number().int().nonnegative().optional(),
  paceDisplay: z.boolean().optional(),
});

export type PadPreferences = z.infer<typeof PAD_PREFERENCES>;

export const HEART_RATE_SOURCES = ['grips', 'watch'] as const;

export type HeartRateSource = (typeof HEART_RATE_SOURCES)[number];

export const TREADMILL_IDENTITY = z.strictObject({
  manufacturer: z.string().nullable(),
  model: z.string().nullable(),
  serial: z.string().nullable(),
  firmware: z.string().nullable(),
  software: z.string().nullable(),
  hardware: z.string().nullable(),
  motorVersion: z.number().int().nullable(),
  protocol: z.number().int().nullable(),
  capabilityWord: z.number().int().nullable(),
  modelCode: z.number().int().nullable().default(null),
  functionBitmap: HEX.nullable(),
  speedMinKmh: z.number().nullable(),
  speedMaxKmh: z.number().nullable(),
  speedStepKmh: z.number().nullable(),
  inclineMinPercent: z.number().nullable(),
  inclineMaxPercent: z.number().nullable(),
  inclineStepPercent: z.number().nullable().default(null),
  features: z.array(z.string()),
  targets: z.array(z.string()),
});

export type TreadmillIdentity = z.infer<typeof TREADMILL_IDENTITY>;

export const TREADMILL_WRITE_STEP = z.strictObject({
  characteristic: GATT_UUID,
  service: GATT_UUID,
  hex: HEX,
  writeType: z.enum(['with_response', 'without_response']),
  pauseAfterMs: z.number().int().nonnegative(),
});

export type TreadmillWriteStep = z.infer<typeof TREADMILL_WRITE_STEP>;

export const LINK_DELIVERY = z.strictObject({
  characteristic: GATT_UUID,
  service: GATT_UUID,
  mode: z.enum(['notify', 'indicate']),
  coalescePrefix: HEX.nullable(),
  changeByte: z.number().int().nonnegative().nullable(),
});

export const LINK_WRITE = z.strictObject({
  service: GATT_UUID,
  characteristic: GATT_UUID,
  writeType: z.enum(['with_response', 'without_response']),
});

export const LINK_PLAN = z.strictObject({
  deviceId: z.uuid(),
  address: z.string().min(1),
  family: z.enum(TREADMILL_FAMILIES),
  subscriptions: z.array(LINK_DELIVERY).min(1),
  control: LINK_WRITE.nullable(),
  preamble: z.strictObject({ characteristic: GATT_UUID, hex: HEX }).nullable(),
  cccdPacingMs: z.number().int().nonnegative(),
  writePacingMs: z.number().int().nonnegative(),
  initial: z.array(TREADMILL_WRITE_STEP),
  statusRequest: z
    .strictObject({
      hex: HEX,
      everyMs: z.number().int().positive(),
      stateByte: z.number().int().nonnegative(),
      activeValues: z.array(z.number().int()),
      settleRequests: z.number().int().positive(),
    })
    .nullable(),
  autoConnect: z.boolean(),
  presence: z.boolean(),
  holder: z.boolean(),
});

export type TreadmillLinkPlan = z.infer<typeof LINK_PLAN>;

export const PHONE_TREADMILLS = z.strictObject({ treadmills: z.array(LINK_PLAN) });

export type PhoneTreadmills = z.infer<typeof PHONE_TREADMILLS>;

export const TREADMILL_FRAME = z.strictObject({
  at: z.iso.datetime({ offset: true }),
  characteristic: GATT_UUID,
  hex: HEX,
});

export type TreadmillFrame = z.infer<typeof TREADMILL_FRAME>;

export const TREADMILL_LINK_REPORT = z.strictObject({
  phase: z.enum(BELT_LINK_PHASES),
  rssi: z.number().int().nullable(),
  reconnects: z.number().int().nonnegative(),
  detail: z.string().nullable(),
});

export type TreadmillLinkReport = z.infer<typeof TREADMILL_LINK_REPORT>;

export const TREADMILL_FRAME_BATCH = z.strictObject({
  frames: z.array(TREADMILL_FRAME),
  link: TREADMILL_LINK_REPORT,
});

export type TreadmillFrameBatch = z.infer<typeof TREADMILL_FRAME_BATCH>;

export const TREADMILL_BATCH_RESULT = z.strictObject({
  live: z.boolean(),
  accepted: z.number().int().nonnegative(),
});

export type TreadmillBatchResult = z.infer<typeof TREADMILL_BATCH_RESULT>;

export const TREADMILL_ACTION_ANSWER = z.strictObject({
  requestId: z.string().min(1),
  ok: z.boolean(),
  detail: z.string(),
});

export type TreadmillActionAnswer = z.infer<typeof TREADMILL_ACTION_ANSWER>;

export const TREADMILL_ACTION_RESULT = z.strictObject({
  ok: z.boolean(),
  detail: z.string(),
});

export type TreadmillActionResult = z.infer<typeof TREADMILL_ACTION_RESULT>;

export function zoneOf(speedKmh: number): SpeedZone {
  if (speedKmh < WALK_BELOW_KMH) {
    return 'walk';
  }
  return speedKmh <= RUN_ABOVE_KMH ? 'jog' : 'run';
}

export function paceSecondsPerKm(speedKmh: number): number | null {
  return speedKmh > 0 ? 3600 / speedKmh : null;
}

export function treadmillExternalId(address: string): string {
  return `kingsmith_treadmill:${address}`;
}
