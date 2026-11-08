import {
  ApiError,
  type HomeMapActor,
  type HomeMapOp,
  type HomeMapRevisionEntry,
} from '@smarteverything/domain';
import type {
  HomeMapApplied,
  HomeMapHistoryMark,
  HomeMapRevisionFilter,
} from '../store/repositories/home-maps';

export type HistoryDirection = 'undo' | 'redo';

export interface RevisionLog {
  revisions(filter?: HomeMapRevisionFilter): HomeMapRevisionEntry[];
}

export type ApplyInverse = (ops: readonly HomeMapOp[], mark: HomeMapHistoryMark) => HomeMapApplied;

interface ActorStacks {
  readonly done: number[];
  readonly undone: number[];
  seen: number;
}

function cutAt(stack: number[], revision: number): void {
  const index = stack.lastIndexOf(revision);
  if (index >= 0) stack.splice(index);
}

function replay(stacks: ActorStacks, entry: HomeMapRevisionEntry): void {
  if (entry.undoes !== undefined) {
    cutAt(stacks.done, entry.undoes);
    stacks.undone.push(entry.revision);
  } else if (entry.redoes !== undefined) {
    cutAt(stacks.undone, entry.redoes);
    stacks.done.push(entry.revision);
  } else {
    stacks.done.push(entry.revision);
    stacks.undone.splice(0);
  }
}

export class RevisionHistory {
  private readonly actors = new Map<HomeMapActor, ActorStacks>();

  constructor(private readonly log: RevisionLog) {}

  walk(
    actor: HomeMapActor,
    direction: HistoryDirection,
    apply: ApplyInverse,
  ): HomeMapApplied | null {
    const stacks = this.synced(actor);
    const from = direction === 'undo' ? stacks.done : stacks.undone;
    const to = direction === 'undo' ? stacks.undone : stacks.done;
    let dropped: HomeMapApplied | null = null;
    for (let revision = from.at(-1); revision !== undefined; revision = from.at(-1)) {
      const mark = direction === 'undo' ? { undoes: revision } : { redoes: revision };
      const result = apply(this.entryOf(actor, revision).inverse, mark);
      from.pop();
      if (result.applied.length > 0) {
        to.push(result.revision);
        stacks.seen = result.revision;
        return result;
      }
      dropped ??= result;
    }
    return dropped;
  }

  private synced(actor: HomeMapActor): ActorStacks {
    const stacks = this.actors.get(actor) ?? { done: [], undone: [], seen: 0 };
    for (const entry of this.log.revisions({ actor, after: stacks.seen })) {
      replay(stacks, entry);
      stacks.seen = entry.revision;
    }
    this.actors.set(actor, stacks);
    return stacks;
  }

  private entryOf(actor: HomeMapActor, revision: number): HomeMapRevisionEntry {
    const entry = this.log.revisions({ actor, after: revision - 1 })[0];
    if (entry?.revision !== revision) {
      throw new ApiError(
        'internal',
        `The map revision ${String(revision)} is missing from the log.`,
      );
    }
    return entry;
  }
}
