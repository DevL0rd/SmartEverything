import { symlink, unlink } from 'node:fs/promises';
import type { DriveItem } from '@smarteverything/domain';
import {
  announce,
  appendFeed,
  commitContent,
  identityOf,
  isoOf,
  recordItem,
  type ChangeEnv,
  type NewItem,
} from './changes';
import { DriveWriteError, locate, type DriveWriteRoot } from './intents';
import { normalizeRelativePath } from './paths';
import { linkDraft, NO_IDENTITY, specialDraft } from './posix/drafts';
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
  readonly assertFree: (rootId: string, relPath: string, caller: DriveCaller) => void;
}

function newItemOf(context: CopyContext, item: DriveItem, parent: DriveItem): NewItem {
  return {
    rootId: context.roots.root.id,
    parentId: parent.id,
    relPath: `${parent.relPath}/${item.name}`,
    modifiedAt: item.modifiedAt,
    addedAt: context.env.now().toISOString(),
    outside: false,
    addedByProfileId: context.caller.profileId,
  };
}

export async function copyLink(
  context: CopyContext,
  link: { readonly item: DriveItem; readonly target: string },
  parent: DriveItem,
): Promise<DriveItem> {
  const { env, caller, roots } = context;
  const added = newItemOf(context, link.item, parent);
  context.assertFree(roots.root.id, added.relPath, caller);
  const path = await locate(roots.root, added.relPath);
  await symlink(link.target, path);
  try {
    const stamp = await env.files.stamp(path);
    if (stamp === null) {
      throw new DriveWriteError('missing', 'The copied link is missing after it was made.');
    }
    return recordItem(env, {
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

export function copySpecial(context: CopyContext, item: DriveItem, parent: DriveItem): DriveItem {
  const { env, store, caller, roots } = context;
  const added = newItemOf(context, item, parent);
  context.assertFree(roots.root.id, added.relPath, caller);
  const source = store.driveInodes.ofItem(item.id);
  if (source === undefined) {
    throw new DriveWriteError('missing', 'The special file has no inode to copy.');
  }
  const specialType = source.type;
  if (
    specialType !== 'fifo' &&
    specialType !== 'socket' &&
    specialType !== 'char' &&
    specialType !== 'block'
  ) {
    throw new DriveWriteError('missing', 'The item is not a special file.');
  }
  return store.write(() => {
    const written = store.driveItems.write({
      item: specialDraft(added),
      identity: NO_IDENTITY,
      inode: {
        specialType,
        rdev: source.rdev,
        mode: source.mode,
        uid: source.uid,
        gid: source.gid,
      },
    }).item;
    appendFeed(env, written, 'create', changeActorOf(caller));
    announce(env, written.rootId, written.parentId, [written]);
    return written;
  });
}

export async function copyFile(
  context: CopyContext,
  item: DriveItem,
  parent: DriveItem,
): Promise<DriveItem> {
  const { env, guard, caller, roots } = context;
  const relPath = normalizeRelativePath(`${parent.relPath}/${item.name}`);
  context.assertFree(roots.root.id, relPath, caller);
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
    });
    return written.item;
  } catch (cause) {
    await env.files.remove(await locate(roots.root, staged.relPath));
    throw cause;
  }
}
