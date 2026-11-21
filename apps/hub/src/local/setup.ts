import { magnetSetup } from './xiaomi-magnet';
import {
  ApiError,
  BIND_KEY,
  BLUETOOTH_ADDRESS,
  isScale,
  type DeviceRow,
  type LocalDeviceSetup,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import { MANUAL_SCALE_MODEL } from './xiaomi-scale';
import type { ResolvedSetup, SetupContext } from './setup-types';
import { watchSetup } from './watch-setup';
import { treadmillSetup } from './treadmill/setup';
import { homeClock } from './bottle/clock';
import { bottleSetup } from './bottle/setup';
import { brushSetupFor } from './toothbrush/brands';

async function scaleOf(store: Pick<Store, 'host'>, deviceId: string): Promise<DeviceRow> {
  const device = await store.host.call('devices', 'byId', deviceId);
  if (device.provider !== 'xiaomi' || !device.external_id.startsWith('blt.') || !isScale(device)) {
    throw new ApiError('invalid_request', `${device.name} is not a Xiaomi Bluetooth scale.`);
  }
  return device;
}

async function roomNameOf(store: Pick<Store, 'host'>, device: DeviceRow): Promise<string | null> {
  const rooms = await store.host.call('rooms', 'list');
  return rooms.find((room) => room.id === device.room_id)?.name ?? null;
}

async function fromXiaomi(
  setup: Extract<LocalDeviceSetup, { driver: 'xiaomi_scale'; source: 'xiaomi' }>,
  context: SetupContext,
): Promise<ResolvedSetup> {
  const device = await scaleOf(context.store, setup.xiaomiDeviceId);
  const identity = await context.identities(device.external_id);
  const address = BLUETOOTH_ADDRESS.parse(identity.mac);
  return {
    entry: {
      externalId: `xiaomi_scale:${address}`,
      driver: 'xiaomi_scale',
      address,
      name: device.display_name ?? device.name,
      config: {
        model: device.model,
        replaces: device.id,
        room: await roomNameOf(context.store, device),
      },
    },
    key: BIND_KEY.parse(identity.bindKey),
    replaces: device.id,
  };
}

function fromManual(setup: Extract<LocalDeviceSetup, { source: 'manual' }>): ResolvedSetup {
  return {
    entry: {
      externalId: `xiaomi_scale:${setup.address}`,
      driver: 'xiaomi_scale',
      address: setup.address,
      name: setup.name,
      config: { model: MANUAL_SCALE_MODEL },
    },
    key: setup.bindKey,
    replaces: null,
  };
}

export async function resolveSetup(
  setup: LocalDeviceSetup,
  context: SetupContext,
): Promise<ResolvedSetup> {
  if (setup.driver === 'xiaomi_magnet') {
    return magnetSetup(setup, context);
  }
  if (setup.driver === 'xiaomi_watch') {
    return watchSetup(setup, context);
  }
  if (setup.driver === 'kingsmith_treadmill') {
    return treadmillSetup(setup);
  }
  if (setup.driver === 'philips_sonicare' || setup.driver === 'oralb_io') {
    return brushSetupFor(setup);
  }
  if (setup.driver === 'larq_bottle') {
    const now = context.now();
    return Promise.resolve(bottleSetup(setup, { now, today: homeClock(context.store).dayOf(now) }));
  }
  return setup.source === 'xiaomi' ? fromXiaomi(setup, context) : fromManual(setup);
}
