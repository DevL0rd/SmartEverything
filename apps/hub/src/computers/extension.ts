import type { RunningExtension, ServerExtension } from '../extensions';
import { wakeOnLan } from '../network/wake-on-lan';
import { ComputerDirectory } from './computer-directory';
import { commandOrigin, computerMacs } from './computer-records';
import { computerSessionRoutes } from './computer-session-routes';
import { computerRoutes } from './computer-routes';
import { localComputerDriver } from './local-computer';

export function computersExtension(now: () => Date): ServerExtension {
  return (context): Promise<RunningExtension> => {
    const { store } = context;
    const drivers = context.hub.drivers;
    const directory = new ComputerDirectory();
    const unregister = drivers.registry.register(
      localComputerDriver({
        history: drivers.metrics,
        viewers: drivers.viewers,
        deviceIdOf: (externalId) => {
          const deviceId = drivers.deviceIdOf(externalId);
          if (deviceId !== undefined) context.computerAi.bindLocalDevice(deviceId);
          return deviceId;
        },
        scopesOf: (deviceId) => store.computerScopes.read(deviceId),
        directory,
        records: { originOf: commandOrigin(store), macsOf: computerMacs(store), wake: wakeOnLan },
        recordAppTime: ({ deviceId, app, startedAt, endedAt }) => {
          store.appSessions.add({ deviceId, appId: app.id, appName: app.name, startedAt, endedAt });
        },
        now,
        log: context.log,
      }),
    );
    return Promise.resolve({
      endpoints: {
        ...computerRoutes({ store, directory, history: drivers.metrics }),
        ...computerSessionRoutes({ store, directory, now }),
      },
      routes: [],
      stop: (): Promise<void> => {
        unregister();
        return Promise.resolve();
      },
    });
  };
}
