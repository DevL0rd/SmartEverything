import type { DeviceRow, PluginSearchEntry, PluginSearchHit } from '@smarteverything/domain';
import type { Store } from '../store/store';

function pathOf(
  localDevices: ReadonlyMap<string, DeviceRow>,
  target: PluginSearchEntry['target'],
): string | null {
  if (target.kind === 'path') {
    return target.path;
  }
  const device = localDevices.get(target.externalId);
  if (device === undefined) {
    return null;
  }
  const section = target.section === null ? '' : `/${target.section}`;
  const query = new URLSearchParams(target.query).toString();
  return `/device/${device.id}${section}${query === '' ? '' : `?${query}`}`;
}

export interface SearchHitStore {
  readonly devices: Pick<Store['devices'], 'list'>;
  readonly pluginData: Pick<Store['pluginData'], 'searchEntries'>;
}

export function searchHitsOf(store: SearchHitStore): PluginSearchHit[] {
  const localDevices = new Map(
    store.devices
      .list()
      .filter((row) => row.provider === 'local')
      .map((row) => [row.external_id, row] as const),
  );
  return store.pluginData.searchEntries().flatMap(({ pluginId, entry }) => {
    const path = pathOf(localDevices, entry.target);
    return path === null
      ? []
      : [
          {
            id: `${pluginId}:${entry.id}`,
            plugin_id: pluginId,
            title: entry.title,
            subtitle: entry.subtitle,
            keywords: entry.keywords,
            path,
          },
        ];
  });
}
