import { deviceFamily, type DeviceRow, type JsonValue } from '@smarteverything/domain';
import { z } from 'zod';
import { TARGET_VALUE } from '../world-v3/refs';

export const CAMERA_FAMILIES = ['camera', 'doorbell'] as const;

const ID = z.string().min(1);

export const CAMERA_VALUE = z.union([
  ID,
  z.strictObject({ camera: ID }).transform((ref) => ref.camera),
]);

export const CAMERA_TARGET = TARGET_VALUE.transform((target) =>
  target.kind === 'room' && target.families === undefined
    ? { ...target, families: [...CAMERA_FAMILIES] }
    : target,
);

export interface Skipped {
  readonly deviceId: string;
  readonly reason: string;
}

export function isCamera(device: DeviceRow): boolean {
  const family = deviceFamily(device);
  return CAMERA_FAMILIES.some((known) => known === family);
}

export function skippedOutput(skipped: readonly Skipped[]): JsonValue {
  return skipped.map(({ deviceId, reason }) => ({ device: { device: deviceId }, reason }));
}
