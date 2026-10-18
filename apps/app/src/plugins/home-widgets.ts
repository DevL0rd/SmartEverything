import { rowsOf, type StoreState } from '../store/state';
import { shallowEqual, useStoreSelector } from '../store/store-context';
import { APP_PLUGINS } from './registry';

function pluginHomeTypes(state: StoreState): readonly string[] {
  const devices = rowsOf(state.tables.devices);
  return APP_PLUGINS.flatMap((plugin) => plugin.home?.(devices) ?? []);
}

export function usePluginHomeTypes(): readonly string[] {
  return useStoreSelector(pluginHomeTypes, shallowEqual);
}
