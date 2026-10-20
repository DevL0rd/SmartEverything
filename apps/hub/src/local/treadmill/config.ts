import { identityOf } from '@smarteverything/ble';
import {
  TREADMILL_FAMILIES,
  TREADMILL_GATT_DUMP,
  TREADMILL_IDENTITY,
  settingsOf,
  type TreadmillIdentity,
  type TreadmillSettings,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';

export const TREADMILL_DRIVER = 'kingsmith_treadmill';

const TREADMILL_ENTRY_CONFIG = z.object({
  model: z.string().min(1),
  room: z.string().nullable(),
  family: z.enum(TREADMILL_FAMILIES),
  gatt: TREADMILL_GATT_DUMP,
  settings: z.unknown(),
});

export type TreadmillEntryConfig = z.infer<typeof TREADMILL_ENTRY_CONFIG>;

export function entryConfigOf(entry: LocalDeviceEntry): TreadmillEntryConfig {
  return TREADMILL_ENTRY_CONFIG.parse(entry.config);
}

export function entrySettingsOf(entry: LocalDeviceEntry): TreadmillSettings {
  return settingsOf(entryConfigOf(entry).settings);
}

export function identityOfDevice(
  gatt: TreadmillEntryConfig['gatt'],
  stored: unknown,
): TreadmillIdentity {
  const fresh = identityOf(gatt);
  const learned = TREADMILL_IDENTITY.safeParse(stored);
  if (!learned.success) {
    return fresh;
  }
  const { motorVersion, protocol, capabilityWord, modelCode, functionBitmap } = learned.data;
  return { ...fresh, motorVersion, protocol, capabilityWord, modelCode, functionBitmap };
}
