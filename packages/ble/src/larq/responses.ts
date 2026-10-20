import { z } from 'zod';
import {
  POWER_SAVING_MODES,
  QUIET_STATES,
  REMINDER_STATES,
  TOF_DISPLAY_MODES,
  UI_STATES,
  nameOfCode,
} from './enums';
import { decodeResponse, expectBody } from './envelope';
import type { RequestName } from './names';
import {
  fieldsOf,
  readBool,
  readFixed32,
  readFloat,
  readMessage,
  readNumber,
  readSint,
  readVarint,
  type WireField,
} from './wire';

function bodyOf(frame: Uint8Array, request: RequestName): readonly WireField[] {
  return fieldsOf(expectBody(decodeResponse(frame), request));
}

function nestedOf(frame: Uint8Array, request: RequestName): readonly WireField[] {
  return readMessage(bodyOf(frame, request), 1);
}

const COUNT = z.int().nonnegative();

const NAME = z.string().min(1);

export const UI_STATE_READING = z.strictObject({
  state: NAME,
  stateCode: COUNT,
  powerSaving: NAME,
});

export type UiStateReading = z.infer<typeof UI_STATE_READING>;

export function decodeUiState(frame: Uint8Array): UiStateReading {
  const fields = bodyOf(frame, 'RequestGetCapUiState');
  return UI_STATE_READING.parse({
    state: nameOfCode(UI_STATES, readVarint(fields, 1)),
    stateCode: readVarint(fields, 1),
    powerSaving: nameOfCode(POWER_SAVING_MODES, readVarint(fields, 2)),
  });
}

export function decodeTimeSettings(frame: Uint8Array): { readonly epochMilliseconds: number } {
  return z.strictObject({ epochMilliseconds: z.int().nonnegative() }).parse({
    epochMilliseconds: readVarint(nestedOf(frame, 'RequestGetCapTimeSettings'), 1),
  });
}

export const TOF_STATE = z.strictObject({ distanceMm: COUNT, kcps: COUNT });

export type TofState = z.infer<typeof TOF_STATE>;

export function decodeTofState(frame: Uint8Array): TofState {
  const state = nestedOf(frame, 'RequestGetCapTofState');
  return TOF_STATE.parse({ distanceMm: readFixed32(state, 1), kcps: readFixed32(state, 2) });
}

export const TOF_SETTINGS = z.strictObject({
  mode: NAME,
  intervalTrigger: z.boolean(),
  intervalSeconds: COUNT,
  accelerometerCheckSeconds: COUNT,
  bottleSizeMl: COUNT,
  accelerometerTimeoutSeconds: COUNT,
});

export type TofSettings = z.infer<typeof TOF_SETTINGS>;

export function decodeTofSettings(frame: Uint8Array): TofSettings {
  const settings = nestedOf(frame, 'RequestGetCapTofSettings');
  return TOF_SETTINGS.parse({
    mode: nameOfCode(TOF_DISPLAY_MODES, readVarint(settings, 1)),
    intervalTrigger: readBool(settings, 2),
    intervalSeconds: readFixed32(settings, 3),
    accelerometerCheckSeconds: readFixed32(settings, 4),
    bottleSizeMl: readFixed32(settings, 5),
    accelerometerTimeoutSeconds: readFixed32(settings, 6),
  });
}

