import type { StoredAutomationRow } from '@smarteverything/domain';
import type { RunState } from '@smarteverything/flow/state/run-state';
import type { AutomationMemory } from './automation-memory';
import type { EngineStore } from './engine-store';
import type { PlanBook } from './engine-v3-plans';
import type { Loaded, SyncReport } from './engine-v3-types';

export class SerialLoads {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly ready: () => Promise<void>) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(this.ready).then(work);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  async settled(): Promise<void> {
    for (let current = this.queue; ; current = this.queue) {
      await current;
      if (current === this.queue) return;
    }
  }
}

export interface LoadPorts {
  readonly store: EngineStore;
  readonly memory: AutomationMemory;
  readonly book: Pick<PlanBook, 'load'>;
}

export async function holdMemory(ports: LoadPorts, automationId: string): Promise<void> {
  const { memory } = ports;
  if (memory.holds(automationId)) return;
  const since = memory.mark();
  memory.hold(automationId, await ports.store.memory(automationId), since);
}

export async function prefetchWaiting(
  ports: LoadPorts,
  states: readonly RunState[],
): Promise<ReadonlyMap<string, StoredAutomationRow>> {
  const rows = new Map<string, StoredAutomationRow>();
  const ids = [...new Set(states.map((state) => state.automationId))];
  await Promise.all([
    ports.book.load(states.flatMap((state) => state.planRefs)),
    ...ids.map(async (automationId) => {
      const row = await ports.store.program(automationId);
      if (row !== undefined) rows.set(automationId, row);
      await holdMemory(ports, automationId);
    }),
  ]);
  return rows;
}

export function syncReport(
  results: readonly ('loaded' | 'unchanged' | 'refused')[],
  removed: number,
): SyncReport {
  const count = (kind: 'loaded' | 'unchanged' | 'refused'): number =>
    results.filter((result) => result === kind).length;
  return {
    loaded: count('loaded'),
    unchanged: count('unchanged'),
    removed,
    refused: count('refused'),
  };
}

export async function refreshCallees(
  loaded: Map<string, Loaded>,
  book: Pick<PlanBook, 'callees'>,
): Promise<void> {
  await Promise.all(
    [...loaded.entries()].map(async ([automationId, held]) => {
      const callees = await book.callees(held.subject.plan);
      if (loaded.get(automationId) !== held) return;
      loaded.set(automationId, { ...held, subject: { ...held.subject, callees } });
    }),
  );
}
