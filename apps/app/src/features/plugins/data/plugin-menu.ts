import type { PluginRow } from '@smarteverything/domain';
import type { MenuItem } from '../../../components/menu';
import type { EntityStore } from '../../../store/entity-store';
import { remove, restart, switchPlugin } from './plugin-actions';
import { background } from '@smarteverything/logging';

function removeItems(row: PluginRow): MenuItem[] {
  if (row.source === 'builtin') {
    return [];
  }
  return [
    {
      label: 'Remove',
      icon: 'trash',
      destructive: true,
      onPress: (): void => {
        background(remove(row), 'plugin_menu.remove_failed');
      },
    },
  ];
}

export function pluginMenu(store: EntityStore, row: PluginRow): MenuItem[] {
  return [
    {
      label: row.enabled ? 'Switch off' : 'Switch on',
      icon: 'power',
      onPress: (): void => {
        background(switchPlugin(store, row, !row.enabled), 'plugin.switch_failed');
      },
    },
    {
      label: 'Restart',
      icon: 'refresh',
      disabled: !row.enabled,
      onPress: (): void => {
        restart(row);
      },
    },
    ...removeItems(row),
  ];
}
