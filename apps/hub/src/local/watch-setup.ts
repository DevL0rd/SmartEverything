import {
  ApiError,
  WATCH_AUTH_KEY,
  isWearable,
  type DeviceRow,
  type LocalDeviceSetup,
} from '@smarteverything/domain';
import type { Wearable } from '@smarteverything/xiaomi';
import type { Store } from '../store/store';
import type { ResolvedSetup, SetupContext } from './setup-types';

export function externalIdOfWatch(address: string): string {
  return `xiaomi_watch:${address}`;
}

export function cloudRowOf(store: Store, wearable: Wearable): DeviceRow | undefined {
  const watches = store.devices
    .list()
    .filter((device) => device.provider === 'xiaomi' && isWearable(device));
  return (
    watches.find((device) => wearable.did !== null && device.external_id === wearable.did) ??
    watches.find((device) => wearable.model !== null && device.model === wearable.model) ??
    watches.find((device) => device.name === wearable.name)
  );
}

export async function watchSetup(
  setup: Extract<LocalDeviceSetup, { driver: 'xiaomi_watch' }>,
  context: SetupContext,
): Promise<ResolvedSetup> {
  const profile = context.store.profiles.byId(setup.profileId);
  const { wearables } = await context.wearables();
  const wearable = wearables.find((candidate) => candidate.mac === setup.address);
  if (wearable === undefined) {
    throw new ApiError(
      'not_found',
      `No watch at ${setup.address} is bound to your Mi Fitness account any more.`,
    );
  }
  return resolvedWatch(wearable, profile.id, cloudRowOf(context.store, wearable));
}

function resolvedWatch(
  wearable: Wearable,
  profileId: string,
  cloudRow: DeviceRow | undefined,
): ResolvedSetup {
  const replaces = cloudRow?.id ?? null;
  return {
    entry: {
      externalId: externalIdOfWatch(wearable.mac),
      driver: 'xiaomi_watch',
      address: wearable.mac,
      name: cloudRow === undefined ? wearable.name : (cloudRow.display_name ?? cloudRow.name),
      config: {
        family: 'xiaomi',
        model: wearable.model ?? cloudRow?.model ?? null,
        profileId,
        replaces,
      },
    },
    key: WATCH_AUTH_KEY.parse(wearable.authKey),
    replaces,
  };
}
