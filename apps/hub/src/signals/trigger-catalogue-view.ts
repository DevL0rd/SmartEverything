import {
  baseNameOf,
  rowSentence,
  searchTriggerCatalogue,
  triggerCatalogue,
  type DeviceScope,
  type PluginManifest,
  type ResponseOf,
  type SignalSourceSpec,
  type TriggerCatalogueQuery,
  type TriggerRow,
} from '@smarteverything/domain';
import { deviceHidden } from '../server/person-scope';
import type { Store } from '../store/store';
import { installedSignalSources } from './sources/installed';

type CatalogueView = ResponseOf<'listTriggerCatalogue'>;

type ViewStore = Pick<Store, 'devices' | 'rooms' | 'plugins'>;

function rowView(row: TriggerRow, sentence: string): CatalogueView['rows'][number] {
  return {
    source: row.source,
    kind: row.kind,
    label: row.label,
    group: row.group,
    subject: row.subject,
    field: row.field,
    room: row.room,
    how: [...row.hows],
    fields: row.fields.map((field) => field.field),
    match: row.match.map((entry) => entry.key),
    sentence,
  };
}

export function triggerCatalogueView(
  store: ViewStore,
  scope: DeviceScope | null,
  query: TriggerCatalogueQuery,
): CatalogueView {
  const sources: readonly SignalSourceSpec[] = installedSignalSources(store);
  const manifests: readonly PluginManifest[] = store.plugins.list().map((row) => row.manifest);
  const catalogue = triggerCatalogue(
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
  const found = searchTriggerCatalogue(catalogue, query);
  return {
    total: found.length,
    rows: found.slice(0, query.limit).map((row) => rowView(row, rowSentence(row, catalogue))),
  };
}
