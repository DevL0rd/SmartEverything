import { background, messageOf, type Logger } from '@smarteverything/logging';
import type { DriveFiles } from '../intents';
import type { Barrier } from '../trash';
import type { DriveRootLanes } from '../root-lanes';
import { currentClaim, unclaimed, type ReplayClaim } from '../replay-claims';
import type { DriveOp, DriveOpResult } from '../units/ops';
import { guarded, posix } from './errors';
import type { PosixScope } from './env';
import type { PosixNode } from '../units/posix';

export interface BatchSlot {
  readonly barrier: Barrier;
  readonly reserved: Set<string>;
  readonly folders: Map<PosixScope, Map<number, Promise<PosixNode>>>;
  readonly touched: Map<number, PosixNode>;
}

export interface Landed<T> {
  readonly ops: readonly DriveOp[];
  readonly abandon: () => Promise<void>;
  readonly reply: (results: readonly DriveOpResult[]) => Promise<T>;
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

interface Kept<T> extends Ready<T> {
  readonly results: readonly DriveOpResult[];
}

export interface BatchEnv {
  readonly lanes: DriveRootLanes;
  readonly files: Pick<DriveFiles, 'syncPaths'>;
  readonly write: (ops: readonly DriveOp[]) => Promise<DriveOpResult[]>;
  readonly settled: () => void;
  readonly touch: (folders: Iterable<PosixNode>) => DriveOp[];
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
      barrier: { paths: new Set(), manifests: [] },
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
      await this.env.files.syncPaths([...slot.barrier.manifests, ...slot.barrier.paths]);
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
    for (const { waiting, landed, results } of kept) {
      guarded(() => landed.reply(results)).then(waiting.resolve, waiting.reject);
    }
  }

  private opsOf(entry: Ready<T>): DriveOp[] {
    const { claim } = entry.waiting;
    return claim === undefined
      ? [...entry.landed.ops]
      : [...entry.landed.ops, { kind: 'claim', claim }];
  }

  private touchOps(slot: BatchSlot): DriveOp[] {
    const ops = this.env.touch(slot.touched.values());
    slot.touched.clear();
    return ops;
  }

  private async together(ready: readonly Ready<T>[], slot: BatchSlot): Promise<Kept<T>[]> {
    const owned = ready.map((entry) => ({ entry, ops: this.opsOf(entry) }));
    const results = await this.env.write([
      ...owned.flatMap(({ ops }) => ops),
      ...this.touchOps(slot),
    ]);
    let offset = 0;
    return owned.map(({ entry, ops }) => {
      const kept = { ...entry, results: results.slice(offset, offset + ops.length) };
      offset += ops.length;
      return kept;
    });
  }

  private async settle(ready: readonly Ready<T>[], slot: BatchSlot): Promise<readonly Kept<T>[]> {
    const touches = [...slot.touched.values()];
    if (ready.length > 1) {
      try {
        return await this.together(ready, slot);
      } catch (cause) {
        this.env.log.warn('drive.name_batch_split', {
          items: ready.length,
          reason: messageOf(cause),
        });
      }
    }
    const kept: Kept<T>[] = [];
    let pending = touches;
    for (const entry of ready) {
      const own = this.opsOf(entry);
      try {
        const results = await this.env.write([...own, ...this.env.touch(pending)]);
        pending = [];
        kept.push({ ...entry, results: results.slice(0, own.length) });
      } catch (failure) {
        await entry.landed.abandon();
        entry.waiting.reject(failure);
      }
    }
    return kept;
  }
}
