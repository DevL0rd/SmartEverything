import type { PluginId } from '@smarteverything/domain';
import type { StoreState } from '../../store/state';
import { useStoreSelector } from '../../store/store-context';

export function pluginOffIn(state: StoreState, pluginId: PluginId): boolean {
  return state.tables.plugins.byId[pluginId]?.enabled === false;
}

export function usePluginOff(pluginId: PluginId): boolean {
  return useStoreSelector((state) => pluginOffIn(state, pluginId), Object.is, [pluginId]);
}
