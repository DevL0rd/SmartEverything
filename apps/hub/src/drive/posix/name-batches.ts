import { background, messageOf, type Logger } from '@smarteverything/logging';
import type { DriveFiles } from '../intents';
import type { Barrier } from '../trash';
import type { DriveRootLanes } from '../root-lanes';
import { guarded, posix } from './errors';

export interface BatchSlot {
  readonly barrier: Barrier;
  readonly reserved: Set<string>;
}

export interface Landed<T> {
  readonly settle: () => void;
  readonly abandon: () => Promise<void>;
  readonly reply: () => Promise<T>;
}

interface Waiting<T> {
  readonly land: (slot: BatchSlot) => Promise<Landed<T>>;
  readonly resolve: (value: T) => void;
  readonly reject: (cause: unknown) => void;
}

interface Ready<T> {
  readonly waiting: Waiting<T>;
  readonly landed: Landed<T>;
}

export interface BatchEnv {
  readonly lanes: DriveRootLanes;
  readonly files: Pick<DriveFiles, 'syncDirectory' | 'syncFile'>;
  readonly write: <R>(work: () => R) => R;
  readonly settled: () => void;
  readonly log: Logger;
}

export function reserve(slot: BatchSlot, ...keys: readonly string[]): void {
  for (const key of keys) {
    if (slot.reserved.has(key)) throw posix('EEXIST', `${key} is already changing.`);
  }
  for (const key of keys) slot.reserved.add(key);
}

export class NameBatches<T> {
  private readonly queues = new Map<string, Waiting<T>[]>();

  constructor(private readonly env: BatchEnv) {}

  add(rootId: string, land: (slot: BatchSlot) => Promise<Landed<T>>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let queue = this.queues.get(rootId);
      if (queue === undefined) {
        queue = [];
        this.queues.set(rootId, queue);
        background(
          this.env.lanes.run([rootId], () => this.drain(rootId)),
          'drive.name_batch_failed',
        );
      }
      queue.push({ land, resolve, reject });
    });
  }

  private async drain(rootId: string): Promise<void> {
    const queue = this.queues.get(rootId) ?? [];
    this.queues.delete(rootId);
    const slot: BatchSlot = {
      barrier: { directories: new Set(), manifests: [] },
      reserved: new Set(),
    };
    const ready: Ready<T>[] = [];
    for (const waiting of queue) {
      try {
        ready.push({ waiting, landed: await guarded(() => waiting.land(slot)) });
      } catch (cause) {
        waiting.reject(cause);
      }
    }
    if (ready.length === 0) return;
    try {
      const { files } = this.env;
      await Promise.all(slot.barrier.manifests.map((path) => files.syncFile(path)));
      await Promise.all([...slot.barrier.directories].map((path) => files.syncDirectory(path)));
    } catch (cause) {
      for (const { waiting, landed } of ready) {
        await landed.abandon();
        waiting.reject(cause);
      }
      return;
    }
    const kept = await this.settle(ready);
    this.env.settled();
    for (const { waiting, landed } of kept) {
      guarded(landed.reply).then(waiting.resolve, waiting.reject);
    }
  }

  private async settle(ready: readonly Ready<T>[]): Promise<readonly Ready<T>[]> {
    if (ready.length > 1) {
      try {
        this.env.write(() => {
          for (const { landed } of ready) landed.settle();
        });
        return ready;
      } catch (cause) {
        this.env.log.warn('drive.name_batch_split', {
          items: ready.length,
          reason: messageOf(cause),
        });
      }
    }
    const kept: Ready<T>[] = [];
    for (const entry of ready) {
      try {
        this.env.write(entry.landed.settle);
        kept.push(entry);
      } catch (failure) {
        await entry.landed.abandon();
        entry.waiting.reject(failure);
      }
    }
    return kept;
  }
}
