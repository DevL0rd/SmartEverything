import {
  baseNameOf,
  triggerCatalogue,
  type DeviceScope,
  type PluginManifest,
  type SignalSourceSpec,
  type TriggerCatalogue,
} from '@smarteverything/domain';
import { deviceHidden } from '../server/person-scope';
import type { Store } from '../store/store';
import { installedSignalSources } from './sources/installed';

export type CatalogueStore = Pick<Store, 'devices' | 'rooms' | 'plugins'>;

export function triggerCatalogueOf(
  store: CatalogueStore,
  scope: DeviceScope | null,
): TriggerCatalogue {
  const sources: readonly SignalSourceSpec[] = installedSignalSources(store);
  const manifests: readonly PluginManifest[] = store.plugins.list().map((row) => row.manifest);
  return triggerCatalogue(
    sources,
    {
      devices: store.devices
        .list()
        .filter((device) => !deviceHidden(scope, device))
        .map((device) => ({ ...device, name: baseNameOf(device), roomId: device.room_id })),
      rooms: store.rooms.list(),
      people: [],
      chats: [],
    },
    manifests.map((manifest) => ({ id: manifest.id, name: manifest.name })),
  );
}
