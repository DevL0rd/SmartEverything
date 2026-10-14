import { randomUUID } from 'node:crypto';
import { HarnessRuntimeError } from '../host/errors';
import type { AiNativeReferenceResult } from '@smarteverything/domain';

const CURSOR_MAX = 64;
const CURSOR_MS = 60_000;
export interface NativeReferenceProgress {
  readonly scope: string;
  readonly next: (limit: number, signal?: AbortSignal) => Promise<AiNativeReferenceResult>;
  readonly close: () => Promise<void>;
}
export class NativeReferenceCursors {
  private readonly entries = new Map<
    string,
    {
      readonly owner: string;
      readonly progress: NativeReferenceProgress;
      readonly timer: ReturnType<typeof setTimeout>;
    }
  >();
  private readonly pending = new Set<Promise<void>>();
  private readonly failures: unknown[] = [];
  keep(owner: string, progress: NativeReferenceProgress): string {
    if (this.entries.size >= CURSOR_MAX)
      throw new HarnessRuntimeError(
        'operation_failed',
        'Native reference cursor capacity is exhausted.',
      );
    const id = randomUUID();
    const timer = setTimeout(() => {
      void this.release(id).catch((error: unknown) => {
        this.failures.push(error);
      });
    }, CURSOR_MS);
    timer.unref();
    this.entries.set(id, { owner, progress, timer });
    return id;
  }
  take(id: string, scope: string): NativeReferenceProgress {
    const entry = this.entries.get(id);
    if (entry?.progress.scope !== scope)
      throw new HarnessRuntimeError(
        'operation_failed',
        'Native reference cursor expired or its exact scope changed.',
      );
    clearTimeout(entry.timer);
    this.entries.delete(id);
    return entry.progress;
  }
  release(id: string, owner?: string): Promise<void> {
    const entry = this.entries.get(id);
    if (entry === undefined) return Promise.resolve();
    if (owner !== undefined && entry.owner !== owner)
      return Promise.reject(
        new HarnessRuntimeError(
          'ownership_lost',
          'Native reference cursor belongs to another conversation.',
        ),
      );
    clearTimeout(entry.timer);
    this.entries.delete(id);
    const work = Promise.resolve().then(() => entry.progress.close());
    this.pending.add(work);
    void work.then(
      () => {
        this.pending.delete(work);
      },
      () => {
        this.pending.delete(work);
      },
    );
    return work;
  }
  async close(): Promise<void> {
    const owned = [...this.entries.keys()].map((id) => this.release(id));
    const results = await Promise.allSettled([...owned, ...this.pending]);
    const failures: unknown[] = [...this.failures];
    for (const result of results) if (result.status === 'rejected') failures.push(result.reason);
    if (failures.length > 0)
      throw new AggregateError(failures, 'Native reference cursor cleanup failed.');
  }
}
