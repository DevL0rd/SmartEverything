import { isFinished, type CommandRow, type JsonValue } from '@smarteverything/domain';
import type { CommandLedger } from './command-ledger';
import type { EntityStore } from './entity-store';
import type { Device } from './state';
import { sameJson } from './same-json';

const START_INTERVAL_MS = 200;
const EXPIRY_GRACE_MS = 5000;

interface Pending {
  readonly device: Device;
  readonly capability: string;
  readonly value: JsonValue;
  readonly done: (success: boolean) => void;
}

interface Lane {
  readonly pending: Map<string, Pending>;
  running: Pending | null;
  startedAt: number;
}

function finished(store: EntityStore, row: CommandRow): Promise<boolean> {
  return new Promise((resolve) => {
    const end = (success: boolean): void => {
      clearTimeout(timer);
      unsubscribe();
      resolve(success);
    };
    const check = (): void => {
      const current = store.get().tables.commands.byId[row.id];
      if (current !== undefined && isFinished(current.status)) {
        end(current.status === 'succeeded');
      }
    };
    const timer = setTimeout(
      () => {
        end(false);
      },
      Math.max(0, Date.parse(row.expires_at) - Date.now() + EXPIRY_GRACE_MS),
    );
    const unsubscribe = store.subscribe(check);
    check();
  });
}

export class LiveCommands {
  private readonly lanes = new Map<string, Lane>();

  constructor(
    private readonly store: EntityStore,
    private readonly ledger: CommandLedger,
  ) {}

  set(device: Device, capability: string, value: JsonValue): Promise<boolean> {
    const lane = this.lanes.get(device.id) ?? {
      pending: new Map<string, Pending>(),
      running: null,
      startedAt: 0,
    };
    this.lanes.set(device.id, lane);
    return new Promise((done) => {
      const previous = lane.pending.get(capability);
      previous?.done(false);
      lane.pending.delete(capability);
      lane.pending.set(capability, { device, capability, value, done });
      if (lane.running === null) void this.drain(device.id);
    });
  }

  private async drain(deviceId: string): Promise<void> {
    const lane = this.lanes.get(deviceId);
    if (lane === undefined) return;
    const next = lane.pending.values().next().value;
    if (next === undefined) return;
    lane.pending.delete(next.capability);
    lane.running = next;
    const delay = Math.max(0, lane.startedAt + START_INTERVAL_MS - Date.now());
    if (delay > 0)
      await new Promise<void>((resolve) => {
        setTimeout(resolve, delay);
      });
    lane.startedAt = Date.now();
    const result = await this.ledger.send(next.device, next.capability, next.value);
    const success = result.sent && (await finished(this.store, result.row));
    next.done(success);
    const queued = lane.pending.get(next.capability);
    if (
      queued === lane.pending.values().next().value &&
      queued !== undefined &&
      sameJson(queued.value, next.value)
    ) {
      lane.pending.delete(next.capability);
      queued.done(success);
    }
    lane.running = null;
    void this.drain(deviceId);
  }
}

const queues = new WeakMap<EntityStore, LiveCommands>();

export function liveCommands(store: EntityStore, ledger: CommandLedger): LiveCommands {
  const existing = queues.get(store);
  if (existing !== undefined) return existing;
  const queue = new LiveCommands(store, ledger);
  queues.set(store, queue);
  return queue;
}
