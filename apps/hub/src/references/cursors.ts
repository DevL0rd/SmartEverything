import { randomUUID } from 'node:crypto';
import { ApiError } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { ReferenceSearchProgress } from './contracts';

const CURSOR_LIMIT = 64;
const CURSOR_LIFETIME_MS = 60_000;
export interface ReferenceCursor {
  scope: string;
  readonly progresses: Map<string, ReferenceSearchProgress>;
  readonly incomplete: Set<string>;
}
interface RetainedCursor {
  readonly value: ReferenceCursor;
  readonly timer: ReturnType<typeof setTimeout>;
}
export class ReferenceCursors {
  private closed = false;
  private closing: Promise<void> | undefined;
  private readonly retained = new Map<string, RetainedCursor>();
  private readonly cleaning = new Set<Promise<void>>();
  private readonly log = new Logger('hub.ai-references');
  take(id: string, scope: string): ReferenceCursor {
    this.assertOpen();
    const entry = this.retained.get(id);
    if (entry === undefined)
      throw new ApiError('conflict', 'The reference cursor expired or was already consumed.');
    if (entry.value.scope !== scope)
      throw new ApiError(
        'conflict',
        'The reference cursor belongs to another actor, query or changed source binding.',
      );
    this.retained.delete(id);
    clearTimeout(entry.timer);
    return entry.value;
  }
  async keep(value: ReferenceCursor): Promise<string> {
    this.assertOpen();
    while (this.retained.size + this.cleaning.size >= CURSOR_LIMIT) {
      const oldest = this.retained.keys().next().value;
      if (oldest === undefined) await finishReferenceCleanup([...this.cleaning]);
      else await this.expire(oldest);
    }
    this.assertOpen();
    const id = randomUUID();
    const timer = setTimeout(() => {
      void this.expire(id).catch((cause: unknown) => {
        this.log.error('cursor.close_failed', cause);
      });
    }, CURSOR_LIFETIME_MS);
    timer.unref();
    this.retained.set(id, { value, timer });
    return id;
  }
  private async expire(id: string): Promise<void> {
    const entry = this.retained.get(id);
    if (entry === undefined) return;
    this.retained.delete(id);
    clearTimeout(entry.timer);
    const cleanup = closeReferenceCursor(entry.value);
    this.cleaning.add(cleanup);
    try {
      await cleanup;
    } finally {
      this.cleaning.delete(cleanup);
    }
  }
  private assertOpen(): void {
    if (this.closed) throw new ApiError('conflict', 'Reference cursor storage is closed.');
  }
  close(): Promise<void> {
    this.closed = true;
    this.closing ??= finishReferenceCleanup([
      ...this.cleaning,
      ...[...this.retained.keys()].map(async (id): Promise<void> => {
        await this.expire(id);
      }),
    ]);
    return this.closing;
  }
}
export async function closeReferenceCursor(cursor: ReferenceCursor): Promise<void> {
  const progresses = [...cursor.progresses.values()];
  cursor.progresses.clear();
  await finishReferenceCleanup(
    progresses.map(async (progress): Promise<void> => {
      await progress.close();
    }),
  );
}
export async function finishReferenceCleanup(tasks: readonly Promise<void>[]): Promise<void> {
  const failures: unknown[] = [];
  for (const result of await Promise.allSettled(tasks))
    if (result.status === 'rejected') failures.push(result.reason);
  if (failures.length > 0) throw new AggregateError(failures, 'Reference resource cleanup failed.');
}
