import type { RunningExtension, ServerExtension } from '../extensions';
import { PhoneActionBroker } from './phone-actions';
import { phoneDriver } from './phone-driver';
import { phoneRoutes } from './phone-routes';

export function phonesExtension(): ServerExtension {
  return (context): Promise<RunningExtension> => {
    const actions = new PhoneActionBroker(context.pushCommands, context.log.child({ actorId: 'phone' }));
    const unregister = context.hub.drivers.registry.register(phoneDriver({ store: context.store, actions }));
    context.hub.phones.start();
    return Promise.resolve({
      endpoints: phoneRoutes({ store: context.store, hub: context.hub, actions }),
      routes: [],
      stop: (): Promise<void> => {
        unregister();
        context.hub.phones.stop();
        actions.stop();
        return Promise.resolve();
      },
    });
  };
}
