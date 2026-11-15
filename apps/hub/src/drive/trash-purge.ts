import type { DriveItem, DriveTrashEntry } from '@smarteverything/domain';
import type { DriveIntent } from '../store/repositories/drive-intents';
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
  type NewItem,
  type PurgeSchedule,
} from './changes';
import {
  abandonIntent,
  DriveWriteError,
  locate,
  manifestPath,
  type DriveWriteRoot,
  type FileStamp,
} from './intents';
import { linkDraft, NO_IDENTITY, specialDraft } from './posix/drafts';
import type { DriveItemDraft } from '../store/repositories/drive-items';
import type { StashedRoot } from '../store/repositories/drive-trash-rows';
import { moveToTrash, removeTrashEntry, restoreFromTrash } from './trash';
import { purgeVersions } from './versions';

export interface StagedTrash {
  readonly record: () => void;
  readonly undo: () => Promise<void>;
}

export async function stageTrash(
  env: ChangeEnv,
  root: DriveWriteRoot,
  itemId: string,
  actor: ChangeActor,
): Promise<StagedTrash> {
  const item = env.store.driveItems.byId(itemId, null);
  const move = await moveToTrash(env, root, {
    itemId,
    relPath: item.relPath,
    name: item.name,
    isFolder: item.kind === 'folder',
    onDisk: item.kind !== 'special',
    bytes: item.bytes,
    deletedBy: actor.actorProfileId,
    addedByProfileId: item.addedByProfileId,
  });
  return {
    record: (): void => {
      env.store.driveTrash.insert(move.entry);
      env.store.driveTrash.stash(itemId);
      appendFeed(env, { ...item, rev: item.rev + 1 }, 'trash', actor);
      env.store.driveItems.remove(itemId);
      if (move.intent !== null) env.store.driveIntents.clear(move.intent.id);
      announce(env, root.id, item.parentId, [item]);
      env.purge.rearm();
    },
    undo: async (): Promise<void> => {
      if (move.intent === null) {
        await env.files.remove(await locate(root, manifestPath(move.entry.trashRelPath)));
        return;
      }
      await abandonIntent(env, root, move.intent);
    },
  };
}

export async function commitTrash(
  env: ChangeEnv,
  root: DriveWriteRoot,
  itemId: string,
  actor: ChangeActor,
): Promise<void> {
  const staged = await stageTrash(env, root, itemId, actor);
  env.store.write(staged.record);
}

export interface Restored {
  readonly item: DriveItem;
  readonly rescan: boolean;
}

function restoredDraft(
  stashed: StashedRoot,
  base: NewItem,
  sizes: { readonly folder: number; readonly file: number },
): DriveItemDraft {
  switch (stashed.kind) {
    case 'folder':
      return folderDraft(base, sizes.folder);
    case 'special':
      return specialDraft(base);
    case 'link':
      if (stashed.linkTarget === null) {
        throw new DriveWriteError('missing', 'The trashed link has no target.');
      }
      return linkDraft(base, stashed.linkTarget);
    default:
      return fileDraft(base, { bytes: sizes.file, sha256: null });
  }
}

interface RestoreInput {
  readonly entry: DriveTrashEntry;
  readonly stashed: StashedRoot;
  readonly stamp: FileStamp | null;
  readonly relPath: string;
  readonly intent: DriveIntent | null;
}

function restoredBase(env: ChangeEnv, root: DriveWriteRoot, input: RestoreInput): NewItem {
  const { entry, stamp, relPath } = input;
  return {
    id: entry.itemId,
    rootId: root.id,
    parentId: parentOf(env, root.id, relPath)?.id ?? null,
    relPath,
    modifiedAt: stamp === null ? env.now().toISOString() : isoOf(stamp.mtimeNs),
    addedAt: env.now().toISOString(),
    outside: false,
    addedByProfileId: entry.addedByProfileId,
  };
}

function reinstateItem(
  env: ChangeEnv,
  root: DriveWriteRoot,
  input: RestoreInput,
  actor: ChangeActor,
): DriveItem {
  const { entry, stashed, stamp, relPath, intent } = input;
  const rows = env.store.driveTrash.stashed(entry.itemId);
  env.store.driveTrash.remove(entry.itemId);
  env.store.driveTrash.reinstateInodes(rows);
  const base = restoredBase(env, root, input);
  const written = env.store.driveItems.write({
    item: restoredDraft(stashed, base, { folder: entry.bytes, file: stamp?.size ?? 0 }),
    identity: stamp === null ? NO_IDENTITY : identityOf(stamp),
    ...(stashed.inodeId === null ? {} : { shareInode: stashed.inodeId }),
  }).item;
  env.store.driveTrash.reinstate(entry.itemId, rows, relPath);
  appendFeed(env, written, 'restore', actor);
  if (intent !== null) env.store.driveIntents.clear(intent.id);
  announce(env, root.id, base.parentId, [written]);
  return written;
}

export async function commitRestore(
  env: ChangeEnv,
  root: DriveWriteRoot,
  itemId: string,
  actor: ChangeActor,
): Promise<Restored> {
  const entry = env.store.driveTrash.byId(itemId);
  const stashed = env.store.driveTrash.stashedRoot(itemId);
  const onDisk = stashed.kind !== 'special';
  const restored = await restoreFromTrash(env, root, { entry, onDisk });
  const stamp = onDisk ? await env.files.stamp(await locate(root, restored.relPath)) : null;
  if (onDisk && stamp === null) {
    throw new DriveWriteError('missing', 'The restored item is missing after the move.');
  }
  const input = { entry, stashed, stamp, relPath: restored.relPath, intent: restored.intent };
  const item = env.store.write(() => reinstateItem(env, root, input, actor));
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
