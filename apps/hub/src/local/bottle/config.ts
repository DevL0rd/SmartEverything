import {
  BOTTLE_BINDING,
  BOTTLE_BODY,
  BOTTLE_CALIBRATION,
  BOTTLE_DRIVER,
  BOTTLE_FILTER_CONFIG,
  BOTTLE_QUIET_CHANGE,
  BOTTLE_REMINDER_CHANGE,
  JSON_VALUE,
  type JsonValue,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import type { Store } from '../../store/store';

export { BOTTLE_DRIVER };

export const BOTTLE_ENTRY_CONFIG = z.strictObject({
  model: z.string().min(1),
  room: z.string().nullable(),
  body: BOTTLE_BODY,
  calibration: BOTTLE_CALIBRATION.nullable(),
  filter: BOTTLE_FILTER_CONFIG,
  binding: BOTTLE_BINDING,
  desired: z.strictObject({
    reminder: BOTTLE_REMINDER_CHANGE.nullable(),
    quiet: BOTTLE_QUIET_CHANGE.nullable(),
  }),
  unsupported: z.strictObject({
    firmware: z.string().nullable(),
    requests: z.array(z.string()),
  }),
});

export type BottleEntryConfig = z.infer<typeof BOTTLE_ENTRY_CONFIG>;

const STORED_CONFIG = z.record(z.string(), JSON_VALUE);

export function entryConfigOf(entry: Pick<LocalDeviceEntry, 'config'>): BottleEntryConfig {
  return BOTTLE_ENTRY_CONFIG.parse(entry.config);
}

export function saveConfig(
  store: Pick<Store, 'localDevices'>,
  entry: Pick<LocalDeviceEntry, 'externalId'>,
  config: BottleEntryConfig,
): void {
  store.localDevices.updateConfig(entry.externalId, storedConfigOf(config));
}

export function storedConfigOf(config: BottleEntryConfig): Record<string, JsonValue> {
  return STORED_CONFIG.parse(BOTTLE_ENTRY_CONFIG.parse(config));
}
