import { PLUGIN_ROW, type PluginRow } from '@smarteverything/domain';
import { expect, it } from 'vitest';
import type { SyncStatus } from '../../../store/selectors';
import type { DevicePluginRow } from './device-plugins';
import {
  matchesDevicePlugin,
  matchesHubPlugin,
  pluginCatalogStatus,
  pluginSourceLabel,
} from './plugin-catalog';

const DATE = '2026-11-06T00:00:00.000Z';

function plugin(id: string, publisher: string, source: PluginRow['source']): PluginRow {
  return PLUGIN_ROW.parse({
    id,
    manifest: {
      id,
      name: 'Daily Brief',
      publisher,
      description: 'Summarize workspace activity',
      version: '1.0.0',
    },
    source,
    location: null,
    enabled: false,
    trusted: false,
    status: 'disabled',
    status_detail: null,
    tool_switches: {},
    settings: {},
    secret_names: [],
    icon_url: null,
    installed_at: DATE,
    updated_at: DATE,
  });
}

it('matches same-name installed plugins by publisher, source or id independently', () => {
  const plugins = [
    plugin('daily-brief', 'Original Lab', 'url'),
    plugin('alternate-brief', 'Alternate Lab', 'local'),
  ];
  expect(plugins.filter((row) => matchesHubPlugin(row, 'daily brief'))).toEqual(plugins);
  expect(plugins.filter((row) => matchesHubPlugin(row, 'alternate lab'))).toEqual([plugins[1]]);
  expect(plugins.filter((row) => matchesHubPlugin(row, 'web link'))).toEqual([plugins[0]]);
  expect(plugins.filter((row) => matchesHubPlugin(row, 'alternate-brief'))).toEqual([plugins[1]]);
  expect(plugins.map(pluginSourceLabel)).toEqual(['Web link', 'Hub folder']);
  expect(pluginSourceLabel({ source: 'builtin' })).toBe('Built in');
});

it('keeps device plugin setup descriptions searchable', () => {
  const row: DevicePluginRow = {
    id: 'treadmill',
    title: 'Treadmill',
    description: 'Connect a WalkingPad',
    icon: 'footprints',
    count: 0,
    status: null,
    href: '/devices',
  };
  expect(matchesDevicePlugin(row, 'walkingpad')).toBe(true);
  expect(matchesDevicePlugin(row, 'linked')).toBe(false);
});

it('allows an empty state only when the installed list has synced successfully', () => {
  function sync(status: SyncStatus['status'], outdated: readonly string[] = []): SyncStatus {
    return { status, problem: null, outdated };
  }
  expect(pluginCatalogStatus(sync('loading'))).toBe('loading');
  expect(pluginCatalogStatus(sync('interrupted'))).toBe('unavailable');
  expect(pluginCatalogStatus(sync('live', ['owner.plugins']))).toBe('unavailable');
  expect(pluginCatalogStatus(sync('live', ['firewall']))).toBe('ready');
});
