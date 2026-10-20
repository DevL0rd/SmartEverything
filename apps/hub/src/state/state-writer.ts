import {
  jsonEquals,
  type DeviceCapability,
  type JsonValue,
  type Provider,
  type StateChange,
  type StateUpdate,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { HubDatabase, StateRecord } from '../database/port';
import type { Clock } from '../clock';
import { ChangeThreshold } from './change-threshold';
import type { Inventory } from './inventory';
import { RepeatLog } from '../providers/repeat-log';
import { IngestTally } from './ingest-tally';
import { WriteQueue, logQueueNotice } from './write-queue';

export interface StateWriterOptions {
  readonly store: Pick<HubDatabase, 'loadState' | 'upsertState'>;
  readonly inventory: Pick<Inventory, 'deviceOf' | 'deviceById'>;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
  readonly changed: (change: StateChange) => void;
  readonly moved: (change: StateChange) => void;
}

function capabilityOf(
  device: { readonly capabilities: readonly DeviceCapability[] } | undefined,
  key: string,
): DeviceCapability | undefined {
  return device?.capabilities.find((capability) => capability.key === key);
}

function keyOf(deviceId: string, capability: string): string {
  return `${deviceId}|${capability}`;
}

const UNCHANGED_REWRITE_MS = 30_000;

const STATE_APPEND_POLICY = {
  batchLimit: 256,
  attempts: 3,
  retryMs: 100,
};

export class StateWriter {
  private readonly values = new Map<string, JsonValue>();
  private readonly observed = new Map<string, StateRecord>();
  private readonly queue: WriteQueue<StateRecord, true>;
  private readonly tally: IngestTally;
  private readonly repeat: RepeatLog;
  private readonly threshold: ChangeThreshold;

  constructor(private readonly options: StateWriterOptions) {
    this.threshold = new ChangeThreshold(options.clock, options.moved);
    this.tally = new IngestTally(options.log, 'state.ingest_summary');
    this.repeat = new RepeatLog(options.log);
    this.queue = new WriteQueue<StateRecord, true>({
      write: async (rows): Promise<readonly true[]> => {
        await options.store.upsertState(rows);
        return rows.map(() => true);
      },
      keyOf: (row): string => keyOf(row.deviceId, row.capability),
      append: STATE_APPEND_POLICY,
      observe: (notice): void => {
        logQueueNotice(options.log, 'state', notice);
      },
      failed: (rows, cause): void => {
        options.log.error('state.write_failed', cause, {
          count: rows.length,
          devices: new Set(rows.map((row) => row.deviceId)).size,
        });
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
      this.tally.count(provider, 'unknown');
      this.repeat.warn('state.device_unknown', `${provider}|${update.externalId}`, {
        provider,
        externalId: update.externalId,
        capability: update.capability,
      });
      return;
    }
    const key = keyOf(device.id, update.capability);
    const observedAt = new Date(update.observedAt).toISOString();
    const previous = this.observed.get(key);
    if (previous !== undefined && observedAt < previous.observedAt) {
      this.tally.count(provider, 'stale');
      return;
    }
    const unchanged = previous !== undefined && jsonEquals(previous.value, update.value);
    if (
      unchanged &&
      Date.parse(observedAt) - Date.parse(previous.observedAt) < UNCHANGED_REWRITE_MS
    ) {
      this.tally.count(provider, 'unchanged');
      return;
    }
    const record = {
      deviceId: device.id,
      capability: update.capability,
      value: update.value,
      observedAt,
    };
    this.queue.enqueue(record);
    this.observed.set(key, record);
    this.values.set(key, update.value);
    this.tally.count(provider, unchanged ? 'refreshed' : 'changed');
    if (!unchanged) {
      this.announce(
        {
          deviceId: device.id,
          capability: update.capability,
          value: update.value,
          previous: previous?.value,
        },
        capabilityOf(device, update.capability),
      );
    }
  }

  async commitObservation(row: StateRecord | null, commit: () => boolean): Promise<boolean> {
    await this.queue.settled();
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
    this.values.set(key, row.value);
    this.observed.set(key, record);
    if (previous === undefined || !jsonEquals(previous, row.value)) {
      this.announce(
        { deviceId: row.deviceId, capability: row.capability, value: row.value, previous },
        capabilityOf(this.options.inventory.deviceById(row.deviceId), row.capability),
      );
    }
    return true;
  }

  private announce(change: StateChange, capability: DeviceCapability | undefined): void {
    this.options.changed(change);
    this.threshold.offer(change, capability);
  }

  settled(): Promise<void> {
    return this.queue.settled();
  }

  close(): Promise<void> {
    this.threshold.close();
    return this.queue.close();
  }
}
