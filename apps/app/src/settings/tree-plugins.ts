import { plural } from '../format/text';
import { rowsOf, type StoreState } from '../store/state';
import type { SettingEnv, SettingsPageDefinition } from './types';

const ownerOnly = (env: SettingEnv): boolean => env.owner;

function pluginsSummary(state: StoreState): string | null {
  const on = rowsOf(state.tables.plugins).filter((row) => row.enabled).length;
  return on === 0 ? null : `${plural(on, 'plugin')} on`;
}

export const PLUGIN_PAGES: readonly SettingsPageDefinition[] = [
  {
    id: 'plugins',
    title: 'Plugins',
    icon: 'puzzle',
    parent: null,
    group: 'Connections',
    summary: pluginsSummary,
    keywords: ['plugin', 'extension', 'add-on', 'mcp server', 'integrations'],
    visible: ownerOnly,
  },
  {
    id: 'plugins/add',
    title: 'Add a plugin',
    icon: 'plus',
    parent: 'plugins',
    group: null,
    keywords: ['install', 'mcp', 'link', 'folder', 'built in'],
    visible: ownerOnly,
  },
];
