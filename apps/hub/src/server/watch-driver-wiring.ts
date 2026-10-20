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
  return (): void => {
    unregister();
    context.watchActions.stop();
  };
}
