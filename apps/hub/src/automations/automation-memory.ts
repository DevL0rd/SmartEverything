import { ApiError, JSON_VALUE } from '@smarteverything/domain';
import type { NodeStateRow, NodeStateWrite } from '../store/repositories/automation-node-state';
import type {
  OwnedValueContent,
  OwnedValueRow,
} from '../store/repositories/automation-owned-values';
import type { MemoryWrites } from './engine-store';
import type { MemoryRows } from './engine-units';

export class AutomationMemoryMissingError extends Error {
  override readonly name = 'AutomationMemoryMissingError';

  constructor(readonly automationId: string) {
    super(`The kept state of automation ${automationId} is not loaded.`);
  }
}

export interface NodeStateRows {
  readonly get: (
    automationId: string,
    nodeId: string,
    partition?: string,
  ) => NodeStateRow | undefined;
  readonly save: (write: NodeStateWrite) => void;
}

export interface OwnedValues {
  readonly list: (automationId: string) => readonly OwnedValueRow[];
  readonly write: (
    automationId: string,
    id: string,
    content: OwnedValueContent,
    expectedRevision?: number,
  ) => void;
}

interface Held {
  readonly owned: Map<string, OwnedValueRow>;
  readonly state: Map<string, NodeStateRow>;
  readonly touched: Map<string, number>;
}

export interface AutomationMemoryPorts {
  readonly writes: MemoryWrites;
  readonly now: () => Date;
}

function stateKey(nodeId: string, partition: string): string {
  return `state\u0000${nodeId}\u0000${partition}`;
}

function ownedKey(id: string): string {
  return `owned\u0000${id}`;
}

export class AutomationMemory {
  readonly state: NodeStateRows;
  readonly owned: OwnedValues;
  private readonly held = new Map<string, Held>();
  private sequence = 0;

  constructor(private readonly ports: AutomationMemoryPorts) {
    this.state = {
      get: (automationId, nodeId, partition = ''): NodeStateRow | undefined =>
        this.of(automationId).state.get(stateKey(nodeId, partition)),
      save: (write): void => {
        this.saveState(write);
      },
    };
    this.owned = {
      list: (automationId): readonly OwnedValueRow[] => [...this.of(automationId).owned.values()],
      write: (automationId, id, content, expectedRevision): void => {
        this.writeOwned(automationId, id, content, expectedRevision);
      },
    };
  }

  mark(): number {
    return this.sequence;
  }

  holds(automationId: string): boolean {
    return this.held.has(automationId);
  }

  hold(automationId: string, rows: MemoryRows, since: number): void {
    const next: Held = {
      owned: new Map(rows.owned.map((row) => [ownedKey(row.id), row])),
      state: new Map(rows.state.map((row) => [stateKey(row.node_id, row.partition), row])),
      touched: new Map(),
    };
    const before = this.held.get(automationId);
    if (before !== undefined) {
      for (const [key, at] of before.touched) {
        if (at <= since) continue;
        next.touched.set(key, at);
        const state = before.state.get(key);
        if (state !== undefined) next.state.set(key, state);
        const owned = before.owned.get(key);
        if (owned !== undefined) next.owned.set(key, owned);
      }
    }
    this.held.set(automationId, next);
  }

  forget(automationId: string): void {
    this.held.delete(automationId);
  }

  private of(automationId: string): Held {
    const held = this.held.get(automationId);
    if (held === undefined) throw new AutomationMemoryMissingError(automationId);
    return held;
  }

  private touch(held: Held, key: string): void {
    this.sequence += 1;
    held.touched.set(key, this.sequence);
  }

  private saveState(write: NodeStateWrite): void {
    const held = this.of(write.automationId);
    const partition = write.partition ?? '';
    const key = stateKey(write.nodeId, partition);
    held.state.set(key, {
      automation_id: write.automationId,
      node_id: write.nodeId,
      partition,
      state: JSON_VALUE.parse(write.state),
      wake_at:
        write.wakeAt === undefined || write.wakeAt === null
          ? null
          : new Date(write.wakeAt).toISOString(),
      updated_at: this.ports.now().toISOString(),
    });
    this.touch(held, key);
    this.ports.writes.saveState(write);
  }

  private writeOwned(
    automationId: string,
    id: string,
    content: OwnedValueContent,
    expectedRevision: number | undefined,
  ): void {
    const held = this.of(automationId);
    const key = ownedKey(id);
    const before = held.owned.get(key);
    if (before === undefined)
      throw new ApiError('not_found', `The owned automation Value ${id} does not exist.`);
    if (expectedRevision !== undefined && before.revision !== expectedRevision)
      throw new ApiError('conflict', 'The Value changed; reload its current revision.');
    if (content.kind !== before.content.kind)
      throw new ApiError('invalid_request', 'A Value’s kind cannot change.');
    held.owned.set(key, {
      ...before,
      content,
      revision: before.revision + 1,
      updated_at: this.ports.now().toISOString(),
    });
    this.touch(held, key);
    this.ports.writes.writeOwned(automationId, id, content, before.revision);
  }
}
