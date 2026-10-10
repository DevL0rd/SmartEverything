import type { PluginSearchEntry, PluginSearchHit } from '@smarteverything/domain';
import type { Store } from '../store/store';

function pathOf(store: Store, target: PluginSearchEntry['target']): string | null {
  if (target.kind === 'path') {
    return target.path;
  }
  const device = store.devices
    .list()
    .find((row) => row.provider === 'local' && row.external_id === target.externalId);
  if (device === undefined) {
    return null;
  }
  const section = target.section === null ? '' : `/${target.section}`;
  const query = new URLSearchParams(target.query).toString();
  return `/device/${device.id}${section}${query === '' ? '' : `?${query}`}`;
}

export function searchHitsOf(store: Store): PluginSearchHit[] {
  return store.pluginData.searchEntries().flatMap(({ pluginId, entry }) => {
    const path = pathOf(store, entry.target);
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
