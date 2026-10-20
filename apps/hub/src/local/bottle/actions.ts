import {
  type BottleActionResult,
  type BottlePushAction,
  type BottleUvStart,
  type DeviceRow,
} from '@smarteverything/domain';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import type { Store } from '../../store/store';
import type { WatchBridges } from '../watch-bridge';
import { entryConfigOf } from './config';
import type { BottleActionBroker } from './broker';
import { actionPlanOf, type PlanDeps } from './plan';

interface ActionsDeps {
  readonly store: Pick<Store, 'clients' | 'profiles'>;
  readonly broker: Pick<BottleActionBroker, 'run' | 'isRunning'>;
  readonly bridges: Pick<WatchBridges, 'holderOf'>;
  readonly plan: PlanDeps;
}

export function phoneClientsOf(
  store: Pick<Store, 'clients' | 'profiles'>,
  profileId: string | null,
  holder: string | null,
): string[] {
  const phones = store.clients
    .list()
    .filter(
      (client) =>
        client.platform === 'android' &&
        (profileId === null
          ? client.role === 'owner'
          : store.profiles.activeOf(client.id).id === profileId),
    )
    .map((client) => client.id);
  return holder !== null && phones.includes(holder) ? [holder] : phones;
}

export class BottleActions {
  constructor(private readonly deps: ActionsDeps) {}

  holderOf(device: DeviceRow): string | null {
    return this.deps.bridges.holderOf(device)?.clientId ?? null;
  }

  syncing(deviceId: string): boolean {
    return this.deps.broker.isRunning(deviceId);
  }

  run(
    device: DeviceRow,
    entry: LocalDeviceEntry,
    action: BottlePushAction,
    uvMode: BottleUvStart | null = null,
  ): Promise<BottleActionResult> {
    const config = entryConfigOf(entry);
    return this.deps.broker.run(
      {
        clientIds: phoneClientsOf(this.deps.store, config.binding.profileId, this.holderOf(device)),
        deviceId: device.id,
        name: device.display_name ?? device.name,
      },
      {
        action,
        uvMode,
        plan: actionPlanOf(this.deps.plan, { entry, deviceId: device.id }, action, uvMode),
      },
    );
  }
}
