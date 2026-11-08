import { basename } from 'node:path';
import {
  ApiError,
  type DriveChange,
  type DriveChangeResult,
  type DriveItem,
} from '@smarteverything/domain';
import type { DriveItemIdentity } from '../store/repositories/drive-items';
import {
  announce,
  commitContent,
  folderDraft,
  identityOf,
  isoOf,
  recordItem,
  type ChangeEnv,
} from './changes';
import { DriveWriteError, locate, moveWithin, physicalRoot, type DriveWriteRoot } from './intents';
import { isInside, normalizeRelativePath } from './paths';
import { checkDriveWrite, type DriveWriteGuard } from './quotas';
import { DRIVE_PAGE_SIZE, type DriveReadService } from './service-read';
import type { AlbumEditing } from './service-write-albums';
import { repathItem, type RepathOp } from './service-write-repath';
import {
  NameClash,
  changeActorOf,
  refusalReason,
  writableRoot,
  type DriveCaller,
  type WriteStore,
} from './service-write-support';
import { commitRestore, commitTrash } from './trash-purge';
import { removeTrashEntry } from './trash';
import { stageBytes } from './versions';

export interface TreeDeps {
  readonly env: ChangeEnv;
  readonly store: WriteStore;
  readonly read: DriveReadService;
  readonly albums: AlbumEditing;
  readonly guard: DriveWriteGuard;
  readonly scan: (rootId: string) => void;
}

type ItemChange = Extract<DriveChange, { readonly itemIds: readonly string[] }>;

type Outcome = string | null;

interface CopyRoots {
  readonly source: DriveWriteRoot;
  readonly root: DriveWriteRoot;
}

function joined(parent: DriveItem | null, name: string): string {
  return normalizeRelativePath(parent === null ? name : `${parent.relPath}/${name}`);
}

export class DriveTreeWriter {
  constructor(private readonly deps: TreeDeps) {}

  async apply(caller: DriveCaller, change: DriveChange): Promise<DriveChangeResult> {
    if ('itemIds' in change) {
      return this.batch(caller, change);
    }
    switch (change.action) {
      case 'new_folder':
        return this.each([change.parentId], () =>
          this.newFolder(caller, change.parentId, change.name),
        );
      case 'rename':
        return this.each([change.itemId], () => this.rename(caller, change.itemId, change.name));
      case 'keep_source_item':
        return this.each([change.itemId], (id) => this.copy(caller, id, change.toFolderId));
    }
  }

  private batch(caller: DriveCaller, change: ItemChange): Promise<DriveChangeResult> {
    const ids = change.itemIds;
    switch (change.action) {
      case 'move':
        return this.each(ids, (id) => this.move(caller, id, change.toFolderId));
      case 'copy':
        return this.each(ids, (id) => this.copy(caller, id, change.toFolderId));
      case 'star':
        return this.each(ids, (id) => this.star(caller, id, true));
      case 'unstar':
        return this.each(ids, (id) => this.star(caller, id, false));
      case 'trash':
        return this.each(ids, (id) => this.trash(caller, id));
      case 'restore':
        return this.each(ids, (id) => this.restore(caller, id));
      case 'delete_now':
        return this.each(ids, (id) => this.deleteNow(caller, id));
      case 'album_add':
        return this.each(ids, (id) => this.albumAdd(caller, change.albumId, id));
      case 'album_remove':
        return this.each(ids, (id) => this.albumRemove(caller, change.albumId, id));
    }
  }

  private async each(
    ids: readonly string[],
    operation: (id: string) => Promise<Outcome> | Outcome,
  ): Promise<DriveChangeResult> {
    const done: { itemId: string; resultItemId: string | null }[] = [];
    const failed: { itemId: string | null; reason: string }[] = [];
    const conflicts: { itemId: string | null; name: string; existingItemId: string }[] = [];
    for (const itemId of ids) {
      try {
        done.push({ itemId, resultItemId: await operation(itemId) });
      } catch (cause) {
        if (cause instanceof NameClash) {
          conflicts.push({ itemId, name: cause.itemName, existingItemId: cause.existingItemId });
          continue;
        }
        const reason = refusalReason(cause);
        if (reason === null) {
          throw cause;
        }
        failed.push({ itemId, reason });
      }
    }
    return { done, failed, conflicts };
  }

