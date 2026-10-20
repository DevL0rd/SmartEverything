import {
  BOTTLE_DRIVER,
  maskedSerial,
  type DiscoveredDevice,
  type JsonValue,
} from '@smarteverything/domain';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import type { LocalDriverDefinition, Observed } from '../driver-types';
import { BOTTLE_CAPABILITIES } from './capabilities';
import { entryConfigOf } from './config';

const DETAIL_KEYS = [
  'bridge',
  'lastSeenAt',
  'lastSyncAt',
  'lastSyncOutcome',
  'firmware',
  'link',
] as const;

function detailsOf(observed: Observed): Record<string, JsonValue> {
  return Object.fromEntries(DETAIL_KEYS.map((key) => [key, observed[key] ?? null]));
}

function describe(entry: LocalDeviceEntry, observed: Observed): DiscoveredDevice {
  const config = entryConfigOf(entry);
  return {
    provider: 'local',
    externalId: entry.externalId,
    parentExternalId: null,
    kind: 'other',
    name: entry.name,
    model: config.model,
    manufacturer: 'larq',
    room: config.room,
    online: true,
    capabilities: [...BOTTLE_CAPABILITIES],
    details: {
      transport: 'bluetooth',
      driver: BOTTLE_DRIVER,
      serial: maskedSerial(entry.address),
      body: config.body,
      personId: config.binding.profileId,
      updates:
        'The phone that syncs the bottle reads the cap whenever it wakes and reports here; the cap is never polled',
      ...detailsOf(observed),
    },
  };
}

export const larqBottleDriver: LocalDriverDefinition = {
  id: BOTTLE_DRIVER,
  provider: 'local',
  describe,
  adverts: null,
};