export const ACCELEROMETER = z.strictObject({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export type Accelerometer = z.infer<typeof ACCELEROMETER>;

export function decodeAccelerometer(frame: Uint8Array): Accelerometer {
  const state = nestedOf(frame, 'RequestGetCapAccelerometerState');
  return ACCELEROMETER.parse({
    x: readFloat(state, 1),
    y: readFloat(state, 2),
    z: readFloat(state, 3),
  });
}

export function decodeAmbientLight(frame: Uint8Array): { readonly lux: number } {
  const state = nestedOf(frame, 'RequestGetCapAmbientLightSensorState');
  return z.strictObject({ lux: z.number() }).parse({ lux: readFloat(state, 1) });
}

export const HALL_READING = z.strictObject({ timestamp: COUNT, closed: z.boolean() });

export function decodeHall(frame: Uint8Array): z.infer<typeof HALL_READING> {
  const state = nestedOf(frame, 'RequestGetCapHallEffectSensorState');
  return HALL_READING.parse({ timestamp: readVarint(state, 1), closed: readBool(state, 2) });
}

export const CAPACITIVE_READING = z.strictObject({ value: z.int(), active: z.boolean() });

export type CapacitiveReading = z.infer<typeof CAPACITIVE_READING>;

export function decodeCapacitive(
  frame: Uint8Array,
  request: 'RequestGetCapSipSensorState' | 'RequestGetCapBottleSensorState',
): CapacitiveReading {
  const state = nestedOf(frame, request);
  return CAPACITIVE_READING.parse({ value: readSint(state, 1), active: readBool(state, 2) });
}

export const REMINDER_SETTINGS = z.strictObject({
  state: NAME,
  startSeconds: COUNT,
  stopSeconds: COUNT,
  intervalSeconds: COUNT,
  colour: z.strictObject({
    red: z.number().min(0).max(1),
    green: z.number().min(0).max(1),
    blue: z.number().min(0).max(1),
    alpha: z.number().min(0).max(1),
  }),
});

export type ReminderSettings = z.infer<typeof REMINDER_SETTINGS>;

export function decodeReminder(frame: Uint8Array): ReminderSettings {
  const settings = nestedOf(frame, 'RequestGetCapHydroReminderSettings');
  const colour = readMessage(settings, 5);
  return REMINDER_SETTINGS.parse({
    state: nameOfCode(REMINDER_STATES, readVarint(settings, 1)),
    startSeconds: readNumber(settings, 2),
    stopSeconds: readNumber(settings, 3),
    intervalSeconds: readNumber(settings, 4),
    colour: {
      red: readFloat(colour, 1),
      green: readFloat(colour, 2),
      blue: readFloat(colour, 3),
      alpha: readFloat(colour, 4),
    },
  });
}

export const QUIET_SETTINGS = z.strictObject({
  state: NAME,
  startSeconds: COUNT,
  stopSeconds: COUNT,
  snoozeMinutes: COUNT,
});

export type QuietSettings = z.infer<typeof QUIET_SETTINGS>;

export function decodeQuiet(frame: Uint8Array): QuietSettings {
  const settings = nestedOf(frame, 'RequestGetCapDoNotDisturbSettings');
  return QUIET_SETTINGS.parse({
    state: nameOfCode(QUIET_STATES, readVarint(settings, 1)),
    startSeconds: readNumber(settings, 2),
    stopSeconds: readNumber(settings, 3),
    snoozeMinutes: readNumber(settings, 4),
  });
}

export const LOW_BATTERY_SETTINGS = z.strictObject({ alertPct: COUNT, lockoutPct: COUNT });

export function decodeLowBattery(frame: Uint8Array): z.infer<typeof LOW_BATTERY_SETTINGS> {
  const settings = nestedOf(frame, 'RequestGetCapLowBatterySettings');
  return LOW_BATTERY_SETTINGS.parse({
    alertPct: readFixed32(settings, 1),
    lockoutPct: readFixed32(settings, 2),
  });
}

const UV_PARAMETERS = z.strictObject({ cycle: COUNT, currentMa: COUNT });

export const UV_CONFIG = z.strictObject({
  maintenance: UV_PARAMETERS,
  normal: UV_PARAMETERS,
  adventure: UV_PARAMETERS,
});

export type UvConfig = z.infer<typeof UV_CONFIG>;

function uvParameters(config: readonly WireField[], number: number): z.infer<typeof UV_PARAMETERS> {
  const parameters = readMessage(config, number);
  return { cycle: readVarint(parameters, 1), currentMa: readVarint(parameters, 2) };
}

export function decodeUvConfig(frame: Uint8Array): UvConfig {
  const config = nestedOf(frame, 'RequestGetCapUvConfig');
  return UV_CONFIG.parse({
    maintenance: uvParameters(config, 1),
    normal: uvParameters(config, 2),
    adventure: uvParameters(config, 3),
  });
}

export const STATE_THRESHOLDS = z.strictObject({
  bottleSensorDelta: COUNT,
  sipSensorDelta: COUNT,
  ambientUvStartLux: COUNT,
  ambientUvOnLux: COUNT,
  ambientTofLux: COUNT,
  accelerometerOffset: z.number(),
});

export type StateThresholds = z.infer<typeof STATE_THRESHOLDS>;

export function decodeStateThresholds(frame: Uint8Array): StateThresholds {
  const settings = nestedOf(frame, 'RequestGetCapStateThresholdSettings');
  return STATE_THRESHOLDS.parse({
    bottleSensorDelta: readFixed32(settings, 1),
    sipSensorDelta: readFixed32(settings, 2),
    ambientUvStartLux: readFixed32(settings, 3),
    ambientUvOnLux: readFixed32(settings, 4),
    ambientTofLux: readFixed32(settings, 5),
    accelerometerOffset: readFloat(settings, 6),
  });
}

const PROTECTION = z.strictObject({
  overtempOhm: z.number(),
  openVolt: z.number(),
  shortVolt: z.number(),
});

export const ADC_PROTECTION = z.strictObject({ battery: PROTECTION, uvLed: PROTECTION });

export type AdcProtection = z.infer<typeof ADC_PROTECTION>;

function protectionOf(settings: readonly WireField[], number: number): z.infer<typeof PROTECTION> {
  const limits = readMessage(settings, number);
  return {
    overtempOhm: readFloat(limits, 1),
    openVolt: readFloat(limits, 2),
    shortVolt: readFloat(limits, 3),
  };
}

export function decodeAdcProtection(frame: Uint8Array): AdcProtection {
  const settings = nestedOf(frame, 'RequestGetCapAdcProtectionSettings');
  return ADC_PROTECTION.parse({
    battery: protectionOf(settings, 1),
    uvLed: protectionOf(settings, 2),
  });
}

export function decodeCalibrationSettings(frame: Uint8Array): { readonly timeoutSeconds: number } {
  const settings = nestedOf(frame, 'RequestGetCapCalibrationSettings');
  return z.strictObject({ timeoutSeconds: COUNT }).parse({
    timeoutSeconds: readFixed32(settings, 1),
  });
}
