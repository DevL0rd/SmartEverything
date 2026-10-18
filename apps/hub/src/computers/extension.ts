import type { ComputerLiveNotice } from '@smarteverything/domain';
import { effectiveClientById } from '../server/person-access';
import type { ExtensionContext, RunningExtension, ServerExtension } from '../extensions';
import { computerPolicyOf } from '../metrics/history-policy';
import { wakeOnLan } from '../network/wake-on-lan';
import { viewerOfClient } from './computer-access';
import { ComputerDirectory } from './computer-directory';
import { commandOrigin, computerMacs } from './computer-records';
import { computerSessionRoutes } from './computer-session-routes';
import { computerRoutes } from './computer-routes';
import { ComputerService } from './computer-service';
import { computerSystemRoutes } from './computer-system-routes';
import { ComputerDownloads } from './computer-downloads';
import { computerDownloadRoute } from './file-download';
import { computerDriver, type ComputerDriverOptions } from './computer-driver';
import { computerMachineId } from '../node/identity';

interface Wiring {
  readonly context: ExtensionContext;
  readonly directory: ComputerDirectory;
  readonly service: ComputerService;
  readonly now: () => Date;
}

function driverOptions({ context, directory, service, now }: Wiring): ComputerDriverOptions {
  const { store } = context;
  const drivers = context.hub.drivers;
  return {
    history: drivers.metrics,
    viewers: drivers.viewers,
    policyOf: computerPolicyOf(store),
    publish: (notice): void => {
      context.live.watches.publish(notice);
    },
    deviceIdOf: drivers.deviceIdOf,
    scopesOf: (deviceId) => store.computerScopes.read(deviceId),
    directory,
    records: {
      originOf: commandOrigin(store),
      visibleTo: (deviceId, clientId) =>
        service.access.visible(
          deviceId,
          viewerOfClient(store, effectiveClientById(store, clientId)),
        ),
      macsOf: computerMacs(store),
      wake: wakeOnLan,
      approve: (deviceId, action, source): Promise<void> => {
        const device = store.devices.byId(deviceId);
        return context.machineApprovals.require({
          action,
          source,
          machine: device.display_name ?? device.name,
          profileId: store.computerNodes.personOf(deviceId),
        });
      },
    },
    recordAppTime: ({ deviceId, app, startedAt, endedAt }): void => {
      store.appSessions.add({ deviceId, appId: app.id, appName: app.name, startedAt, endedAt });
    },
    ears: context.computerEars,
    earHosts: context.computerEars,
    hubComputerResolved: (deviceId): void => {
      context.computerAi.bindLocalDevice(deviceId);
    },
    now,
    log: context.log,
  };
}

function keyframeOf(directory: ComputerDirectory, deviceId: string): ComputerLiveNotice | null {
  const view = directory.online(deviceId)?.view() ?? null;
  if (view?.at === null || view === null) return null;
  return { type: 'computer_live', deviceId, at: view.at, parts: view.parts };
}

function watchLive(wiring: Wiring): () => void {
  const { context, directory, service } = wiring;
  const { store } = context;
  context.live.watches.attach({
    viewers: context.hub.drivers.viewers,
    allowed: (client, deviceId) =>
      service.access.watchable(deviceId, viewerOfClient(store, client)),
    keyframe: (deviceId) => keyframeOf(directory, deviceId),
  });
  return store.feed.subscribe((change) => {
    if (change.table !== 'settings') return;
    directory.all().forEach((session) => {
      session.retune();
    });
  });
}

export function computersExtension(now: () => Date): ServerExtension {
  return async (context): Promise<RunningExtension> => {
    const { store } = context;
    const directory = new ComputerDirectory(await computerMachineId(context.dataDirectory));
    const service = new ComputerService({ store, directory, log: context.log });
    const wiring: Wiring = { context, directory, service, now };
    const driver = computerDriver(driverOptions(wiring));
    const unregister = context.hub.drivers.registry.register(driver);
    const unfollow = context.nodeSockets.onComputer((_identity, link) => driver.attach(link));
    const unwatch = watchLive(wiring);
    const detach = context.hub.automationComputers.attach({
      ask: (viewer, deviceId, request, schema) =>
        service.askAs(viewer, { deviceId, request, confirmed: false, person: false }, schema),
      features: (deviceId) => directory.online(deviceId)?.view()?.hello.features ?? null,
    });
    const routes = { store, service, directory };
    const downloads = new ComputerDownloads({ service, directory, links: context.links, now });
    return {
      endpoints: {
        ...computerRoutes({ ...routes, history: context.hub.drivers.metrics }),
        ...computerSessionRoutes({ ...routes, now }),
        ...computerSystemRoutes({ ...routes, downloads, sources: context.hub.drivers.sources }),
      },
      routes: [computerDownloadRoute({ store, directory }), downloads.route()],
      stop: (): Promise<void> => {
        detach();
        unwatch();
        unfollow();
        unregister();
        return Promise.resolve();
      },
    };
  };
}
