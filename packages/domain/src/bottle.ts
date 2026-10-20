import { z } from 'zod';

export const BOTTLE_DRIVER = 'larq_bottle';

export const BOTTLE_MODEL_PREFIX = 'larq.bottle.';

export const BOTTLE_SERIAL = z
  .string()
  .regex(/^[0-9A-F]{16}$/, 'sixteen upper-case hexadecimal digits');

export const BOTTLE_BODIES = [680, 1000] as const;

export const BOTTLE_BODY = z.union([z.literal(680), z.literal(1000)]);

export type BottleBody = z.infer<typeof BOTTLE_BODY>;

export const BOTTLE_UI_STATES = [
  'on',
  'fault',
  'uv_maintenance',
  'uv_normal',
  'uv_adventure',
  'paired',
  'hydration_reminder',
  'battery_low',
  'charging',
  'charged',
  'uv_interlock',
  'bottle_calibration',
  'tof_measurement',
  'turn_off',
  'factory_reset',
  'all_off',
  'locked',
  'qc',
] as const;

export type BottleUiState = (typeof BOTTLE_UI_STATES)[number];

export const BOTTLE_STATE_OPTIONS = [...BOTTLE_UI_STATES, 'unknown'] as const;

export const BOTTLE_TRIGGERS = [
  'request',
  'interval',
  'cap',
  'cap_on_flap',
  'cap_on_flap_open_sip',
] as const;

export type BottleTrigger = (typeof BOTTLE_TRIGGERS)[number];

export const BOTTLE_UV_MODES = ['maintenance', 'normal', 'adventure'] as const;

export type BottleUvMode = (typeof BOTTLE_UV_MODES)[number];

export const BOTTLE_UV_STARTS = ['normal', 'adventure'] as const;

export type BottleUvStart = (typeof BOTTLE_UV_STARTS)[number];

export const BOTTLE_FAULT_TYPES = [
  'uv_overtemp',
  'uv_led_short',
  'uv_led_open',
  'battery_temp',
  'battery_open',
  'battery_short',
  'ambient_light',
] as const;

export type BottleFaultType = (typeof BOTTLE_FAULT_TYPES)[number];

export const BOTTLE_REMINDER_STATES = ['off', 'interval_fixed', 'interval_adaptive'] as const;

export const BOTTLE_QUIET_STATES = ['off', 'on', 'auto'] as const;

export const BOTTLE_LINKS = ['asleep', 'syncing', 'synced', 'sync_failed', 'no_phone'] as const;

export type BottleLink = (typeof BOTTLE_LINKS)[number];

export const BOTTLE_CHARGING = ['charging', 'charged', 'not_charging'] as const;

export type BottleCharging = (typeof BOTTLE_CHARGING)[number];

export const BOTTLE_ORIENTATIONS = ['upright', 'side', 'upside_down', 'tilted'] as const;

export type BottleOrientation = (typeof BOTTLE_ORIENTATIONS)[number];

export const BOTTLE_LOGS = [
  'tof',
  'activation',
  'state',
  'fault',
  'activation_adc',
  'charging_adc',
] as const;

export type BottleLog = (typeof BOTTLE_LOGS)[number];

export const BOTTLE_FIRST_VALID_YEAR = 2024;

export const BOTTLE_CLOCK_SLACK_MS = 5 * 60_000;

export const BOTTLE_DRINK_MIN_ML = 15;

export const BOTTLE_FILL_MIN_ML = 100;

export const BOTTLE_REMINDER_PRESETS = [15, 20, 30, 45, 60, 90, 120] as const;

export const BOTTLE_FILTER_LIMITS = {
  essential: { label: 'Essential', litres: 94, days: 60 },
  advanced: { label: 'Advanced', litres: 151, days: 60 },
} as const;

export type BottleFilterType = keyof typeof BOTTLE_FILTER_LIMITS;

export const BOTTLE_LOW_BATTERY_PCT = 20;

export class BottleSerialError extends Error {
  override readonly name = 'BottleSerialError';
}

export function bottleExternalId(serial: string): string {
  return `${BOTTLE_DRIVER}:${BOTTLE_SERIAL.parse(serial)}`;
}

export function bottleSerialOf(externalId: string): string {
  const prefix = `${BOTTLE_DRIVER}:`;
  const parsed = BOTTLE_SERIAL.safeParse(
    externalId.startsWith(prefix) ? externalId.slice(prefix.length) : '',
  );
  if (!parsed.success) {
    throw new BottleSerialError(`${externalId} is not a LARQ bottle id (${prefix}<serial>).`);
  }
  return parsed.data;
}

export function maskedSerial(serial: string): string {
  return `…${serial.slice(-4)}`;
}

const HEX = z.string().regex(/^(?:[0-9a-f]{2})*$/, 'lower-case hexadecimal bytes');

const MOMENT = z.iso.datetime({ offset: true });

export const BOTTLE_ORIENTATION_GATE = z.strictObject({
  kind: z.literal('upright_still'),
  toleranceG: z.number().positive(),
});

export type BottleOrientationGate = z.infer<typeof BOTTLE_ORIENTATION_GATE>;

export const BOTTLE_GATT_READS = ['battery', 'device_information'] as const;

export const BOTTLE_PLAN_STEP = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('request'),
    name: z.string().min(1),
    requestHex: HEX.min(2),
    gate: BOTTLE_ORIENTATION_GATE.nullable(),
  }),
  z.strictObject({ kind: z.literal('set_time'), name: z.string().min(1) }),
  z.strictObject({
    kind: z.literal('log'),
    name: z.string().min(1),
    log: z.enum(BOTTLE_LOGS),
    fromTimestamp: z.int().nonnegative(),
    limit: z.int().min(1).max(10),
  }),
  z.strictObject({
    kind: z.literal('gatt_read'),
    name: z.string().min(1),
    what: z.enum(BOTTLE_GATT_READS),
  }),
]);

