import type { DiscoveredDevice } from '@smarteverything/domain';
import {
  SHELLY_DEVICE,
  SHELLY_PLUGIN_ID,
  shellyExternalId,
  type ShellyDevice,
} from '@smarteverything/shelly';
import type { DeviceDriverContext, PluginRecords } from '../contract';
import type { ShellyEnrollment } from './enrollment';
import { projectShellyReadings, shellyDevices } from './projector';
import { jsonOf } from '../json-value';

const CONNECTING = { state: 'connecting', reason: null } as const;

export function rememberedShelly(
  records: PluginRecords,
  enrollment: ShellyEnrollment,
): ShellyDevice {
  const raw = records.get(enrollment.info.id);
  const saved = raw === null ? undefined : SHELLY_DEVICE.safeParse(raw);
  if (saved?.success === true)
    return {
      ...saved.data,
      connection: CONNECTING,
      discoveredBthome: [],
      tracks: [],
      tracksAt: null,
    };
  return {
    id: enrollment.info.id,
    externalId: shellyExternalId(enrollment.info.id),
    name: `Shelly Presence ${enrollment.info.mac.slice(-4).toUpperCase()}`,
    address: enrollment.address,
    info: enrollment.info,
    connection: CONNECTING,
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
  before: ShellyDevice,
  after: ShellyDevice,
): Promise<void> {
  const published = shellyDevices(after);
  await context.publishDevices(published);
  await context.forget(unpublishedIds(before, published));
  projectShellyReadings(context.sink, after);
}

export function unpublishedIds(
  before: ShellyDevice,
  published: readonly DiscoveredDevice[],
): string[] {
  const current = new Set(published.map((device) => device.externalId));
  return shellyDevices(before)
    .filter((device) => !current.has(device.externalId))
    .map((device) => device.externalId.slice(SHELLY_PLUGIN_ID.length + 1));
}

export function rememberShelly(records: PluginRecords, snapshot: ShellyDevice): void {
  records.put(
    snapshot.id,
    jsonOf({ ...snapshot, discoveredBthome: [], resources: undefined, tracks: [], tracksAt: null }),
  );
}
