import type { PluginId } from '@smarteverything/domain';
import { useStoreSelector } from '../../store/store-context';

export function usePluginOff(pluginId: PluginId): boolean {
  return useStoreSelector(
    (state) => state.tables.plugins.byId[pluginId]?.enabled === false,
    Object.is,
    [pluginId],
  );
}
