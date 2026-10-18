import { randomUUID } from 'node:crypto';
import { HarnessRuntimeError } from '../host/errors';
import type { AiNativeReferenceResult } from '@smarteverything/domain';

const CURSOR_MS = 60_000;
export interface NativeReferenceProgress {
  readonly scope: string;
  readonly next: (limit: number, signal?: AbortSignal) => Promise<AiNativeReferenceResult>;
}
interface Entry {
  readonly owner: string;
  readonly progress: NativeReferenceProgress;
  readonly timer: ReturnType<typeof setTimeout>;
}
export class NativeReferenceCursors {
  private readonly entries = new Map<string, Entry>();

  keep(owner: string, progress: NativeReferenceProgress): string {
    const id = randomUUID();
    const timer = setTimeout(() => {
      this.entries.delete(id);
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
    this.drop(id, entry);
    return entry.progress;
  }

  release(id: string, owner: string): void {
    const entry = this.entries.get(id);
    if (entry === undefined) return;
    if (entry.owner !== owner)
      throw new HarnessRuntimeError(
        'ownership_lost',
        'Native reference cursor belongs to another conversation.',
      );
    this.drop(id, entry);
  }

  releaseOwner(owner: string): void {
    for (const [id, entry] of this.entries) if (entry.owner === owner) this.drop(id, entry);
  }

  clear(): void {
    for (const [id, entry] of this.entries) this.drop(id, entry);
  }

  private drop(id: string, entry: Entry): void {
    clearTimeout(entry.timer);
    this.entries.delete(id);
  }
}
