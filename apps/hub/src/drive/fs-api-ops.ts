import { ApiError } from '@smarteverything/domain';
import { z } from 'zod';
import type { DriveSyncOpsRepository } from '../store/repositories/drive-sync';

export const FS_OP_ID = z.string().min(1);

const FS_ENTRY = z.strictObject({
  id: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  directory: z.boolean(),
  size: z.number(),
  modifiedAt: z.string(),
  rev: z.number(),
  etag: z.string(),
});

const OUTCOME = z.strictObject({ action: z.string(), entry: FS_ENTRY.nullable() });

export type FsEntry = Readonly<z.infer<typeof FS_ENTRY>>;

export type FsOpMemory = Pick<DriveSyncOpsRepository, 'recall' | 'remember'>;

export interface FsOp {
  readonly id: string;
  readonly action: string;
}

interface Pending {
  readonly action: string;
  readonly outcome: Promise<FsEntry | null>;
}

export class FsOps {
  private readonly running = new Map<string, Pending>();

  constructor(private readonly memory: FsOpMemory) {}

  async entry(nodeId: string, op: FsOp, run: () => Promise<FsEntry>): Promise<FsEntry> {
    const outcome = await this.once(nodeId, op, run);
    if (outcome === null) {
      throw new ApiError('internal', 'A remembered operation has no result to return.');
    }
    return outcome;
  }

  async done(nodeId: string, op: FsOp, run: () => Promise<void>): Promise<void> {
    await this.once(nodeId, op, async () => {
      await run();
      return null;
    });
  }

  private async once(
    nodeId: string,
    op: FsOp,
    run: () => Promise<FsEntry | null>,
  ): Promise<FsEntry | null> {
    const key = `${nodeId}\0${op.id}`;
    const pending = this.running.get(key);
    if (pending !== undefined) {
      return this.matching(pending.action, op, pending.outcome);
    }
    const stored = this.memory.recall(nodeId, op.id);
    if (stored !== undefined) {
      const outcome = OUTCOME.parse(stored);
      return this.matching(outcome.action, op, outcome.entry);
    }
    const outcome = run().then((entry) => {
      this.memory.remember(nodeId, op.id, { action: op.action, entry });
      return entry;
    });
    this.running.set(key, { action: op.action, outcome });
    try {
      return await outcome;
    } finally {
      this.running.delete(key);
    }
  }

  private async matching<T>(first: string, op: FsOp, outcome: T | Promise<T>): Promise<T> {
    if (first !== op.action) {
      throw new ApiError('conflict', 'That operation id was already used for another operation.');
    }
    return outcome;
  }
}
