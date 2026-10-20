import { type DiscoveredDevice, type JsonValue } from '@smarteverything/domain';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import type { LocalDriverDefinition, Observed } from '../driver-types';
import { treadmillCapabilities } from './capabilities';
import { TREADMILL_DRIVER, entryConfigOf, identityOfDevice } from './config';

const LINK_KEYS = [
  'linkPhase',
  'linkRssi',
  'linkReconnects',
  'linkDetail',
  'lastHeardAt',
  'bridge',
  'reportedAt',
  'reportedBy',
  'pad',
  'fault',
  'walkerProfileId',
  'padRecordsRemaining',
  'latencyMs',
  'lastError',
  'rawLog',
] as const;

function linkState(observed: Observed): Record<string, JsonValue> {
  return Object.fromEntries(LINK_KEYS.map((key) => [key, observed[key] ?? null]));
}

function describe(entry: LocalDeviceEntry, observed: Observed): DiscoveredDevice {
  const config = entryConfigOf(entry);
  const known = identityOfDevice(config.gatt, observed['identity']);
  return {
    provider: 'local',
    externalId: entry.externalId,
    parentExternalId: null,
    kind: 'appliance',
    name: entry.name,
    model: config.model,
    manufacturer: 'kingsmith',
    room: config.room,
    online: observed['linkPhase'] === 'linked',
    capabilities: treadmillCapabilities(config.family, known),
    details: {
      transport: 'bluetooth',
      driver: TREADMILL_DRIVER,
      family: config.family,
      address: entry.address,
      identity: known,
      updates:
        'The phone that holds the Bluetooth link reports each frame to this hub; the belt is never polled when it is still',
      ...linkState(observed),
    },
  };
}

export const kingsmithTreadmillDriver: LocalDriverDefinition = {
  id: TREADMILL_DRIVER,
  provider: 'local',
  describe,
  adverts: null,
};
