import type { JsonValue } from '@smarteverything/domain';
import type { StateMemoryPort } from '@smarteverything/flow/interpret/state-ops';
import { failureLine } from '@smarteverything/logging';
import type { Clock } from '../../clock';
import type { StoreHost } from '../../store/host/host';
import type { ReadUnits } from '../../store/host/registry';
import type { UnitInput, UnitOutput } from '../../store/host/unit';
import type { NodeMemory } from './node-memory';
import { ReadFailure } from './read-port';

export type ReadFetch = <N extends keyof ReadUnits>(
  name: N,
  input: UnitInput<ReadUnits[N]>,
) => UnitOutput<ReadUnits[N]>;

export class ReadNotFetchedError extends Error {
  override readonly name = 'ReadNotFetchedError';

  constructor(readonly unit: string) {
    super(`The read ${unit} is still being fetched.`);
  }
}

type Fetched =
  { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly message: string };

interface Kept {
  readonly commit: () => void;
  readonly discard: () => void;
}

export class StepReads {
  private readonly fetched = new Map<string, Fetched>();
  private readonly pending = new Map<string, Promise<void>>();
  private kept: Kept[] = [];
  private frozen: Date | undefined;

  constructor(
    private readonly host: Pick<StoreHost, 'read'>,
    private readonly clock: Pick<Clock, 'now'>,
  ) {}

  readonly now = (): Date => {
    this.frozen ??= this.clock.now();
    return this.frozen;
  };

  readonly fetch: ReadFetch = (name, input) => this.take(name, input);

  stateMemory(port: StateMemoryPort): StateMemoryPort {
    const held = new Map<string, JsonValue>();
    return {
      recall: (automationId, slot): JsonValue | undefined => {
        const key = `${automationId}/${slot}`;
        return held.has(key) ? held.get(key) : port.recall(automationId, slot);
      },
      keep: (automationId, slot, memory, wakeAt): void => {
        held.set(`${automationId}/${slot}`, memory);
        this.kept.push({
          commit: () => {
            held.delete(`${automationId}/${slot}`);
            port.keep(automationId, slot, memory, wakeAt);
          },
          discard: () => held.delete(`${automationId}/${slot}`),
        });
      },
    };
  }

  nodeMemory(memory: NodeMemory): NodeMemory {
    const held = new Map<string, JsonValue>();
    return {
      recall: (automationId, nodeId): JsonValue | undefined => {
        const key = `${automationId}/${nodeId}`;
        return held.has(key) ? held.get(key) : memory.recall(automationId, nodeId);
      },
      keep: (automationId, nodeId, value): void => {
        held.set(`${automationId}/${nodeId}`, value);
        this.kept.push({
          commit: () => {
            held.delete(`${automationId}/${nodeId}`);
            memory.keep(automationId, nodeId, value);
          },
          discard: () => held.delete(`${automationId}/${nodeId}`),
        });
      },
    };
  }

  private take<N extends keyof ReadUnits>(
    name: N,
    input: UnitInput<ReadUnits[N]>,
  ): UnitOutput<ReadUnits[N]>;
  private take<N extends keyof ReadUnits>(name: N, input: UnitInput<ReadUnits[N]>): unknown {
    const key = `${name}:${JSON.stringify(input)}`;
    const held = this.fetched.get(key);
    if (held !== undefined) {
      if (!held.ok) throw new ReadFailure('Failed', held.message);
      return held.value;
    }
    if (!this.pending.has(key))
      this.pending.set(
        key,
        this.host.read(name, input).then(
          (value: unknown) => {
            this.fetched.set(key, { ok: true, value });
          },
          (cause: unknown) => {
            this.fetched.set(key, { ok: false, message: failureLine(cause) });
          },
        ),
      );
    throw new ReadNotFetchedError(name);
  }

  completed(): void {
    const kept = this.kept;
    this.kept = [];
    this.fetched.clear();
    this.frozen = undefined;
    for (const keep of kept) keep.commit();
  }

  async suspended(): Promise<void> {
    const kept = this.kept;
    this.kept = [];
    for (const keep of kept) keep.discard();
    const pending = [...this.pending.values()];
    this.pending.clear();
    await Promise.all(pending);
  }
}
