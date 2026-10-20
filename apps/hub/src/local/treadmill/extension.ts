import { queryLatestRecordFrame, stepOf } from '@smarteverything/ble';
import {
  deviceInScope,
  type ClientRow,
  type DeviceRow,
  type TreadmillLiveNotice,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { ExtensionContext, RunningExtension, ServerExtension } from '../../extensions';
import { scopesOfClient } from '../../server/person-scope';
import { treadmillDriver } from './commands';
import { TREADMILL_DRIVER, entrySettingsOf } from './config';
import { closeOrphans } from './keeper';
import { liveFrameOf, mayShowBody, noticeOf, watchHeartRate } from './live';
import { controlOf } from './plan';
import { treadmillRoutes } from './routes';
import { BeltStopFailedError, stopBelt, type StopIo } from './stop';
import { buildWiring, type Wiring } from './wiring';

function treadmillOf(context: ExtensionContext, deviceId: string): DeviceRow | null {
  const device = context.store.devices.find(deviceId);
  const known =
    device !== undefined &&
    context.store.localDevices
      .list()
      .some(
        (entry) => entry.externalId === device.external_id && entry.driver === TREADMILL_DRIVER,
      );
  return known ? device : null;
}

function keyframeOf(
  context: ExtensionContext,
  wiring: Wiring,
  target: { readonly device: DeviceRow; readonly client: ClientRow },
  now: () => Date,
): TreadmillLiveNotice {
  const { store } = context;
  const { device, client } = target;
  const walker = wiring.ingest.walkerFacts(device);
  const profileId = store.profiles.activeOf(client.id).id;
  const at = now();
  const frame = liveFrameOf(
    {
      state: wiring.fleet.of(device),
      at: at.toISOString(),
      walker,
      heartRate: watchHeartRate(store, walker.profileId, at),
      scale: entrySettingsOf(wiring.fleet.of(device).entry).inclineScale,
    },
    mayShowBody(client, profileId, walker.profileId),
  );
  return noticeOf(device, frame);
}

function watchLive(context: ExtensionContext, wiring: Wiring, now: () => Date): () => void {
  const { store } = context;
  return context.live.watches.attach({
    viewers: context.hub.drivers.viewers,
    allowed: (client, deviceId) => {
      const device = treadmillOf(context, deviceId);
      const scope = scopesOfClient(store, client)?.devices ?? null;
      return device !== null && (scope === null || deviceInScope(scope, device));
    },
    keyframe: (deviceId, client) => {
      const device = treadmillOf(context, deviceId);
      return device === null ? null : keyframeOf(context, wiring, { device, client }, now);
    },
  });
}

function stopWithoutSteps(
  context: ExtensionContext,
  wiring: Wiring,
  now: () => Date,
): (device: DeviceRow) => void {
  return (device: DeviceRow): void => {
    const state = wiring.fleet.of(device);
    const holder = wiring.holderOf(device);
    if (holder === null || !wiring.guard.expired(state, now().getTime())) {
      return;
    }
    wiring.guard.disarm(device.id);
    context.log.warn('treadmill.no_steps_stop', { device: device.id });
    const io: StopIo = {
      deviceId: device.id,
      family: state.runtime.decoder.family,
      target: controlOf(device, state, now()),
      log: context.log,
      write: async (steps): Promise<string> => {
        const target = { clientId: holder, deviceId: device.id, name: device.name };
        const result = await wiring.broker.run(target, steps);
        if (!result.ok) {
          throw new BeltStopFailedError(result.detail);
        }
        return result.detail;
      },
    };
    background(stopBelt(io, state), 'treadmill.no_steps_stop_failed', { device: device.id });
  };
}

function requestRecord(
  context: ExtensionContext,
  wiring: Wiring,
  now: () => Date,
): (device: DeviceRow) => void {
  return (device) => {
    const state = wiring.fleet.of(device);
    const holder = wiring.holderOf(device);
    if (!state.takeRecordWish() || holder === null || state.runtime.decoder.family !== 'wilink') {
      return;
    }
    const target = controlOf(device, state, now());
    background(
      wiring.broker.run({ clientId: holder, deviceId: device.id, name: device.name }, [
        stepOf(target, queryLatestRecordFrame()),
      ]),
      'treadmill.record_request_failed',
      { device: device.id },
    );
    context.log.debug('treadmill.record_requested', () => ({ device: device.id }));
  };
}

function afterReport(
  context: ExtensionContext,
  wiring: Wiring,
  now: () => Date,
): (device: DeviceRow) => void {
  const stop = stopWithoutSteps(context, wiring, now);
  const record = requestRecord(context, wiring, now);
  return (device): void => {
    stop(device);
    record(device);
  };
}

export function treadmillsExtension(now: () => Date): ServerExtension {
  return (context): Promise<RunningExtension> => {
    const wiring = buildWiring(context, now);
    const detach = watchLive(context, wiring, now);
    const driver = treadmillDriver(wiring.commands, (driverContext) => {
      wiring.slot.set(driverContext.sink);
      for (const session of closeOrphans(context.store, context.log)) {
        wiring.health.save(session);
      }
      return Promise.resolve(() => {
        wiring.slot.set(null);
        return Promise.resolve();
      });
    });
    const unregister = context.hub.drivers.registry.register(driver);
    return Promise.resolve({
      endpoints: treadmillRoutes({
        store: context.store,
        fleet: wiring.fleet,
        local: context.hub.local,
        bridges: wiring.bridges,
        ingest: wiring.ingest,
        broker: wiring.broker,
        views: wiring.views,
        acts: wiring.acts,
        afterReport: afterReport(context, wiring, now),
        now,
      }),
      routes: [],
      stop: (): Promise<void> => {
        detach();
        unregister();
        wiring.broker.stop();
        return Promise.resolve();
      },
    });
  };
}
