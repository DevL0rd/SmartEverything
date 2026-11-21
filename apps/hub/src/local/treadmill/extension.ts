import { queryLatestRecordFrame, stepOf } from '@smarteverything/ble';
import {
  deviceInScope,
  type ClientRow,
  type DeviceRow,
  type TreadmillLiveNotice,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { DeviceDriver } from '../device-driver';
import type { ExtensionContext, RunningExtension, ServerExtension } from '../../extensions';
import { scopesOfClient } from '../../server/person-scope';
import { registerTreadmillAutomation } from './automation';
import { issueThroughHub, treadmillAutomationRuntime } from './automation-tools';
import { treadmillDriver } from './commands';
import { entrySettingsOf } from './config';
import type { Fleet } from './fleet';
import { liveFrameOf, mayShowBody, noticeOf } from './live';
import { controlOf } from './plan';
import { treadmillRoutes } from './routes';
import { BeltStopFailedError, stopBelt, type StopIo } from './stop';
import { buildWiring, type Wiring } from './wiring';

function keyframeOf(
  context: ExtensionContext,
  wiring: Wiring,
  target: { readonly device: DeviceRow; readonly client: ClientRow },
  now: () => Date,
): TreadmillLiveNotice {
  const { store } = context;
  const { device, client } = target;
  const state = wiring.fleet.of(device);
  const { walker } = state;
  const profileId = store.live.access.activeProfileOf(client.id);
  const frame = liveFrameOf(
    {
      state,
      at: now().toISOString(),
      walker,
      heartRate: walker.heartRate,
      scale: entrySettingsOf(state.entry).inclineScale,
    },
    mayShowBody(client, profileId, walker.profileId),
  );
  return noticeOf(device, frame);
}

function treadmillOf(fleet: Fleet, deviceId: string): DeviceRow | null {
  return fleet.device(deviceId) ?? null;
}

function watchLive(context: ExtensionContext, wiring: Wiring, now: () => Date): () => void {
  const { store } = context;
  return context.live.watches.attach({
    viewers: context.hub.drivers.viewers,
    allowed: (client, deviceId) => {
      const device = treadmillOf(wiring.fleet, deviceId);
      const scope = scopesOfClient(store, client)?.devices ?? null;
      return device !== null && (scope === null || deviceInScope(scope, device));
    },
    keyframe: (deviceId, client) => {
      const device = treadmillOf(wiring.fleet, deviceId);
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

function driverStart(context: ExtensionContext, wiring: Wiring): DeviceDriver['start'] {
  return async (driverContext) => {
    wiring.slot.set(driverContext.sink);
    for (const closed of await context.store.host.write('treadmillCloseOrphans', null)) {
      context.log.info('treadmill.orphan_closed', {
        session: closed.session.id,
        kept: closed.kept,
      });
    }
    return () => {
      wiring.slot.set(null);
      return Promise.resolve();
    };
  };
}

export function treadmillsExtension(now: () => Date): ServerExtension {
  return async (context): Promise<RunningExtension> => {
    const wiring = buildWiring(context, now);
    const unfollow = await wiring.fleet.start();
    const detach = watchLive(context, wiring, now);
    const driver = treadmillDriver(wiring.commands, driverStart(context, wiring));
    const unregisterKinds = registerTreadmillAutomation(
      context.hub.automationKinds,
      treadmillAutomationRuntime({
        find: (deviceId) => wiring.fleet.roster.member(deviceId),
        issue: issueThroughHub({ store: context.store, submit: context.hub.submit }),
      }),
    );
    const unregister = context.hub.drivers.registry.register(driver);
    return {
      endpoints: treadmillRoutes({
        store: context.store,
        fleet: wiring.fleet,
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
        unfollow();
        detach();
        unregister();
        unregisterKinds();
        wiring.broker.stop();
        return Promise.resolve();
      },
    };
  };
}
