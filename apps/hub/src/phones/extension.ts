import { clientFailureRoutes } from '../client-failures/extension';
import { PerfSamples } from '../client-failures/perf-samples';
import type { ExtensionContext, RunningExtension, ServerExtension } from '../extensions';
import { commandOrigin } from '../computers/computer-records';
import { PhoneActionBroker } from './phone-actions';
import { phoneFileOf } from './phone-file';
import { detailNotice, phoneViewerOfClient } from './phone-detail';
import { phoneDriver } from './phone-driver';
import { PhoneLive } from './phone-live';
import type { PhoneTarget } from './phone-nodes';
import { phoneRoutes } from './phone-routes';
import { phoneWatchSource } from './phone-watch';

function watchDetail(context: ExtensionContext, live: PhoneLive): () => void {
  const { store, hub } = context;
  const detach = context.live.watches.attach(
    phoneWatchSource(store, hub.phones, hub.drivers.viewers),
  );
  const unreport = hub.phones.onReport(({ target, detail }) => {
    live.reported(target.deviceId);
    if (detail === undefined) return;
    context.live.watches.publishEach(target.deviceId, (client) =>
      detailNotice(target, detail, phoneViewerOfClient(store, client)),
    );
  });
  return (): void => {
    unreport();
    detach();
  };
}

export function phonesExtension(now: () => Date): ServerExtension {
  return (context): Promise<RunningExtension> => {
    const actions = new PhoneActionBroker(
      context.pushCommands,
      context.log.child({ actorId: 'phone' }),
    );
    const unregister = context.hub.drivers.registry.register(
      phoneDriver({
        store: context.store,
        actions,
        phones: context.hub.phones,
        originOf: commandOrigin(context.store),
        now,
      }),
    );
    const live = new PhoneLive({
      store: context.store,
      viewers: context.hub.drivers.viewers,
      actions,
      target: (device): PhoneTarget => context.hub.phones.target(device),
      log: context.log,
    });
    context.hub.phones.start();
    live.start();
    const unwatch = watchDetail(context, live);
    return Promise.resolve({
      endpoints: {
        ...phoneRoutes({
          store: context.store,
          hub: context.hub,
          actions,
          approvals: context.machineApprovals,
          notifications: context.live.notifications,
          now,
          files: (caller, fileId) => phoneFileOf(context, caller, fileId),
        }),
        ...clientFailureRoutes(context.log, new PerfSamples(context.dataDirectory, context.log)),
      },
      routes: [],
      stop: (): Promise<void> => {
        unwatch();
        live.stop();
        unregister();
        context.hub.phones.stop();
        actions.stop();
        return Promise.resolve();
      },
    });
  };
}
