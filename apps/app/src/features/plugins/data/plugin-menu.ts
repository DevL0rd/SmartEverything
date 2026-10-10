import type { PluginRow } from '@smarteverything/domain';
import type { MenuItem } from '../../../components/menu';
import { remove, restart, switchPlugin } from './plugin-actions';

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
        void remove(row);
      },
    },
  ];
}

export function pluginMenu(row: PluginRow): MenuItem[] {
  return [
    {
      label: row.enabled ? 'Switch off' : 'Switch on',
      icon: 'power',
      onPress: (): void => {
        void switchPlugin(row, !row.enabled);
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