  private star(caller: DriveCaller, id: string, starred: boolean): Outcome {
    const item = this.deps.read.readItem(caller, id);
    recordItem(this.deps.env, {
      draft: { ...item, starred },
      identity: this.identity(id),
      op: starred ? 'star' : 'unstar',
      actor: changeActorOf(caller),
    });
    return id;
  }

  private async trash(caller: DriveCaller, id: string): Promise<Outcome> {
    const item = this.deps.read.readItem(caller, id);
    const root = writableRoot(this.deps.read, caller, item.rootId);
    await commitTrash(this.deps.env, root, id, changeActorOf(caller));
    return null;
  }

  private async restore(caller: DriveCaller, id: string): Promise<Outcome> {
    const entry = this.deps.store.driveTrash.find(id);
    if (entry === undefined) {
      throw new ApiError('not_found', 'There is no such item in the trash.');
    }
    const root = writableRoot(this.deps.read, caller, entry.rootId);
    const restored = await commitRestore(this.deps.env, root, id, changeActorOf(caller));
    if (restored.rescan) {
      this.deps.scan(root.id);
    }
    return restored.item.id;
  }

  private async deleteNow(caller: DriveCaller, id: string): Promise<Outcome> {
    if (caller.via !== 'app') {
      throw new ApiError('forbidden', 'Permanent removal is done in the app, never by the AI.');
    }
    const entry = this.deps.store.driveTrash.find(id);
    if (entry === undefined) {
      throw new ApiError('not_found', 'There is no such item in the trash.');
    }
    this.deps.read.rootFor(caller, entry.rootId);
    if (!caller.owner && entry.addedByProfileId !== caller.profileId) {
      throw new ApiError('forbidden', 'A member can remove only the trash charged to them.');
    }
    await removeTrashEntry(this.deps.env, entry);
    this.deps.env.purge.rearm();
    announce(this.deps.env, entry.rootId, null, []);
    return null;
  }

  private albumAdd(caller: DriveCaller, albumId: string, id: string): Outcome {
    this.deps.albums.addItems(albumId, [id], caller);
    return id;
  }

  private albumRemove(caller: DriveCaller, albumId: string, id: string): Outcome {
    this.deps.albums.removeItems(albumId, [id], caller);
    return id;
  }

  private async rename(caller: DriveCaller, id: string, name: string): Promise<Outcome> {
    const item = this.deps.read.readItem(caller, id);
    const parent = item.parentId === null ? null : this.deps.store.driveItems.byId(item.parentId);
    return this.relocate(caller, item, { parent, name }, 'rename');
  }

  private async move(caller: DriveCaller, id: string, toFolderId: string): Promise<Outcome> {
    const item = this.deps.read.readItem(caller, id);
    const parent = this.folderOf(caller, toFolderId);
    if (item.rootId !== parent.rootId) {
      throw new ApiError(
        'invalid_request',
        'A move stays inside one library folder; copy the item instead.',
      );
    }
    if (item.kind === 'folder' && isInside(item.relPath, parent.relPath)) {
      throw new ApiError('invalid_request', 'A folder cannot move into itself.');
    }
    return this.relocate(caller, item, { parent, name: item.name }, 'move');
  }

  private async relocate(
    caller: DriveCaller,
    item: DriveItem,
    target: { readonly parent: DriveItem | null; readonly name: string },
    op: RepathOp,
  ): Promise<Outcome> {
    const { env, read } = this.deps;
    const root = writableRoot(read, caller, item.rootId);
    const relPath = joined(target.parent, target.name);
    if (relPath === item.relPath) {
      return item.id;
    }
    this.assertFree(root.id, relPath);
    await moveWithin(env.files, root, { from: item.relPath, to: relPath, mode: 'keep' });
    try {
      repathItem(
        env,
        item,
        { parentId: target.parent?.id ?? null, relPath, name: basename(relPath) },
        { op, actor: changeActorOf(caller) },
      );
    } catch (cause) {
      await moveWithin(env.files, root, { from: relPath, to: item.relPath, mode: 'keep' });
      throw cause;
    }
    return item.id;
  }

