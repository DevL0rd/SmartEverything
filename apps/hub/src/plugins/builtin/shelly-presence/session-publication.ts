import { SHELLY_PRESENCE_DEVICE, type ShellyPresenceDevice } from '@smarteverything/domain';
import type { DeviceDriverContext } from '../../../local/device-driver';
import type { PluginRecords } from '../contract';
import { jsonOf } from './action-plan';
import type { ShellyEnrollment } from './enrollment';
import { projectShellyReadings, shellyDevices } from './projector';
import { removedZoneIds } from './zone-identities';

export function rememberedShelly(
  records: PluginRecords,
  enrollment: ShellyEnrollment,
): ShellyPresenceDevice {
  const raw = records.get(enrollment.info.id);
  if (raw !== null)
    return {
      ...SHELLY_PRESENCE_DEVICE.parse(raw),
      connection: { state: 'connecting', reason: null },
      discoveredBthome: [],
      tracks: [],
      tracksAt: null,
    };
  return {
    id: enrollment.info.id,
    externalId: `shelly-presence:${enrollment.info.id}`,
    name: 'Shelly Presence',
    address: enrollment.address,
    info: enrollment.info,
    connection: { state: 'connecting', reason: null },
    observedAt: null,
    config: null,
    status: null,
    revision: null,
    zones: [],
    light: [],
    discoveredBthome: [],
    tracks: [],
    tracksAt: null,
    methods: [],
    componentKeys: [],
    features: [],
    components: [],
  };
}
export async function publishShellyInventory(
  context: DeviceDriverContext,
  before: ShellyPresenceDevice,
  after: ShellyPresenceDevice,
): Promise<void> {
  await context.publishDevices(shellyDevices(after));
  await context.forget(removedZoneIds(before, after));
  projectShellyReadings(context.sink, after);
}
export function rememberShelly(records: PluginRecords, snapshot: ShellyPresenceDevice): void {
  records.put(
    snapshot.id,
    jsonOf({ ...snapshot, discoveredBthome: [], resources: undefined, tracks: [], tracksAt: null }),
  );
}
