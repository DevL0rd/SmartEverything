import type { PluginHomeFacts } from '../../src/plugins/builtin-context';
import type { Store } from '../../src/store/store';

export function storePluginHome(store: Store): PluginHomeFacts {
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
