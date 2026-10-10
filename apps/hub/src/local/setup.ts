import {
  ApiError,
  BIND_KEY,
  BLUETOOTH_ADDRESS,
  isScale,
  unseal,
  type DeviceRow,
  type LocalDeviceSetup,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import { MANUAL_SCALE_MODEL } from './xiaomi-scale';
import type { ResolvedSetup, SetupContext } from './setup-types';
import { watchSetup } from './watch-setup';

function scaleOf(store: Store, deviceId: string): DeviceRow {
  const device = store.devices.byId(deviceId);
  if (device.provider !== 'xiaomi' || !device.external_id.startsWith('blt.') || !isScale(device)) {
    throw new ApiError('invalid_request', `${device.name} is not a Xiaomi Bluetooth scale.`);
  }
  return device;
}

function roomNameOf(store: Store, device: DeviceRow): string | null {
  return store.rooms.list().find((room) => room.id === device.room_id)?.name ?? null;
}

async function fromXiaomi(
  setup: Extract<LocalDeviceSetup, { driver: 'xiaomi_scale'; source: 'xiaomi' }>,
  context: SetupContext,
): Promise<ResolvedSetup> {
  const device = scaleOf(context.store, setup.xiaomiDeviceId);
  const identity = await context.identities(device.external_id);
  const address = BLUETOOTH_ADDRESS.parse(identity.mac);
  return {
    entry: {
      externalId: `xiaomi_scale:${address}`,
      driver: 'xiaomi_scale',
      address,
      name: device.display_name ?? device.name,
      config: { model: device.model, replaces: device.id, room: roomNameOf(context.store, device) },
    },
    key: BIND_KEY.parse(identity.bindKey),
    replaces: device.id,
  };
}

function fromManual(
  setup: Extract<LocalDeviceSetup, { source: 'manual' }>,
  context: SetupContext,
): ResolvedSetup {
  const key = BIND_KEY.safeParse(unseal(context.secrets.sealingKeys(), setup.bindKey));
  if (!key.success) {
    throw new ApiError('invalid_request', 'The Bluetooth key must be 32 hexadecimal characters.');
  }
  return {
    entry: {
      externalId: `xiaomi_scale:${setup.address}`,
      driver: 'xiaomi_scale',
      address: setup.address,
      name: setup.name,
      config: { model: MANUAL_SCALE_MODEL },
    },
    key: key.data,
    replaces: null,
  };
}

export async function resolveSetup(
  setup: LocalDeviceSetup,
  context: SetupContext,
): Promise<ResolvedSetup> {
  if (setup.driver === 'xiaomi_watch') {
    return watchSetup(setup, context);
  }
  return setup.source === 'xiaomi' ? fromXiaomi(setup, context) : fromManual(setup, context);
}
