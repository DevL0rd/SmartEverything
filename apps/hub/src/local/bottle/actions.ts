import {
  type BottleActionResult,
  type BottlePushAction,
  type BottleUvStart,
  type DeviceRow,
} from '@smarteverything/domain';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import type { Store } from '../../store/store';
import type { WatchBridges } from '../watch-bridge';
import type { BottleActionBroker } from './broker';

interface ActionsDeps {
  readonly store: Pick<Store, 'host'>;
  readonly broker: Pick<BottleActionBroker, 'run' | 'isRunning'>;
  readonly bridges: Pick<WatchBridges, 'holderOf'>;
  readonly now: () => Date;
}

export class BottleActions {
  constructor(private readonly deps: ActionsDeps) {}

  holderOf(device: DeviceRow): string | null {
    return this.deps.bridges.holderOf(device)?.clientId ?? null;
  }

  syncing(deviceId: string): boolean {
    return this.deps.broker.isRunning(deviceId);
  }

  async run(
    device: DeviceRow,
    entry: LocalDeviceEntry,
    action: BottlePushAction,
    uvMode: BottleUvStart | null = null,
  ): Promise<BottleActionResult> {
    const planned = await this.deps.store.host.read('bottleActionPlan', {
      target: { entry, deviceId: device.id },
      holder: this.holderOf(device),
      action,
      uvMode,
      now: this.deps.now().toISOString(),
    });
    return this.deps.broker.run(
      {
        clientIds: planned.clientIds,
        deviceId: device.id,
        name: device.display_name ?? device.name,
      },
      { action, uvMode, plan: planned.plan },
    );
  }
}
