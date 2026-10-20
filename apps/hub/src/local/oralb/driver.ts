import type { DiscoveredDevice, JsonValue } from '@smarteverything/domain';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import type { LocalDriverDefinition, Observed } from '../driver-types';
import { oralbCapabilities } from './capabilities';
import { ORALB_DRIVER, entryConfigOf, entryProfileOf, oralbSettingsOf } from './config';

const LINK_KEYS = [
  'linkPhase',
  'linkRssi',
  'linkDetail',
  'lastHeardAt',
  'protocol',
  'modelId',
  'firmware',
  'liveSource',
] as const;

function linkState(observed: Observed): Record<string, JsonValue> {
  return Object.fromEntries(LINK_KEYS.map((key) => [key, observed[key] ?? null]));
}

function describe(entry: LocalDeviceEntry, observed: Observed): DiscoveredDevice {
  const config = entryConfigOf(entry);
  const profile = entryProfileOf(entry);
  return {
    provider: 'local',
    externalId: entry.externalId,
    parentExternalId: null,
    kind: 'other',
    name: entry.name,
    model: config.model,
    manufacturer: 'oralb',
    room: config.room,
    online: observed['linkPhase'] === 'linked',
    capabilities: oralbCapabilities(entry),
    details: {
      transport: 'bluetooth',
      driver: ORALB_DRIVER,
      marketingModel: oralbSettingsOf(entry).model,
      pressure: profile.pressure,
      history: profile.history,
      updates:
        'The phone that hears the brush reports each advert and, when it connects, each value to this hub; the brush sleeps between uses and is never polled',
      ...linkState(observed),
    },
  };
}

export const oralbDriver: LocalDriverDefinition = {
  id: ORALB_DRIVER,
  provider: 'local',
  describe,
  adverts: null,
};