export type BottlePlanStep = z.infer<typeof BOTTLE_PLAN_STEP>;

export const BOTTLE_SYNC_PLAN = z.strictObject({
  serial: BOTTLE_SERIAL,
  steps: z.array(BOTTLE_PLAN_STEP).min(1),
});

export type BottleSyncPlan = z.infer<typeof BOTTLE_SYNC_PLAN>;

export const BOTTLE_LINK_TIMING = {
  connectSeconds: 15,
  scanSeconds: 10,
  requestSeconds: 4,
  retries: 2,
  mtu: 247,
} as const;

export const PHONE_BOTTLE = z.strictObject({
  deviceId: z.uuid(),
  serial: BOTTLE_SERIAL,
  name: z.string().min(1),
  plan: BOTTLE_SYNC_PLAN,
});

export type PhoneBottle = z.infer<typeof PHONE_BOTTLE>;

export const PHONE_BOTTLES = z.strictObject({ bottles: z.array(PHONE_BOTTLE) });

export type PhoneBottles = z.infer<typeof PHONE_BOTTLES>;

export const BOTTLE_DEVICE_INFORMATION = z.strictObject({
  manufacturer: z.string().nullable(),
  model: z.string().nullable(),
  serial: z.string().nullable(),
  firmware: z.string().nullable(),
  hardware: z.string().nullable(),
  software: z.string().nullable(),
});

export type BottleDeviceInformation = z.infer<typeof BOTTLE_DEVICE_INFORMATION>;

export const BOTTLE_SYNC_OUTCOMES = [
  'ok',
  'disconnected',
  'asleep',
  'refused',
  'unreadable',
] as const;

export const BOTTLE_SYNC_TRIGGERS = ['wake', 'action'] as const;

export const BOTTLE_RESPONSE = z.strictObject({
  name: z.string().min(1),
  at: MOMENT,
  hex: HEX.nullable(),
  timedOut: z.boolean(),
});

export type BottleResponse = z.infer<typeof BOTTLE_RESPONSE>;

export const BOTTLE_BATTERY_READ = z.strictObject({
  at: MOMENT,
  pct: z.int().min(0).max(100),
  pushed: z.boolean(),
});

export const BOTTLE_SYNC_UPLOAD = z.strictObject({
  trigger: z.enum(BOTTLE_SYNC_TRIGGERS),
  startedAt: MOMENT,
  endedAt: MOMENT,
  outcome: z.enum(BOTTLE_SYNC_OUTCOMES),
  detail: z.string().nullable(),
  rssi: z.int().min(-127).max(20).nullable(),
  dis: BOTTLE_DEVICE_INFORMATION.nullable(),
  batteryReads: z.array(BOTTLE_BATTERY_READ),
  responses: z.array(BOTTLE_RESPONSE),
});

export type BottleSyncUpload = z.infer<typeof BOTTLE_SYNC_UPLOAD>;

export const BOTTLE_SYNC_RESULT = z.strictObject({
  accepted: z.int().nonnegative(),
  plan: BOTTLE_SYNC_PLAN,
});

export type BottleSyncResult = z.infer<typeof BOTTLE_SYNC_RESULT>;

export const BOTTLE_PUSH_ACTIONS = [
  'sync_now',
  'measure',
  'read_sensors',
  'read_orientation',
  'uv_stop',
  'uv_start',
] as const;

export type BottlePushAction = (typeof BOTTLE_PUSH_ACTIONS)[number];

export const BOTTLE_ACTION_ANSWER = z.strictObject({
  requestId: z.string().min(1),
  ok: z.boolean(),
  detail: z.string(),
});

export type BottleActionAnswer = z.infer<typeof BOTTLE_ACTION_ANSWER>;

export const BOTTLE_ACTION_RESULT = z.strictObject({
  ok: z.boolean(),
  detail: z.string(),
});

export type BottleActionResult = z.infer<typeof BOTTLE_ACTION_RESULT>;

export const ASLEEP_DETAIL = 'The bottle is asleep. Tap the cap and try again.';

export const BOTTLE_CURVE = z.strictObject({
  coefficients: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]),
  tofMaxMm: z.number().positive(),
  maxMl: z.number().positive(),
});

export type BottleCurve = z.infer<typeof BOTTLE_CURVE>;

export const BOTTLE_CLASSIFIER_STATE = z.strictObject({
  lastCalc: z.number().nullable(),
  lastCounted: z.number().nullable(),
  lastSkipped: z.number().nullable(),
  previousDistanceMm: z.number().nullable(),
  afterFill: z.boolean(),
});

export type BottleClassifierState = z.infer<typeof BOTTLE_CLASSIFIER_STATE>;

export const BOTTLE_VERDICTS = [
  'accepted',
  'out_of_range',
  'weak',
  'slosh',
  'clock_invalid',
] as const;

export type BottleVerdict = (typeof BOTTLE_VERDICTS)[number];

export const BOTTLE_CALIBRATION_POINT = z.strictObject({
  distanceMm: z.number().positive().max(400),
  ml: z.number().min(0).max(1200),
});

export type BottleCalibrationPoint = z.infer<typeof BOTTLE_CALIBRATION_POINT>;

export const BOTTLE_CALIBRATION = z.strictObject({
  points: z.array(BOTTLE_CALIBRATION_POINT).min(5),
  curve: BOTTLE_CURVE,
  rmseMl: z.number().nonnegative(),
  fittedAt: MOMENT,
});

export type BottleCalibration = z.infer<typeof BOTTLE_CALIBRATION>;
