import { ApiError, type DriveChangeResult, type DriveItem } from '@smarteverything/domain';
import { canWrite, driveAccess } from './access';
import type { ChangeEnv } from './changes';
import type { DriveWriteRoot } from './intents';
import type { DriveRootLanes } from './root-lanes';
import type { DriveReadService } from './service-read';
import {
  changeActorOf,
  refusalReason,
  writableItemRoot,
  type DriveCaller,
  type WriteStore,
} from './service-write-support';
import { commitTrashes } from './trash-purge';

export interface TrashDeps {
  readonly env: ChangeEnv;
  readonly store: WriteStore;
  readonly read: DriveReadService;
  readonly lanes: DriveRootLanes;
}

export const ALREADY_TRASHED = 'It is already in the trash.';

interface TrashTally {
  readonly done: { itemId: string; resultItemId: string | null }[];
  readonly failed: { itemId: string | null; reason: string }[];
}

async function trashedByCaller(
  deps: TrashDeps,
  caller: DriveCaller,
  itemId: string,
): Promise<boolean> {
  const entry = await deps.store.host.call('driveTrash', 'find', itemId);
  if (entry === undefined) return false;
  try {
    return canWrite(driveAccess(caller, await deps.read.rootFor(caller, entry.rootId)));
  } catch (cause) {
    if (cause instanceof ApiError) return false;
    throw cause;
  }
}

async function refuseTrash(
  deps: TrashDeps,
  caller: DriveCaller,
  itemId: string,
  cause: unknown,
): Promise<string> {
  if (await trashedByCaller(deps, caller, itemId)) return ALREADY_TRASHED;
  const reason = refusalReason(cause);
  if (reason === null) throw cause;
  return reason;
}

async function currentItems(
  deps: TrashDeps,
  caller: DriveCaller,
  ids: readonly string[],
  tally: TrashTally,
): Promise<DriveItem[]> {
  const items: DriveItem[] = [];
  for (const itemId of ids) {
    try {
      const item = await deps.read.readItem(caller, itemId);
      await writableItemRoot(deps.store, caller, item);
      items.push(item);
    } catch (cause) {
      tally.failed.push({ itemId, reason: await refuseTrash(deps, caller, itemId, cause) });
    }
  }
  return items;
}

async function trashGroup(
  deps: TrashDeps,
  caller: DriveCaller,
  group: { readonly root: DriveWriteRoot; readonly ids: readonly string[] },
  tally: TrashTally,
): Promise<void> {
  const items = await currentItems(deps, caller, group.ids, tally);
  const folders = items.filter((item) => item.kind === 'folder').map((item) => item.relPath);
  const nested = (item: DriveItem): boolean =>
    folders.some((folder) => item.relPath.startsWith(`${folder}/`));
  for (const item of items.filter(nested)) {
    tally.failed.push({ itemId: item.id, reason: 'There is no such file or folder.' });
  }
  const top = items.filter((item) => !nested(item)).map((item) => item.id);
  const outcomes = await commitTrashes(deps.env, group.root, top, changeActorOf(caller));
  for (const { itemId, failure } of outcomes) {
    if (failure === null) {
      tally.done.push({ itemId, resultItemId: null });
      continue;
    }
    const reason = refusalReason(failure);
    if (reason === null) throw failure;
    tally.failed.push({ itemId, reason });
  }
}

export async function trashItems(
  deps: TrashDeps,
  caller: DriveCaller,
  ids: readonly string[],
): Promise<DriveChangeResult> {
  const tally: TrashTally = { done: [], failed: [] };
  const byRoot = new Map<string, { root: DriveWriteRoot; ids: string[] }>();
  for (const itemId of new Set(ids)) {
    try {
      const root = await writableItemRoot(
        deps.store,
        caller,
        await deps.read.readItem(caller, itemId),
      );
      const group = byRoot.get(root.id);
      if (group === undefined) byRoot.set(root.id, { root, ids: [itemId] });
      else group.ids.push(itemId);
    } catch (cause) {
      tally.failed.push({ itemId, reason: await refuseTrash(deps, caller, itemId, cause) });
    }
  }
  for (const group of byRoot.values()) {
    await deps.lanes.run([group.root.id], () => trashGroup(deps, caller, group, tally));
  }
  return { done: tally.done, failed: tally.failed, conflicts: [] };
}
