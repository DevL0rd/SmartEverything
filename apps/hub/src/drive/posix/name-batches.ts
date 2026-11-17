import { background, messageOf, type Logger } from '@smarteverything/logging';
import type { DriveFiles } from '../intents';
import type { Barrier } from '../trash';
import type { DriveRootLanes } from '../root-lanes';
import { currentClaim, unclaimed, type ReplayClaim } from '../replay-claims';
import { guarded, posix } from './errors';
import type { PosixScope } from './env';
import type { PosixNode } from './nodes';

export interface BatchSlot {
  readonly barrier: Barrier;
  readonly reserved: Set<string>;
  readonly folders: Map<PosixScope, Map<number, PosixNode>>;
  readonly touched: Map<number, PosixNode>;
}

export interface Landed<T> {
  readonly settle: () => void;
  readonly abandon: () => Promise<void>;
  readonly reply: () => Promise<T>;
}

interface Waiting<T> {
  readonly land: (slot: BatchSlot) => Promise<Landed<T>>;
  readonly claim: ReplayClaim | undefined;
  readonly resolve: (value: T) => void;
  readonly reject: (cause: unknown) => void;
}

interface Ready<T> {
  readonly waiting: Waiting<T>;
  readonly landed: Landed<T>;
}

export interface BatchEnv {
  readonly lanes: DriveRootLanes;
  readonly files: Pick<DriveFiles, 'syncFilesystems'>;
  readonly write: <R>(work: () => R) => R;
  readonly settled: () => void;
  readonly claim: (claim: ReplayClaim) => void;
  readonly touch: (folders: Iterable<PosixNode>) => void;
  readonly log: Logger;
}

export function reserve(slot: BatchSlot, ...keys: readonly string[]): void {
  for (const key of keys) {
    if (slot.reserved.has(key)) throw posix('EEXIST', `${key} is already changing.`);
  }
  for (const key of keys) slot.reserved.add(key);
}

const NAME_BATCH_LANE = 'name-batch';

export class NameBatches<T> {
  private readonly queues = new Map<string, Waiting<T>[]>();
  private readonly settling = new Map<string, Promise<void>>();

  constructor(private readonly env: BatchEnv) {}

  add(rootId: string, land: (slot: BatchSlot) => Promise<Landed<T>>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let queue = this.queues.get(rootId);
      if (queue === undefined) {
        queue = [];
        this.queues.set(rootId, queue);
        background(
          unclaimed(() =>
            this.env.lanes.staged(rootId, NAME_BATCH_LANE, (handoff) =>
              this.drain(rootId, handoff),
            ),
          ),
          'drive.name_batch_failed',
        );
      }
      queue.push({ land, claim: currentClaim(), resolve, reject });
    });
  }

  private async drain(rootId: string, handoff: () => void): Promise<void> {
    const queue = this.queues.get(rootId) ?? [];
    this.queues.delete(rootId);
    const slot: BatchSlot = {
      barrier: { directories: new Set(), manifests: [] },
      reserved: new Set(),
      folders: new Map(),
      touched: new Map(),
    };
    const landed = await Promise.all(
      queue.map(async (waiting): Promise<Ready<T> | null> => {
        try {
          return { waiting, landed: await guarded(() => waiting.land(slot)) };
        } catch (cause) {
          waiting.reject(cause);
          return null;
        }
      }),
    );
    const ready = landed.filter((entry): entry is Ready<T> => entry !== null);
    if (ready.length === 0) return;
    const turn = this.settling.get(rootId);
    let finished = (): void => undefined;
    const mine = new Promise<void>((resolve) => {
      finished = resolve;
    });
    this.settling.set(rootId, mine);
    handoff();
    try {
      await this.finish(ready, slot, turn);
    } finally {
      if (this.settling.get(rootId) === mine) this.settling.delete(rootId);
      finished();
    }
  }

  private async finish(
    ready: readonly Ready<T>[],
    slot: BatchSlot,
    turn: Promise<void> | undefined,
  ): Promise<void> {
    try {
      await this.env.files.syncFilesystems([
        ...slot.barrier.manifests,
        ...slot.barrier.directories,
      ]);
    } catch (cause) {
      await turn;
      for (const { waiting, landed } of ready) {
        await landed.abandon();
        waiting.reject(cause);
      }
      return;
    }
    await turn;
    const kept = await this.settle(ready, slot);
    this.env.settled();
    for (const { waiting, landed } of kept) {
      guarded(landed.reply).then(waiting.resolve, waiting.reject);
    }
  }

  private settleOne(entry: Ready<T>): void {
    entry.landed.settle();
    if (entry.waiting.claim !== undefined) this.env.claim(entry.waiting.claim);
  }

  private touchFolders(slot: BatchSlot): void {
    this.env.touch(slot.touched.values());
    slot.touched.clear();
  }

  private async settle(ready: readonly Ready<T>[], slot: BatchSlot): Promise<readonly Ready<T>[]> {
    if (ready.length > 1) {
      try {
        this.env.write(() => {
          for (const entry of ready) this.settleOne(entry);
          this.touchFolders(slot);
        });
        return ready;
      } catch (cause) {
        slot.touched.clear();
        this.env.log.warn('drive.name_batch_split', {
          items: ready.length,
          reason: messageOf(cause),
        });
      }
    }
    const kept: Ready<T>[] = [];
    for (const entry of ready) {
      try {
        this.env.write(() => {
          this.settleOne(entry);
          this.touchFolders(slot);
        });
        kept.push(entry);
      } catch (failure) {
        await entry.landed.abandon();
        entry.waiting.reject(failure);
      }
    }
    return kept;
  }
}
