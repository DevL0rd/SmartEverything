import type { BrushPressure } from '@smarteverything/domain';
import { uint16 } from '../bytes';
import type { BrushDelta } from './delta';

export const SENSOR_FRAME_PRESSURE = 1;

export const SENSOR_FRAME_TEMPERATURE = 2;

export const SENSOR_FRAME_IMU = 4;

const PRESSURE_STATES: readonly BrushPressure[] = ['no_contact', 'optimal', 'too_high'];

const VALUE_FRAME_LENGTH = 7;

const STATE_FRAME_LENGTH = 5;

const TEMPERATURE_FRAME_LENGTH = 6;

function signed16(bytes: Uint8Array, offset: number): number {
  const value = uint16(bytes, offset);
  return value > 0x7fff ? value - 0x10000 : value;
}

function signed8(byte: number): number {
  return byte > 0x7f ? byte - 0x100 : byte;
}

function pressureOf(bytes: Uint8Array): BrushDelta {
  if (bytes.length >= VALUE_FRAME_LENGTH) {
    const state = PRESSURE_STATES[bytes[6] ?? 0];
    return state === undefined
      ? { pressureValue: signed16(bytes, 4) }
      : { pressureValue: signed16(bytes, 4), pressure: state };
  }
  if (bytes.length >= STATE_FRAME_LENGTH) {
    const state = PRESSURE_STATES[bytes[4] ?? 0];
    return state === undefined ? {} : { pressure: state };
  }
  return {};
}

export function decodeSensorFrame(bytes: Uint8Array): BrushDelta {
  if (bytes.length < 2) {
    return {};
  }
  switch (uint16(bytes, 0)) {
    case SENSOR_FRAME_PRESSURE:
      return pressureOf(bytes);
    case SENSOR_FRAME_TEMPERATURE:
      return bytes.length >= TEMPERATURE_FRAME_LENGTH
        ? { temperatureC: signed8(bytes[5] ?? 0) }
        : {};
    case SENSOR_FRAME_IMU:
      return { sensorFrame: 'imu' };
    default:
      return {};
  }
}
