import { pluginStreamKey, type PluginId, type WidgetStreamRef } from '@smarteverything/domain';
import { useStoreSelector } from '../../store/store-context';
import { pluginStreamRow } from '../../store/subscriptions';
import { pickStreamValue, type StreamValue } from './stream-value';

export function useStreamValue(pluginId: PluginId, ref: WidgetStreamRef): StreamValue {
  const key = pluginStreamKey(pluginId, ref.stream);
  const row = useStoreSelector((state) => pluginStreamRow(state, key), Object.is, [key]);
  return pickStreamValue(row, ref);
}
