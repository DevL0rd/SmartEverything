import { registerWatchAutomation } from '../local/watch-automation';
import { watchAutomationRuntime } from '../local/watch-automation-tools';
import { watchDriver } from '../local/watch-driver';
import type { ServerContext } from './context';

export function startWatchDriver(context: ServerContext): () => void {
  const unregister = context.hub.drivers.registry.register(
    watchDriver({
      store: context.store,
      watches: context.hub.watches,
      actions: context.watchActions,
    }),
  );
  const unregisterAutomation = registerWatchAutomation(
    context.hub.automationKinds,
    watchAutomationRuntime({
      store: context.store,
      watches: context.hub.watches,
      actions: context.watchActions,
    }),
  );
  return (): void => {
    unregisterAutomation();
    unregister();
    context.watchActions.stop();
  };
}
