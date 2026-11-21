import {
  baseNameOf,
  triggerCatalogue,
  type DeviceRow,
  type DeviceScope,
  type PluginManifest,
  type RoomRow,
  type SignalSourceSpec,
  type TriggerCatalogue,
} from '@smarteverything/domain';
import { deviceHidden } from '../server/person-scope';
import { installedSignalSources } from './sources/installed';

export interface CatalogueStore {
  readonly devices: { readonly list: () => readonly DeviceRow[] };
  readonly rooms: { readonly list: () => readonly RoomRow[] };
  readonly plugins: { readonly list: () => readonly { readonly manifest: PluginManifest }[] };
}

export function triggerCatalogueOf(
  home: CatalogueStore,
  scope: DeviceScope | null,
): TriggerCatalogue {
  const sources: readonly SignalSourceSpec[] = installedSignalSources(home);
  const manifests: readonly PluginManifest[] = home.plugins.list().map((row) => row.manifest);
  return triggerCatalogue(
    sources,
    {
      devices: home.devices
        .list()
        .filter((device) => !deviceHidden(scope, device))
        .map((device) => ({ ...device, name: baseNameOf(device), roomId: device.room_id })),
      rooms: home.rooms.list(),
      people: [],
      chats: [],
    },
    manifests.map((manifest) => ({ id: manifest.id, name: manifest.name })),
  );
}
