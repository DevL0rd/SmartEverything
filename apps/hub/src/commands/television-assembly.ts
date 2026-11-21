import type { JsonValue, TelevisionSettingsRow } from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import type { Clock } from '../clock';
import { wakeOnLan } from '../network/wake-on-lan';
import type { SignalBus } from '../signals/bus';
import type { Inventory } from '../state/inventory';
import type { StateWriter } from '../state/state-writer';
import type { Store } from '../store/store';
import type { AdapterDirectory } from './executor';
import { TelevisionRouting } from './television-routing';
import { TelevisionWake } from './television-wake';

export interface TelevisionParts {
  readonly store: Store;
  readonly clock: Clock;
  readonly adapters: AdapterDirectory;
  readonly state: Pick<StateWriter, 'valueOf'>;
  readonly inventory: Pick<Inventory, 'deviceById'>;
  readonly signals: Pick<SignalBus, 'subscribe'>;
  readonly logFor: (area: string) => Logger;
}

class TelevisionSettingsCache {
  private readonly rows = new Map<string, TelevisionSettingsRow>();
  private loading: Promise<void> | undefined;

  constructor(private readonly store: Pick<Store, 'host' | 'feed'>) {}

  async find(deviceId: string): Promise<TelevisionSettingsRow | undefined> {
    this.loading ??= this.load().catch((cause: unknown) => {
      this.loading = undefined;
      throw cause;
    });
    await this.loading;
    return this.rows.get(deviceId);
  }

  private async load(): Promise<void> {
    const fresh = new Set<string>();
    const stop = this.store.feed.subscribe((change) => {
      if (change.table !== 'television_settings' || change.record === null) return;
      fresh.add(change.record.device_id);
      this.rows.set(change.record.device_id, change.record);
    });
    try {
      for (const row of await this.store.host.call('televisionSettings', 'list'))
        if (!fresh.has(row.device_id)) this.rows.set(row.device_id, row);
    } catch (cause) {
      stop();
      throw cause;
    }
  }
}

export function televisionRouting(parts: TelevisionParts): TelevisionRouting {
  const log = parts.logFor('television');
  const cache = new TelevisionSettingsCache(parts.store);
  const settingsOf = (deviceId: string): Promise<TelevisionSettingsRow | undefined> =>
    cache.find(deviceId);
  return new TelevisionRouting({
    adapters: parts.adapters,
    valueOf: (deviceId, capability): JsonValue | undefined =>
      parts.state.valueOf(deviceId, capability),
    settingsOf,
    wake: new TelevisionWake({
      wake: wakeOnLan,
      settingsOf,
      online: (deviceId): boolean => parts.inventory.deviceById(deviceId)?.online === true,
      woke: (deviceId): void => {
        background(
          parts.store.host.call(
            'televisionSettings',
            'recordWakeWorked',
            deviceId,
            parts.clock.now().toISOString(),
          ),
          'television.wake_record_failed',
          { deviceId },
        );
      },
      subscribe: (listener) => parts.signals.subscribe(listener),
      clock: parts.clock,
      log,
    }),
    log,
  });
}
