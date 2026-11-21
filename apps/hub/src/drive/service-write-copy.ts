import { symlink, unlink } from 'node:fs/promises';
import { ApiError, type DriveItem } from '@smarteverything/domain';
import { commitContent, recordItem, type ChangeEnv } from './changes';
import { identityOf, isoOf, type NewItem } from './change-rows';
import { locate, type DriveWriteRoot } from './intents';
import { DriveWriteError } from './write-error';
import { normalizeRelativePath } from './paths';
import { linkDraft } from './posix/drafts';
import { checkDriveWrite, type DriveWriteGuard } from './quotas';
import { changeActorOf, type DriveCaller, type WriteStore } from './service-write-support';
import { stageBytes } from './versions';

export interface CopyRoots {
  readonly source: DriveWriteRoot;
  readonly root: DriveWriteRoot;
}

export interface CopyContext {
  readonly caller: DriveCaller;
  readonly roots: CopyRoots;
  readonly env: ChangeEnv;
  readonly store: WriteStore;
  readonly guard: DriveWriteGuard;
  readonly assertFree: (rootId: string, relPath: string, caller: DriveCaller) => Promise<void>;
}

export interface CopyAsk {
  readonly id: string;
  readonly toFolderId: string;
  readonly copyId: string | undefined;
}

export async function madeAlready(
  store: Pick<WriteStore, 'host'>,
  id: string | undefined,
  rootId: string,
  relPath: string,
): Promise<DriveItem | null> {
  if (id === undefined) return null;
  const made = await store.host.call('driveItems', 'find', id, null);
  if (made === undefined) return null;
  if (made.rootId !== rootId || made.relPath !== relPath) {
    throw new ApiError('forbidden', 'That item id is taken.');
  }
  return made;
}

export interface FolderPlace {
  readonly parent: DriveItem | null;
  readonly name: string;
  readonly id?: string | undefined;
}

export interface CopyTarget {
  readonly parent: DriveItem;
  readonly id: string | undefined;
}

function newItemOf(context: CopyContext, item: DriveItem, target: CopyTarget): NewItem {
  const { parent, id } = target;
  return {
    rootId: context.roots.root.id,
    parentId: parent.id,
    relPath: `${parent.relPath}/${item.name}`,
    modifiedAt: item.modifiedAt,
    addedAt: context.env.now().toISOString(),
    outside: false,
    addedByProfileId: context.caller.profileId,
    ...(id === undefined ? {} : { id }),
  };
}

export async function copyLink(
  context: CopyContext,
  link: { readonly item: DriveItem; readonly target: string },
  target: CopyTarget,
): Promise<DriveItem> {
  const { env, caller, roots } = context;
  const added = newItemOf(context, link.item, target);
  await context.assertFree(roots.root.id, added.relPath, caller);
  const path = await locate(roots.root, added.relPath);
  await symlink(link.target, path);
  try {
    const stamp = await env.files.stamp(path);
    if (stamp === null) {
      throw new DriveWriteError('missing', 'The copied link is missing after it was made.');
    }
    return await recordItem(env, {
      draft: linkDraft({ ...added, modifiedAt: isoOf(stamp.mtimeNs) }, link.target),
      identity: identityOf(stamp),
      op: 'create',
      actor: changeActorOf(caller),
    });
  } catch (cause) {
    await unlink(path);
    throw cause;
  }
}

export async function copySpecial(
  context: CopyContext,
  item: DriveItem,
  target: CopyTarget,
): Promise<DriveItem> {
  const { store, caller, roots } = context;
  const added = newItemOf(context, item, target);
  await context.assertFree(roots.root.id, added.relPath, caller);
  return store.host.write('driveCopySpecial', {
    added,
    sourceItemId: item.id,
    actor: changeActorOf(caller),
  });
}

export async function copyFile(
  context: CopyContext,
  item: DriveItem,
  target: CopyTarget,
): Promise<DriveItem> {
  const { env, guard, caller, roots } = context;
  const relPath = normalizeRelativePath(`${target.parent.relPath}/${item.name}`);
  await context.assertFree(roots.root.id, relPath, caller);
  await checkDriveWrite(guard, {
    profileId: caller.profileId,
    addBytes: item.bytes,
    releasedBytes: 0,
    path: roots.root.path,
  });
  const source = env.files.read(await locate(roots.source, item.relPath));
  const staged = await stageBytes(env, roots.root, source);
  try {
    const written = await commitContent(env, {
      root: roots.root,
      staged,
      relPath,
      actor: changeActorOf(caller),
      id: target.id,
    });
    return written.item;
  } catch (cause) {
    await env.files.remove(await locate(roots.root, staged.relPath));
    throw cause;
  }
}
