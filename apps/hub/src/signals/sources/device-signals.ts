import type { StateChange } from '@smarteverything/domain';
import type { DeviceRecord } from '../../database/port';
import type { LogStore } from '../../devices/device-log/types';
import type { DeviceLifecycle } from '../../state/device-lifecycle';
import type { SignalBus } from '../bus';
import { causeOfStateChange } from './device-cause';
import { lifecycleSignal, onlineSignal, stateSignal, type DeviceFactsSource } from './device';

export interface DeviceSignalsOptions {
  readonly store: LogStore;
  readonly signals: Pick<SignalBus, 'emit'>;
  readonly now: () => Date;
}

export class DeviceSignals {
  constructor(private readonly options: DeviceSignalsOptions) {}

  moved(change: StateChange): void {
    const at = this.options.now().toISOString();
    const device = this.factsOf(change.deviceId);
    if (device === undefined) return;
    const { cause, facts } = causeOfStateChange(this.options.store, change, at);
    const signal = stateSignal({ change, device, cause, at });
    this.options.signals.emit({ ...signal, data: { ...signal.data, ...facts } });
  }

  online(record: DeviceRecord, online: boolean): void {
    const device = this.factsOf(record.id);
    if (device === undefined) return;
    this.options.signals.emit(
      onlineSignal(record.id, device, online, this.options.now().toISOString()),
    );
  }

  lifecycle(change: DeviceLifecycle): void {
    const { device, identity } = change;
    this.options.signals.emit(
      lifecycleSignal({
        deviceId: device.id,
        device: this.factsOf(device.id) ?? {
          provider: device.provider,
          kind: identity.kind,
          model: identity.model,
          name: identity.name,
          roomId: device.roomId,
          capabilities: device.capabilities,
        },
        change: change.change,
        detail: change.detail,
        at: this.options.now().toISOString(),
      }),
    );
  }

  private factsOf(deviceId: string): DeviceFactsSource | undefined {
    const row = this.options.store.devices.find(deviceId);
    return row === undefined
      ? undefined
      : {
          provider: row.provider,
          kind: row.kind,
          model: row.model,
          name: row.display_name ?? row.name,
          roomId: row.room_id,
          capabilities: row.capabilities,
        };
  }
}