  private async newFolder(caller: DriveCaller, parentId: string, name: string): Promise<Outcome> {
    const parent = this.folderOf(caller, parentId);
    const root = writableRoot(this.deps.read, caller, parent.rootId);
    return (await this.makeFolder(caller, root, parent, name)).id;
  }

  private async makeFolder(
    caller: DriveCaller,
    root: DriveWriteRoot,
    parent: DriveItem,
    name: string,
  ): Promise<DriveItem> {
    const { env } = this.deps;
    const relPath = joined(parent, name);
    this.assertFree(root.id, relPath);
    const path = await locate(root, relPath);
    if ((await env.files.stamp(path)) !== null) {
      throw new DriveWriteError('exists', 'A folder or file with that name is already on disk.');
    }
    await env.files.mkdir(path);
    const stamp = await env.files.stamp(path);
    if (stamp === null) {
      throw new DriveWriteError('missing', 'The new folder is missing after it was made.');
    }
    return recordItem(env, {
      draft: folderDraft(
        {
          rootId: root.id,
          parentId: parent.id,
          relPath,
          modifiedAt: isoOf(stamp.mtimeNs),
          addedAt: env.now().toISOString(),
          outside: false,
          addedByProfileId: caller.profileId,
        },
        0,
      ),
      identity: identityOf(stamp),
      op: 'create',
      actor: changeActorOf(caller),
    });
  }

  private async copy(caller: DriveCaller, id: string, toFolderId: string): Promise<Outcome> {
    const { read } = this.deps;
    const item = read.readItem(caller, id);
    const parent = this.folderOf(caller, toFolderId);
    if (
      item.kind === 'folder' &&
      item.rootId === parent.rootId &&
      isInside(item.relPath, parent.relPath)
    ) {
      throw new ApiError('invalid_request', 'A folder cannot be copied into itself.');
    }
    const roots = {
      source: physicalRoot(read.rootFor(caller, item.rootId)),
      root: writableRoot(read, caller, parent.rootId),
    };
    return (await this.copyNode(caller, roots, item, parent)).id;
  }

  private copyNode(
    caller: DriveCaller,
    roots: CopyRoots,
    item: DriveItem,
    parent: DriveItem,
  ): Promise<DriveItem> {
    return item.kind === 'folder'
      ? this.copyFolder(caller, roots, item, parent)
      : this.copyFile(caller, roots, item, parent);
  }

  private async copyFile(
    caller: DriveCaller,
    roots: CopyRoots,
    item: DriveItem,
    parent: DriveItem,
  ): Promise<DriveItem> {
    const { env, guard } = this.deps;
    const relPath = joined(parent, item.name);
    this.assertFree(roots.root.id, relPath);
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

  private async copyFolder(
    caller: DriveCaller,
    roots: CopyRoots,
    folder: DriveItem,
    parent: DriveItem,
  ): Promise<DriveItem> {
    const made = await this.makeFolder(caller, roots.root, parent, folder.name);
    let after: string | null = null;
    do {
      const window = this.deps.store.driveItems.children(
        folder.rootId,
        folder.id,
        after,
        DRIVE_PAGE_SIZE,
      );
      for (const entry of window.entries) {
        await this.copyNode(caller, roots, entry.item, made);
      }
      after = window.next;
    } while (after !== null);
    return made;
  }

  private folderOf(caller: DriveCaller, id: string): DriveItem {
    const item = this.deps.read.readItem(caller, id);
    if (item.kind !== 'folder') {
      throw new ApiError('invalid_request', 'The destination is not a folder.');
    }
    return item;
  }

  private identity(id: string): DriveItemIdentity {
    const identity = this.deps.store.driveItems.identityOf(id);
    if (identity === null) {
      throw new DriveWriteError('missing', 'The item is not indexed yet; scan its folder first.');
    }
    return identity;
  }

  private assertFree(rootId: string, relPath: string): void {
    const existing = this.deps.store.driveItems.byPath(rootId, relPath);
    if (existing !== undefined) {
      throw new NameClash(basename(relPath), existing.id);
    }
  }
}
