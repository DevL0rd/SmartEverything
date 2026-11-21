import type { DriveItemWindow } from '../store/repositories/drive-items';
import { basename } from 'node:path';
import {
  ApiError,
  type DriveChange,
  type DriveChangeResult,
  type DriveFolderPlace,
  type DriveItem,
  type DriveTrashEntry,
} from '@smarteverything/domain';
import { folderDraft, recordItem, type ChangeEnv } from './changes';
import { identityOf, isoOf } from './change-rows';
import { locate, moveWithin, type DriveWriteRoot } from './intents';
import { DriveWriteError } from './write-error';
import { isInside, normalizeRelativePath } from './paths';
import type { DriveWriteGuard } from './quotas';
import type { DriveRootLanes } from './root-lanes';
import type { DriveReadService } from './service-read';
import { DRIVE_PAGE_SIZE } from './page-size';
import {
  copyFile,
  copyLink,
  copySpecial,
  type CopyContext,
  type CopyRoots,
  type CopyAsk,
  type CopyTarget,
  type FolderPlace,
  madeAlready,
} from './service-write-copy';
import type { AlbumEditing } from './service-write-albums';
import type { RepathOp } from './service-write-repath';
import { writeDriveOps } from './units/ops';
import {
  NameClash,
  changeActorOf,
  refusalReason,
  writableItemRoot,
  writableRoot,
  type DriveCaller,
  type WriteStore,
} from './service-write-support';
import { requireExport } from './sharing/export-guard';
import { commitRestore } from './trash-purge';
import { trashItems } from './service-write-trash';
import { removeTrashEntry } from './trash';

export interface TreeDeps {
  readonly env: ChangeEnv;
  readonly store: WriteStore;
  readonly read: DriveReadService;
  readonly albums: AlbumEditing;
  readonly guard: DriveWriteGuard;
  readonly scan: (rootId: string) => void;
  readonly lanes: DriveRootLanes;
}

type ItemChange = Extract<DriveChange, { readonly itemIds: readonly string[] }>;

type NewFolderChange = Extract<DriveChange, { readonly action: 'new_folder' }>;

type CopyChange = Extract<DriveChange, { readonly action: 'copy' }>;

type Outcome = string | null;

