import { brushSettingsOf, type DiscoveredDevice, type JsonValue } from '@smarteverything/domain';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import type { LocalDriverDefinition, Observed } from '../driver-types';
import { brushCapabilities } from './capabilities';
import { SONICARE_DRIVER, effectiveIdentity, entryConfigOf, entryProfileOf } from './config';

const LINK_KEYS = [
  'linkPhase',
  'linkRssi',
  'linkDetail',
  'lastHeardAt',
  'fetching',
  'errorPersistent',
  'errorVolatile',
  'headRing',
  'nfcVersion',
  'nfcUrl',
  'calibration',
  'easyStart',
  'sensorMask',
  'settingsBits',
  'handleClock',
  'firmware',
  'lifetimeSessions',
  'latestStoredId',
  'faultBaseline',
] as const;

function linkState(observed: Observed): Record<string, JsonValue> {
  return Object.fromEntries(LINK_KEYS.map((key) => [key, observed[key] ?? null]));
}

function describe(entry: LocalDeviceEntry, observed: Observed): DiscoveredDevice {
  const config = entryConfigOf(entry);
  const identity = effectiveIdentity(config.identity, brushSettingsOf(config.settings));
  const profile = entryProfileOf(entry);
  return {
    provider: 'local',
    externalId: entry.externalId,
    parentExternalId: null,
    kind: 'other',
    name: entry.name,
    model: config.model,
    manufacturer: 'philips',
    room: config.room,
    online: observed['linkPhase'] === 'linked',
    capabilities: brushCapabilities(profile, identity),
    details: {
      transport: 'bluetooth',
      driver: SONICARE_DRIVER,
      family: profile.family,
      stack: profile.stack,
      updates:
        'The phone that holds the Bluetooth link reports each frame to this hub; the handle sleeps between uses and is never polled',
      ...linkState(observed),
    },
  };
}

export const sonicareDriver: LocalDriverDefinition = {
  id: SONICARE_DRIVER,
  provider: 'local',
  describe,
  adverts: null,
};
