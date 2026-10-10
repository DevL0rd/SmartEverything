import { useMemo } from 'react';
import { useRows } from '../../../store/selectors';
import type { PluginNames } from '../model/speaker';

export function usePluginNames(): PluginNames {
  const plugins = useRows('plugins');
  return useMemo(
    () => new Map(plugins.map((plugin) => [plugin.id, plugin.manifest.name])),
    [plugins],
  );
}
