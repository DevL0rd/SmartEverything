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

interface Transition {
  readonly record: StateRecord;
  readonly change: StateChange | null;
}

function keyOf(deviceId: string, capability: string): string {
  return `${deviceId}|${capability}`;
}

const STATE_APPEND_POLICY = {
  pendingLimit: 4096,
  batchLimit: 256,
  attempts: 3,
  retryMs: 100,
};

export class StateWriter {
  private generation = 0;
  private readonly values = new Map<string, JsonValue>();
  private readonly observed = new Map<string, StateRecord>();
  private readonly queue: WriteQueue<Transition, true>;

  constructor(private readonly options: StateWriterOptions) {
    this.queue = new WriteQueue<Transition, true>({
      write: async (rows): Promise<readonly true[]> => {
        await options.store.upsertState(rows.map((row) => row.record));
        for (const row of rows) {
          this.values.set(keyOf(row.record.deviceId, row.record.capability), row.record.value);
          if (row.change !== null) options.changed(row.change);
        }
        return rows.map(() => true);
      },
      keyOf: (): null => null,
      append: STATE_APPEND_POLICY,
      failed: (rows, cause): void => {
        options.log.error('state.write_failed', cause, { count: rows.length });
      },
    });
  }

  async load(): Promise<void> {
    for (const row of await this.options.store.loadState()) {
      this.values.set(keyOf(row.deviceId, row.capability), row.value);
      this.observed.set(keyOf(row.deviceId, row.capability), row);
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
    const observedAt = new Date(update.observedAt).toISOString();
    const previous = this.observed.get(key);
    if (previous !== undefined && observedAt < previous.observedAt) return;
    const unchanged = previous !== undefined && jsonEquals(previous.value, update.value);
    if (unchanged && observedAt === previous.observedAt) return;
    const change = unchanged
      ? null
      : {
          deviceId: device.id,
          capability: update.capability,
          value: update.value,
          previous: previous?.value,
        };
    const record = {
      deviceId: device.id,
      capability: update.capability,
      value: update.value,
      observedAt,
    };
    this.queue.enqueue({
      record,
      change,
    });
    this.generation += 1;
    this.observed.set(key, record);
  }

  async commitObservation(row: StateRecord | null, commit: () => boolean): Promise<boolean> {
    let generation: number;
    do {
      generation = this.generation;
      await this.queue.settled();
    } while (generation !== this.generation);
    if (row === null) {
      return commit();
    }
    const key = keyOf(row.deviceId, row.capability);
    const record = { ...row, observedAt: new Date(row.observedAt).toISOString() };
    const observed = this.observed.get(key);
    if (observed !== undefined && record.observedAt < observed.observedAt) return false;
    const previous = this.values.get(key);
    if (!commit()) {
      return false;
    }
    this.generation += 1;
    this.values.set(key, row.value);
    this.observed.set(key, record);
    if (previous === undefined || !jsonEquals(previous, row.value)) {
      this.options.changed({ ...row, previous });
    }
    return true;
  }

  settled(): Promise<void> {
    return this.queue.settled();
  }

  close(): Promise<void> {
    return this.queue.close();
  }
}
