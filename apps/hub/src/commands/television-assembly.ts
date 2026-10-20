import type { JsonValue, TelevisionSettingsRow } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
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

export function televisionRouting(parts: TelevisionParts): TelevisionRouting {
  const log = parts.logFor('television');
  const settingsOf = (deviceId: string): TelevisionSettingsRow | undefined =>
    parts.store.televisionSettings.find(deviceId);
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
        parts.store.televisionSettings.recordWakeWorked(deviceId, parts.clock.now().toISOString());
      },
      subscribe: (listener) => parts.signals.subscribe(listener),
      clock: parts.clock,
      log,
    }),
    log,
  });
}
