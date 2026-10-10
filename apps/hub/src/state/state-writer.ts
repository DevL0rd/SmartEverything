import {
  jsonEquals,
  type JsonValue,
  type Provider,
  type StateChange,
  type StateUpdate,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { HubDatabase, StateRecord } from '../database/port';
import type { Inventory } from './inventory';
import { WriteQueue } from './write-queue';

export interface StateWriterOptions {
  readonly store: Pick<HubDatabase, 'loadState' | 'upsertState'>;
  readonly inventory: Pick<Inventory, 'deviceOf'>;
  readonly log: Logger;
  readonly changed: (change: StateChange) => void;
}

function keyOf(deviceId: string, capability: string): string {
  return `${deviceId}|${capability}`;
}

export class StateWriter {
  private readonly values = new Map<string, JsonValue>();
  private readonly queue: WriteQueue<StateRecord, undefined>;

  constructor(private readonly options: StateWriterOptions) {
    this.queue = new WriteQueue<StateRecord, undefined>({
      write: async (rows): Promise<readonly undefined[]> => {
        await options.store.upsertState(rows);
        return rows.map(() => undefined);
      },
      keyOf: (row): string => keyOf(row.deviceId, row.capability),
      failed: (rows, cause): void => {
        for (const row of rows) {
          this.values.delete(keyOf(row.deviceId, row.capability));
        }
        options.log.error('state.write_failed', cause, { count: rows.length });
      },
    });
  }

  async load(): Promise<void> {
    for (const row of await this.options.store.loadState()) {
      this.values.set(keyOf(row.deviceId, row.capability), row.value);
    }
  }

  valueOf(deviceId: string, capability: string): JsonValue | undefined {
    return this.values.get(keyOf(deviceId, capability));
  }

  push(provider: Provider, update: StateUpdate): void {
    const device = this.options.inventory.deviceOf(provider, update.externalId);
    if (device === undefined) {
      this.options.log.warn('state.device_unknown', { provider, externalId: update.externalId });
      return;
    }
    const key = keyOf(device.id, update.capability);
    const previous = this.values.get(key);
    if (previous !== undefined && jsonEquals(previous, update.value)) {
      return;
    }
    this.values.set(key, update.value);
    this.queue.enqueue({
      deviceId: device.id,
      capability: update.capability,
      value: update.value,
      observedAt: update.observedAt,
    });
    this.options.changed({
      deviceId: device.id,
      capability: update.capability,
      value: update.value,
      previous,
    });
  }

  settled(): Promise<void> {
    return this.queue.settled();
  }
}
