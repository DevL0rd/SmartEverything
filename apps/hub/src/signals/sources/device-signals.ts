import type { StateChange } from '@smarteverything/domain';
import type { DeviceRecord } from '../../database/port';
import { background } from '@smarteverything/logging';
import type { Store } from '../../store/store';
import type { DeviceLifecycle } from '../../state/device-lifecycle';
import type { SignalBus } from '../bus';
import { causeOfStateChange } from './device-cause';
import { lifecycleSignal, onlineSignal, stateSignal, type DeviceFactsSource } from './device';

export interface DeviceSignalsOptions {
  readonly store: Store;
  readonly signals: Pick<SignalBus, 'emit'>;
  readonly now: () => Date;
}

type Settled<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: unknown };

function settledOf<T>(work: Promise<T>): Promise<Settled<T>> {
  return work.then(
    (value) => ({ ok: true, value }),
    (error: unknown) => ({ ok: false, error }),
  );
}

export class DeviceSignals {
  private turn: Promise<void> = Promise.resolve();

  constructor(private readonly options: DeviceSignalsOptions) {}

  moved(change: StateChange): void {
    const at = this.options.now().toISOString();
    const device = this.factsOf(change.deviceId);
    if (device === undefined) return;
    const cause = settledOf(causeOfStateChange(this.options.store, change, at));
    this.inOrder(async () => {
      const read = await cause;
      if (!read.ok) throw read.error;
      const { cause: kind, facts } = read.value;
      const signal = stateSignal({ change, device, cause: kind, at });
      this.options.signals.emit({ ...signal, data: { ...signal.data, ...facts } });
    });
  }

  online(record: DeviceRecord, online: boolean): void {
    const device = this.factsOf(record.id);
    if (device === undefined) return;
    const at = this.options.now().toISOString();
    this.inOrder(() => {
      this.options.signals.emit(onlineSignal(record.id, device, online, at));
    });
  }

  settled(): Promise<void> {
    return this.turn;
  }

  lifecycle(change: DeviceLifecycle): void {
    const { device, identity } = change;
    const at = this.options.now().toISOString();
    const facts = this.factsOf(device.id);
    this.inOrder(() => {
      this.lifecycleEmit(change, identity, facts, at);
    });
  }

  private inOrder(work: () => Promise<void> | void): void {
    const next = this.turn.then(work);
    this.turn = next.then(
      () => undefined,
      () => undefined,
    );
    background(next, 'signals.device_signal_failed');
  }

  private lifecycleEmit(
    change: DeviceLifecycle,
    identity: DeviceLifecycle['identity'],
    facts: DeviceFactsSource | undefined,
    at: string,
  ): void {
    const { device } = change;
    this.options.signals.emit(
      lifecycleSignal({
        deviceId: device.id,
        device: facts ?? {
          provider: device.provider,
          kind: identity.kind,
          model: identity.model,
          name: identity.name,
          roomId: device.roomId,
          capabilities: device.capabilities,
        },
        change: change.change,
        detail: change.detail,
        at,
      }),
    );
  }

  private factsOf(deviceId: string): DeviceFactsSource | undefined {
    const row = this.options.store.live.home.devices.find(deviceId);
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
