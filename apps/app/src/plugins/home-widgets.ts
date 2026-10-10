import { useDevices } from '../store/selectors';
import { APP_PLUGINS } from './registry';

export function usePluginHomeTypes(): readonly string[] {
  const devices = useDevices({ includeHidden: true });
  return APP_PLUGINS.flatMap((plugin) => plugin.home?.(devices) ?? []);
}
