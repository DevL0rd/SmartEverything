import type { PluginHomeFacts } from '../../src/plugins/builtin-context';
import type { SeededStore } from './store';

export function storePluginHome(store: SeededStore): PluginHomeFacts {
  return {
    load: (): Promise<void> => Promise.resolve(),
    settings: { read: () => store.settings.read() },
    profiles: { list: () => store.profiles.list() },
    phoneContexts: {
      byDevice: (deviceId) => store.phoneContexts.byDevice(deviceId),
      latestOf: (profileId) => store.phoneContexts.latestOf(profileId),
    },
  };
}
