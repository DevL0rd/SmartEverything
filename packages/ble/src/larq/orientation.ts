import type { BottleOrientation, BottleOrientationGate } from '@smarteverything/domain';
import { decodeResponse, expectBody } from './envelope';
import { decodeAccelerometer, type Accelerometer } from './responses';

export const ORIENTATION_TOLERANCE_G = 0.15;

export function orientationOf(
  reading: Accelerometer,
  tolerance: number = ORIENTATION_TOLERANCE_G,
): BottleOrientation {
  const flat = Math.abs(reading.x) <= tolerance && Math.abs(reading.y) <= tolerance;
  if (flat && reading.z >= 1 - tolerance) {
    return 'upright';
  }
  if (flat && reading.z <= tolerance - 1) {
    return 'upside_down';
  }
  const sideways = Math.max(Math.abs(reading.x), Math.abs(reading.y)) >= 1 - tolerance;
  return sideways && Math.abs(reading.z) <= tolerance ? 'side' : 'tilted';
}

export function isStill(
  reading: Accelerometer,
  tolerance: number = ORIENTATION_TOLERANCE_G,
): boolean {
  return Math.abs(Math.hypot(reading.x, reading.y, reading.z) - 1) <= tolerance;
}

export function gateAllows(frame: Uint8Array, gate: BottleOrientationGate): boolean {
  const response = decodeResponse(frame);
  if (response.code !== 'success') {
    return false;
  }
  expectBody(response, 'RequestGetCapAccelerometerState');
  const reading = decodeAccelerometer(frame);
  return orientationOf(reading, gate.toleranceG) === 'upright' && isStill(reading, gate.toleranceG);
}
