import { z } from 'zod';
import { BOTTLE_BODY } from './bottle';
import { BOTTLE_DAY } from './bottle-days';
import {
  BOTTLE_BATTERY_POINT,
  BOTTLE_CHARGE,
  BOTTLE_FAULT_ROW,
  BOTTLE_UV_ROW,
} from './bottle-rows';
import {
  BOTTLE_FILTER_CONFIG,
  BOTTLE_FILTER_STATUS,
  BOTTLE_QUIET,
  BOTTLE_REMINDER,
  BOTTLE_REMINDER_CHANGE,
  BOTTLE_QUIET_CHANGE,
} from './bottle-settings';
import { BOTTLE_PERSON } from './bottle-views';

const MOMENT = z.iso.datetime({ offset: true });

const COUNT = z.int().nonnegative();

export const BOTTLE_CARE_VIEW = z.strictObject({
  view: z.literal('care'),
  uvDays: z.array(
    z.strictObject({ day: BOTTLE_DAY, maintenance: COUNT, normal: COUNT, adventure: COUNT }),
  ),
  uvRecent: z.array(BOTTLE_UV_ROW),
  battery: z.strictObject({
    pct: z.int().min(0).max(100).nullable(),
    alertPct: COUNT,
    lockoutPct: COUNT,
    points: z.array(BOTTLE_BATTERY_POINT),
    charges: z.array(BOTTLE_CHARGE),
    chargeCycles: COUNT,
    daysLeft: COUNT.nullable(),
  }),
  filter: BOTTLE_FILTER_STATUS.nullable(),
  faults: z.array(BOTTLE_FAULT_ROW),
});

export type BottleCareView = z.infer<typeof BOTTLE_CARE_VIEW>;

const SYNC_ROW = z.strictObject({
  startedAt: MOMENT,
  endedAt: MOMENT,
  trigger: z.string().min(1),
  outcome: z.string().min(1),
  detail: z.string().nullable(),
  requests: COUNT,
  answered: COUNT,
  rssi: z.number().nullable(),
});

export type BottleSyncRow = z.infer<typeof SYNC_ROW>;

export const BOTTLE_SETTINGS_VIEW = z.strictObject({
  view: z.literal('settings'),
  deviceId: z.uuid(),
  name: z.string().min(1),
  room: z.string().nullable(),
  person: BOTTLE_PERSON.nullable(),
  body: BOTTLE_BODY,
  goalMl: z.number().nonnegative(),
  reminder: BOTTLE_REMINDER.nullable(),
  quiet: BOTTLE_QUIET.nullable(),
  pending: z.strictObject({
    reminder: BOTTLE_REMINDER_CHANGE.nullable(),
    quiet: BOTTLE_QUIET_CHANGE.nullable(),
  }),
  filterConfig: BOTTLE_FILTER_CONFIG,
  filter: BOTTLE_FILTER_STATUS.nullable(),
  calibration: z
    .strictObject({ fittedAt: MOMENT, rmseMl: z.number().nonnegative(), points: COUNT })
    .nullable(),
  holder: z.strictObject({ name: z.string().min(1), isYou: z.boolean() }).nullable(),
  syncs: z.array(SYNC_ROW),
  mayEdit: z.boolean(),
  mayBind: z.boolean(),
});

export type BottleSettingsView = z.infer<typeof BOTTLE_SETTINGS_VIEW>;

const SENSOR = z.strictObject({ text: z.string(), at: MOMENT });

export const BOTTLE_DIAGNOSTICS_VIEW = z.strictObject({
  view: z.literal('diagnostics'),
  device: z.strictObject({
    manufacturer: z.string().nullable(),
    model: z.string().nullable(),
    serial: z.string().min(1),
    firmware: z.string().nullable(),
    hardware: z.string().nullable(),
    software: z.string().nullable(),
    historyFrom: MOMENT.nullable(),
  }),
  signal: z.strictObject({ rssi: z.number().nullable(), kcps: z.array(COUNT) }),
  clockDriftSeconds: z.number().nullable(),
  orientation: SENSOR.nullable(),
  sensors: z.strictObject({
    ambient: SENSOR.nullable(),
    lid: SENSOR.nullable(),
    sip: SENSOR.nullable(),
    seated: SENSOR.nullable(),
  }),
  quality: z.strictObject({
    accepted: COUNT,
    small: COUNT,
    rejected: COUNT,
    clockInvalid: COUNT,
  }),
  capSettings: z.array(z.strictObject({ label: z.string(), value: z.string() })),
  uvLed: z.strictObject({
    currentMa: z.array(z.number()),
    volt: z.array(z.number()),
    ohm: z.array(z.number()),
  }),
  unsupported: z.array(z.string()),
  lid: z.array(z.strictObject({ from: MOMENT, to: MOMENT })),
  presence: z.array(z.strictObject({ from: MOMENT, to: MOMENT })),
});

export type BottleDiagnosticsView = z.infer<typeof BOTTLE_DIAGNOSTICS_VIEW>;
