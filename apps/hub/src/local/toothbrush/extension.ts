import {
  deviceInScope,
  type BrushLiveNotice,
  type ClientRow,
  type DeviceRow,
} from '@smarteverything/domain';
import type { Clock } from '../../clock';
import type { ExtensionContext, RunningExtension, ServerExtension } from '../../extensions';
import { scopesOfClient } from '../../server/person-scope';
import { ownsSessions } from './access';
import { registerToothbrushAutomation } from './automation';
import { brushDrivers } from './commands';
import { entrySettingsOf } from './config';
import { liveFrameOf, noticeOf } from './live';
import { brushRoutes } from './routes';
import { buildWiring, type Wiring } from './wiring';

function brushOf(wiring: Wiring, deviceId: string): DeviceRow | null {
  const device = wiring.fleet.device(deviceId);
  return device !== undefined && wiring.fleet.known(deviceId) !== undefined ? device : null;
}

function keyframeOf(
  context: ExtensionContext,
  wiring: Wiring,
  target: { readonly device: DeviceRow; readonly client: ClientRow },
  now: () => Date,
): BrushLiveNotice {
  const { device, client } = target;
  const state = wiring.fleet.of(device);
  const profileId = context.store.profiles.activeOf(client.id).id;
  const mine = ownsSessions(
    { role: client.role, profileId },
    entrySettingsOf(state.entry).personId,
  );
  return noticeOf(device, liveFrameOf(state, now().toISOString(), mine));
}

function watchLive(context: ExtensionContext, wiring: Wiring, now: () => Date): () => void {
  const { store } = context;
  return context.live.watches.attach({
    viewers: context.hub.drivers.viewers,
    allowed: (client, deviceId) => {
      const device = brushOf(wiring, deviceId);
      const scope = scopesOfClient(store, client)?.devices ?? null;
      return device !== null && (scope === null || deviceInScope(scope, device));
    },
    keyframe: (deviceId, client) => {
      const device = brushOf(wiring, deviceId);
      return device === null ? null : keyframeOf(context, wiring, { device, client }, now);
    },
  });
}

export function toothbrushesExtension(clock: Clock): ServerExtension {
  return async (context): Promise<RunningExtension> => {
    const wiring = buildWiring(context, clock);
    const unfollow = await wiring.fleet.start();
    const detach = watchLive(context, wiring, clock.now);
    const drivers = brushDrivers(wiring.commands, (driverContext) => {
      wiring.slot.set(driverContext.sink);
      return Promise.resolve(() => {
        wiring.slot.set(null);
        return Promise.resolve();
      });
    });
    const unregisters = [
      ...drivers.map((driver) => context.hub.drivers.registry.register(driver)),
      registerToothbrushAutomation(context.hub.automationKinds),
    ];
    return {
      endpoints: brushRoutes({
        store: context.store,
        fleet: wiring.fleet,
        bridges: wiring.bridges,
        ingest: wiring.ingest,
        broker: wiring.broker,
        views: wiring.views,
        acts: wiring.acts,
        now: clock.now,
      }),
      routes: [],
      stop: (): Promise<void> => {
        unfollow();
        detach();
        unregisters.forEach((unregister) => {
          unregister();
        });
        wiring.ingest.stop();
        wiring.broker.stop();
        return Promise.resolve();
      },
    };
  };
}
