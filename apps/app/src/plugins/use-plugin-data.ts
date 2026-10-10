import { pluginStreamKey, type JsonValue, type PluginId } from '@smarteverything/domain';
import { useStoreSelector } from '../store/store-context';

export interface PluginStreamValue {
  readonly value: JsonValue;
  readonly at: string;
}

export function usePluginData(pluginId: PluginId, stream: string): PluginStreamValue | null {
  const row = useStoreSelector(
    (state) => state.tables.plugin_streams.byId[pluginStreamKey(pluginId, stream)],
  );
  return row === undefined ? null : { value: row.value, at: row.at };
}
