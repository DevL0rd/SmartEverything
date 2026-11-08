import type { PluginRow, PluginSource } from '@smarteverything/domain';
import type { SyncStatus } from '../../../store/selectors';
import type { DevicePluginRow } from './device-plugins';
import { pluginSubtitle } from './plugin-look';

const SOURCE_LABEL: Readonly<Record<PluginSource, string>> = {
  builtin: 'Built in',
  local: 'Hub folder',
  url: 'Web link',
};

export function pluginSourceLabel(row: Pick<PluginRow, 'source'>): string {
  return SOURCE_LABEL[row.source];
}

export function matchesHubPlugin(row: PluginRow, search: string): boolean {
  const text = [
    row.id,
    row.manifest.name,
    row.manifest.description,
    pluginSubtitle(row),
    pluginSourceLabel(row),
  ];
  return matches(text, search);
}

export function matchesDevicePlugin(row: DevicePluginRow, search: string): boolean {
  return matches([row.title, row.description, row.status], search);
}

function matches(parts: readonly (string | null)[], search: string): boolean {
  return parts.some((part) => part?.toLowerCase().includes(search) === true);
}

export type PluginCatalogStatus = 'loading' | 'ready' | 'unavailable';

export function pluginCatalogStatus({ status, outdated }: SyncStatus): PluginCatalogStatus {
  if (status === 'loading' || status === 'connecting') return 'loading';
  if (status !== 'live' || outdated.includes('owner.plugins')) return 'unavailable';
  return 'ready';
}