function placeIdOf(place: DriveFolderPlace): string {
  return place.kind === 'drive' ? place.rootId : place.folderId;
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
        return this.each([placeIdOf(change.parent)], async () =>
          this.inRoots([await this.placeRootOf(caller, change.parent)], () =>
            this.newFolder(caller, change),
          ),
        );
      case 'rename':
        return this.each([change.itemId], async (id) =>
          this.inRoots([await this.itemRootOf(caller, id)], () =>
            this.rename(caller, id, change.name),
          ),
        );
      case 'keep_source_item':
        return this.each([change.itemId], (id) =>
          this.lockedCopy(caller, { id, toFolderId: change.toFolderId, copyId: undefined }),
        );
    }
  }

  private batch(caller: DriveCaller, change: ItemChange): Promise<DriveChangeResult> {
    const ids = change.itemIds;
    switch (change.action) {
      case 'move':
        return this.each(ids, async (id) =>
          this.inRoots([await this.itemRootOf(caller, id)], () =>
            this.move(caller, id, change.toFolderId),
          ),
        );
      case 'copy':
        return this.copies(caller, change);
      case 'star':
        return this.each(ids, (id) => this.star(caller, id, true));
      case 'unstar':
        return this.each(ids, (id) => this.star(caller, id, false));
      case 'trash':
        return trashItems(this.deps, caller, ids);
      case 'restore':
        return this.each(ids, async (id) =>
          this.inRoots([(await this.trashEntry(id)).rootId], () => this.restore(caller, id)),
        );
      case 'delete_now':
        return this.each(ids, async (id) =>
          this.inRoots([(await this.trashEntry(id)).rootId], () => this.deleteNow(caller, id)),
        );
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

  private async star(caller: DriveCaller, id: string, starred: boolean): Promise<Outcome> {
    await this.deps.store.host.write('driveStar', { actor: caller, itemId: id, starred });
    return id;
  }

  private inRoots<T>(rootIds: readonly string[], work: () => Promise<T> | T): Promise<T> {
    return this.deps.lanes.run(rootIds, async () => work());
  }

  private async itemRootOf(caller: DriveCaller, id: string): Promise<string> {
    return (await this.deps.read.readItem(caller, id)).rootId;
  }

  private async placeRootOf(caller: DriveCaller, place: DriveFolderPlace): Promise<string> {
    return place.kind === 'drive' ? place.rootId : this.itemRootOf(caller, place.folderId);
  }

  private async trashEntry(id: string): Promise<DriveTrashEntry> {
    const entry = await this.deps.store.host.call('driveTrash', 'find', id);
    if (entry === undefined) {
      throw new ApiError('not_found', 'There is no such item in the trash.');
    }
    return entry;
  }

  private copies(caller: DriveCaller, change: CopyChange): Promise<DriveChangeResult> {
    const copyIds = new Map(change.itemIds.map((id, index) => [id, change.copyIds?.[index]]));
    return this.each(change.itemIds, (id) =>
      this.lockedCopy(caller, { id, toFolderId: change.toFolderId, copyId: copyIds.get(id) }),
    );
  }

  private async lockedCopy(caller: DriveCaller, ask: CopyAsk): Promise<Outcome> {
    const rootIds = [
      await this.itemRootOf(caller, ask.id),
      await this.itemRootOf(caller, ask.toFolderId),
    ];
    return this.inRoots(rootIds, () => this.copy(caller, ask));
  }

  private async restore(caller: DriveCaller, id: string): Promise<Outcome> {
    const entry = await this.trashEntry(id);
    const root = await writableRoot(this.deps.read, caller, entry.rootId);
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
    const entry = await this.trashEntry(id);
    const drive = await writableRoot(this.deps.read, caller, entry.rootId);
    if (drive.scope === 'home' && !caller.owner && entry.addedByProfileId !== caller.profileId) {
      throw new ApiError('forbidden', 'A member can remove only the trash charged to them.');
    }
    await removeTrashEntry(this.deps.env, entry);
    this.deps.env.purge.rearm();
    const announce = { rootId: entry.rootId, parentId: null, items: [] };
    await this.deps.store.host.write('driveAnnounce', announce);
    return null;
  }

  private async albumAdd(caller: DriveCaller, albumId: string, id: string): Promise<Outcome> {
    await this.deps.albums.addItems(albumId, [id], caller);
    return id;
  }

  private async albumRemove(caller: DriveCaller, albumId: string, id: string): Promise<Outcome> {
    await this.deps.albums.removeItems(albumId, [id], caller);
    return id;
  }

  private async rename(caller: DriveCaller, id: string, name: string): Promise<Outcome> {
    const item = await this.deps.read.readItem(caller, id);
    const parent =
      item.parentId === null
        ? null
        : await this.deps.store.host.call('driveItems', 'byId', item.parentId, caller.profileId);
    return this.relocate(caller, item, { parent, name }, 'rename');
  }

  private async move(caller: DriveCaller, id: string, toFolderId: string): Promise<Outcome> {
    const item = await this.deps.read.readItem(caller, id);
    const parent = await this.folderOf(caller, toFolderId);
    if (item.rootId !== parent.rootId) {
      throw new ApiError(
        'invalid_request',
        'A move stays inside one drive; copy the item instead.',
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
    const { env, store } = this.deps;
    const root = await writableItemRoot(store, caller, item);
    const relPath = joined(target.parent, target.name);
    if (relPath === item.relPath) {
      return item.id;
    }
    await this.assertFree(root.id, relPath, caller);
    await moveWithin(env.files, root, { from: item.relPath, to: relPath, mode: 'keep' });
    try {
      await writeDriveOps(store, [
        {
          kind: 'repath',
          itemId: item.id,
          target: { parentId: target.parent?.id ?? null, relPath, name: basename(relPath) },
          change: { op, actor: changeActorOf(caller) },
        },
      ]);
    } catch (cause) {
      await moveWithin(env.files, root, { from: relPath, to: item.relPath, mode: 'keep' });
      throw cause;
    }
    return item.id;
  }

  private async newFolder(caller: DriveCaller, change: NewFolderChange): Promise<Outcome> {
    if (change.parent.kind === 'drive') {
      const root = await writableRoot(this.deps.read, caller, change.parent.rootId);
      return (await this.makeFolder(caller, root, { ...change, parent: null })).id;
    }
    const parent = await this.folderOf(caller, change.parent.folderId);
    const root = await writableItemRoot(this.deps.store, caller, parent);
    return (await this.makeFolder(caller, root, { ...change, parent })).id;
  }

  private async makeFolder(
    caller: DriveCaller,
    root: DriveWriteRoot,
    { parent, name, id }: FolderPlace,
  ): Promise<DriveItem> {
    const { env } = this.deps;
    const relPath = joined(parent, name);
    const made = await madeAlready(this.deps.store, id, root.id, relPath);
    if (made !== null) return made;
    await this.assertFree(root.id, relPath, caller);
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
          parentId: parent?.id ?? null,
          relPath,
          modifiedAt: isoOf(stamp.mtimeNs),
          addedAt: env.now().toISOString(),
          outside: false,
          addedByProfileId: caller.profileId,
          ...(id === undefined ? {} : { id }),
        },
        0,
      ),
      identity: identityOf(stamp),
      op: 'create',
      actor: changeActorOf(caller),
    });
  }

  private async copy(caller: DriveCaller, ask: CopyAsk): Promise<Outcome> {
    const { read, store } = this.deps;
    const item = await read.readItem(caller, ask.id);
    const parent = await this.folderOf(caller, ask.toFolderId);
    const made = await madeAlready(store, ask.copyId, parent.rootId, joined(parent, item.name));
    if (made !== null) return made.id;
    if (
      item.kind === 'folder' &&
      item.rootId === parent.rootId &&
      isInside(item.relPath, parent.relPath)
    ) {
      throw new ApiError('invalid_request', 'A folder cannot be copied into itself.');
    }
    const roots = {
      source: await read.rootOfItem(caller, item),
      root: await writableItemRoot(this.deps.store, caller, parent),
    };
    return (await this.copyNode(caller, roots, item, { parent, id: ask.copyId })).id;
  }

  private async copyNode(
    caller: DriveCaller,
    roots: CopyRoots,
    item: DriveItem,
    target: CopyTarget,
  ): Promise<DriveItem> {
    const access = await this.deps.store.host.read('driveItemAccess', { actor: caller, item });
    requireExport(access, item);
    switch (item.kind) {
      case 'folder':
        return this.copyFolder(caller, roots, item, target);
      case 'link':
        return copyLink(this.copyContext(caller, roots), { item, target: item.linkTarget }, target);
      case 'special':
        return copySpecial(this.copyContext(caller, roots), item, target);
      case 'image':
      case 'video':
      case 'audio':
      case 'document':
      case 'other':
        return copyFile(this.copyContext(caller, roots), item, target);
    }
  }

  private copyContext(caller: DriveCaller, roots: CopyRoots): CopyContext {
    return {
      caller,
      roots,
      env: this.deps.env,
      store: this.deps.store,
      guard: this.deps.guard,
      assertFree: (rootId, relPath, who) => this.assertFree(rootId, relPath, who),
    };
  }

  private async copyFolder(
    caller: DriveCaller,
    roots: CopyRoots,
    folder: DriveItem,
    target: CopyTarget,
  ): Promise<DriveItem> {
    const made = await this.makeFolder(caller, roots.root, { ...target, name: folder.name });
    let after: string | null = null;
    do {
      const window: DriveItemWindow = await this.deps.store.host.call('driveItems', 'children', {
        rootId: folder.rootId,
        parentId: folder.id,
        after,
        limit: DRIVE_PAGE_SIZE,
        viewer: caller.profileId,
      });
      for (const entry of window.entries) {
        await this.copyNode(caller, roots, entry.item, { parent: made, id: undefined });
      }
      after = window.next;
    } while (after !== null);
    return made;
  }

  private async folderOf(caller: DriveCaller, id: string): Promise<DriveItem> {
    const item = await this.deps.read.readItem(caller, id);
    if (item.kind !== 'folder') {
      throw new ApiError('invalid_request', 'The destination is not a folder.');
    }
    return item;
  }

  private async assertFree(rootId: string, relPath: string, caller: DriveCaller): Promise<void> {
    const { host } = this.deps.store;
    const existing = await host.call('driveItems', 'byPath', rootId, relPath, caller.profileId);
    if (existing !== undefined) {
      throw new NameClash(basename(relPath), existing.id);
    }
  }
}
