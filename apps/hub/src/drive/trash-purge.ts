import type { DriveItem, DriveTrashEntry } from '@smarteverything/domain';
import type { DriveIntent } from '../store/repositories/drive-intents';
import { fileDraft, folderDraft, parentIn, type ChangeActor, type ChangeEnv } from './changes';
import { identityOf, isoOf, type NewItem } from './change-rows';
import {
  abandonIntent,
  locate,
  manifestPath,
  type DriveWriteRoot,
  type FileStamp,
} from './intents';
import { DriveWriteError } from './write-error';
import { linkDraft, NO_IDENTITY, specialDraft } from './posix/drafts';
import type { DriveItemDraft } from '../store/repositories/drive-items';
import type { StashedRoot } from '../store/repositories/drive-trash-rows';
import {
  moveManyToTrash,
  moveToTrash,
  moveToTrashDeferred,
  restoreFromTrash,
  type Barrier,
  type TrashMove,
  type TrashRequest,
} from './trash';
import { resultOf, writeDriveOps, type DriveOp, type DriveOpResult } from './units/ops';

export interface StagedTrash {
  readonly ops: readonly DriveOp[];
  readonly undo: () => Promise<void>;
}

function trashRequestOf(item: DriveItem, actor: ChangeActor): TrashRequest {
  return {
    itemId: item.id,
    relPath: item.relPath,
    name: item.name,
    isFolder: item.kind === 'folder',
    onDisk: item.kind !== 'special',
    bytes: item.bytes,
    deletedBy: actor.actorProfileId,
    addedByProfileId: item.addedByProfileId,
  };
}

function stagedOf(
  env: ChangeEnv,
  root: DriveWriteRoot,
  staging: { readonly item: DriveItem; readonly move: TrashMove; readonly actor: ChangeActor },
): StagedTrash {
  const { item, move, actor } = staging;
  return {
    ops: [
      {
        kind: 'trash',
        trash: {
          rootId: root.id,
          item,
          entry: move.entry,
          intentId: move.intent?.id ?? null,
          actor,
        },
      },
    ],
    undo: async (): Promise<void> => {
      if (move.intent === null) {
        await env.files.remove(await locate(root, manifestPath(move.entry.trashRelPath)));
        return;
      }
      await abandonIntent(env, root, move.intent);
    },
  };
}

function trashedItem(env: ChangeEnv, itemId: string): Promise<DriveItem> {
  return env.store.host.call('driveItems', 'byId', itemId, null);
}

export async function stageTrash(
  env: ChangeEnv,
  root: DriveWriteRoot,
  itemId: string,
  actor: ChangeActor,
): Promise<StagedTrash> {
  const item = await trashedItem(env, itemId);
  const move = await moveToTrash(env, root, trashRequestOf(item, actor));
  return stagedOf(env, root, { item, move, actor });
}

export async function stageTrashDeferred(
  env: ChangeEnv,
  root: DriveWriteRoot,
  staging: { readonly itemId: string; readonly actor: ChangeActor; readonly barrier: Barrier },
): Promise<StagedTrash> {
  const item = await trashedItem(env, staging.itemId);
  const move = await moveToTrashDeferred(
    env,
    root,
    trashRequestOf(item, staging.actor),
    staging.barrier,
  );
  return stagedOf(env, root, { item, move, actor: staging.actor });
}

export interface TrashedBatch {
  readonly itemId: string;
  readonly failure: Error | null;
}

export async function recordStaged(
  env: ChangeEnv,
  staged: readonly StagedTrash[],
  before: readonly DriveOp[] = [],
): Promise<DriveOpResult[]> {
  let results: DriveOpResult[];
  try {
    results = await writeDriveOps(env.store, [...before, ...staged.flatMap((trash) => trash.ops)]);
  } catch (cause) {
    for (const trash of staged) await trash.undo();
    throw cause;
  }
  env.purge.rearm();
  return results;
}

