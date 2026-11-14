import type { DriveItem } from '@smarteverything/domain';
import { messageOf } from '@smarteverything/logging';
import {
  announce,
  appendFeed,
  fileDraft,
  folderDraft,
  identityOf,
  parentOf,
  isoOf,
  type ChangeActor,
  type ChangeEnv,
  type PurgeSchedule,
} from './changes';
import { DriveWriteError, locate, type DriveWriteRoot } from './intents';
import { moveToTrash, removeTrashEntry, restoreFromTrash } from './trash';
import { purgeVersions } from './versions';

export async function commitTrash(
  env: ChangeEnv,
  root: DriveWriteRoot,
  itemId: string,
  actor: ChangeActor,
): Promise<void> {
  const item = env.store.driveItems.byId(itemId, null);
  const move = await moveToTrash(env, root, {
    itemId,
    relPath: item.relPath,
    name: item.name,
    isFolder: item.kind === 'folder',
    bytes: item.bytes,
    deletedBy: actor.actorProfileId,
    addedByProfileId: item.addedByProfileId,
  });
  env.store.write(() => {
    env.store.driveTrash.insert(move.entry);
    env.store.driveTrash.stash(itemId);
    appendFeed(env, { ...item, rev: item.rev + 1 }, 'trash', actor);
    env.store.driveItems.remove(itemId);
    env.store.driveIntents.clear(move.intent.id);
    announce(env, root.id, item.parentId, [item]);
  });
  env.purge.rearm();
}

export interface Restored {
  readonly item: DriveItem;
  readonly rescan: boolean;
}

export async function commitRestore(
  env: ChangeEnv,
  root: DriveWriteRoot,
  itemId: string,
  actor: ChangeActor,
): Promise<Restored> {
  const entry = env.store.driveTrash.byId(itemId);
  const restored = await restoreFromTrash(env, root, entry);
  const stamp = await env.files.stamp(await locate(root, restored.relPath));
  if (stamp === null) {
    throw new DriveWriteError('missing', 'The restored item is missing after the move.');
  }
  const item = env.store.write(() => {
    const stashed = env.store.driveTrash.stashed(itemId);
    env.store.driveTrash.remove(itemId);
    const parent = parentOf(env, root.id, restored.relPath);
    const base = {
      id: itemId,
      rootId: root.id,
      parentId: parent?.id ?? null,
      relPath: restored.relPath,
      modifiedAt: isoOf(stamp.mtimeNs),
      addedAt: env.now().toISOString(),
      outside: false,
      addedByProfileId: entry.addedByProfileId,
    };
    const written = env.store.driveItems.write({
      item: entry.isFolder
        ? folderDraft(base, entry.bytes)
        : fileDraft(base, { bytes: stamp.size, sha256: null }),
      identity: identityOf(stamp),
    }).item;
    env.store.driveTrash.reinstate(itemId, stashed, restored.relPath);
    appendFeed(env, written, 'restore', actor);
    env.store.driveIntents.clear(restored.intent.id);
    announce(env, root.id, parent?.id ?? null, [written]);
    return written;
  });
  env.purge.rearm();
  return { item, rescan: entry.isFolder };
}

export const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

const PURGE_PAGE = 500;

export interface PurgeTally {
  readonly trash: number;
  readonly versions: number;
  readonly failed: number;
}

async function purgeTrash(env: ChangeEnv, at: string): Promise<{ done: number; failed: number }> {
  const tally = { done: 0, failed: 0 };
  for (;;) {
    const page = env.store.driveTrash.due(at, PURGE_PAGE);
    const before = tally.done;
    for (const entry of page) {
      try {
        await removeTrashEntry(env, entry);
        tally.done += 1;
      } catch (cause) {
        tally.failed += 1;
        env.log.error('drive.purge_trash_failed', cause, {
          rootId: entry.rootId,
          reason: messageOf(cause),
        });
      }
    }
    if (page.length === 0 || tally.done === before) {
      return tally;
    }
  }
}

async function purgeOldVersions(
  env: ChangeEnv,
  at: string,
): Promise<{ done: number; failed: number }> {
  const tally = { done: 0, failed: 0 };
  for (;;) {
    const page = env.store.driveVersions.due(at, PURGE_PAGE);
    if (page.length === 0) {
      return tally;
    }
    try {
      tally.done += (
        await purgeVersions(
          env,
          page.map((entry) => entry.version.id),
        )
      ).length;
    } catch (cause) {
      tally.failed += page.length;
      env.log.error('drive.purge_versions_failed', cause, { reason: messageOf(cause) });
      return tally;
    }
  }
}

export async function purgeDue(env: ChangeEnv): Promise<PurgeTally> {
  const at = env.now().toISOString();
  const trash = await purgeTrash(env, at);
  const versions = await purgeOldVersions(env, at);
  if (trash.done + versions.done > 0) {
    env.store.feed.notice({
      type: 'drive_changed',
      rootIds: env.store.driveRoots.list().map((root) => root.id),
      folderIds: [],
      albumIds: [],
      months: [],
      cursor: env.store.driveFeed.latestSeq(),
    });
  }
  return { trash: trash.done, versions: versions.done, failed: trash.failed + versions.failed };
}

export class PurgeTimer implements PurgeSchedule {
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private again = false;

  constructor(private readonly env: ChangeEnv) {}

  start(): void {
    this.rearm();
  }

  rearm = (): void => {
    if (this.running !== undefined) {
      this.again = true;
      return;
    }
    this.arm(false);
  };

  stop(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  async settled(): Promise<void> {
    await this.running;
  }

  private soonest(): number | null {
    const dates = [
      this.env.store.driveTrash.soonestPurge(),
      this.env.store.driveVersions.soonestPurge(),
    ].flatMap((at) => (at === null ? [] : [Date.parse(at)]));
    return dates.length === 0 ? null : Math.min(...dates);
  }

  private arm(stalled: boolean): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    const soonest = this.soonest();
    if (soonest === null) {
      return;
    }
    const wait = soonest - this.env.now().getTime();
    if (wait <= 0 && stalled) {
      this.env.log.warn('drive.purge_stalled', {});
      return;
    }
    this.timer = setTimeout(this.fire, Math.min(Math.max(wait, 0), MAX_TIMER_DELAY_MS));
    this.timer.unref();
  }

  private fire = (): void => {
    this.timer = undefined;
    const soonest = this.soonest();
    if (soonest === null || soonest > this.env.now().getTime()) {
      this.arm(false);
      return;
    }
    this.running = purgeDue(this.env)
      .then((tally) => {
        this.running = undefined;
        this.arm(tally.failed > 0 && !this.again);
        this.again = false;
      })
      .catch((cause: unknown) => {
        this.running = undefined;
        this.env.log.error('drive.purge_failed', cause, {});
        this.again = false;
      });
  };
}