export async function commitTrashes(
  env: ChangeEnv,
  root: DriveWriteRoot,
  itemIds: readonly string[],
  actor: ChangeActor,
): Promise<TrashedBatch[]> {
  const items = await Promise.all(itemIds.map((id) => trashedItem(env, id)));
  const moved = await moveManyToTrash(
    env,
    root,
    items.map((item) => trashRequestOf(item, actor)),
  );
  const staged: StagedTrash[] = [];
  for (const [index, result] of moved.entries()) {
    const item = items[index];
    if (item !== undefined && result.move !== null) {
      staged.push(stagedOf(env, root, { item, move: result.move, actor }));
    }
  }
  await recordStaged(env, staged);
  return moved.map((result) => ({ itemId: result.itemId, failure: result.failure }));
}

export async function commitTrash(
  env: ChangeEnv,
  root: DriveWriteRoot,
  itemId: string,
  actor: ChangeActor,
): Promise<DriveOpResult[]> {
  return recordStaged(env, [await stageTrash(env, root, itemId, actor)]);
}

export interface TrashWith {
  readonly root: DriveWriteRoot;
  readonly itemId: string;
  readonly actor: ChangeActor;
  readonly before: readonly DriveOp[];
}

export async function commitTrashWith(env: ChangeEnv, trash: TrashWith): Promise<DriveOpResult[]> {
  const staged = await stageTrash(env, trash.root, trash.itemId, trash.actor);
  return recordStaged(env, [staged], trash.before);
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

async function restoredBase(
  env: ChangeEnv,
  root: DriveWriteRoot,
  input: RestoreInput,
): Promise<NewItem> {
  const { entry, stamp, relPath } = input;
  return {
    id: entry.itemId,
    rootId: root.id,
    parentId: (await parentIn(env, root.id, relPath))?.id ?? null,
    relPath,
    modifiedAt: stamp === null ? env.now().toISOString() : isoOf(stamp.mtimeNs),
    addedAt: env.now().toISOString(),
    outside: false,
    addedByProfileId: entry.addedByProfileId,
  };
}

async function reinstateItem(
  env: ChangeEnv,
  root: DriveWriteRoot,
  input: RestoreInput,
  actor: ChangeActor,
): Promise<DriveItem> {
  const { entry, stashed, stamp, relPath, intent } = input;
  const base = await restoredBase(env, root, input);
  const results = await writeDriveOps(env.store, [
    {
      kind: 'reinstate',
      reinstate: {
        rootId: root.id,
        itemId: entry.itemId,
        relPath,
        parentId: base.parentId,
        draft: restoredDraft(stashed, base, { folder: entry.bytes, file: stamp?.size ?? 0 }),
        identity: stamp === null ? NO_IDENTITY : identityOf(stamp),
        shareInode: stashed.inodeId,
        intentId: intent?.id ?? null,
        actor,
      },
    },
  ]);
  return resultOf(results, 0, 'item').item;
}

export async function commitRestore(
  env: ChangeEnv,
  root: DriveWriteRoot,
  itemId: string,
  actor: ChangeActor,
): Promise<Restored> {
  const entry = await env.store.host.call('driveTrash', 'byId', itemId);
  const stashed = await env.store.host.call('driveTrash', 'stashedRoot', itemId);
  const onDisk = stashed.kind !== 'special';
  const restored = await restoreFromTrash(env, root, { entry, onDisk });
  const stamp = onDisk ? await env.files.stamp(await locate(root, restored.relPath)) : null;
  if (onDisk && stamp === null) {
    throw new DriveWriteError('missing', 'The restored item is missing after the move.');
  }
  const input = { entry, stashed, stamp, relPath: restored.relPath, intent: restored.intent };
  let item: DriveItem;
  try {
    item = await reinstateItem(env, root, input, actor);
  } catch (cause) {
    if (restored.intent !== null) await abandonIntent(env, root, restored.intent);
    throw cause;
  }
  env.purge.rearm();
  return { item, rescan: entry.isFolder };
}
