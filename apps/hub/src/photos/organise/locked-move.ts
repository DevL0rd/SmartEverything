import {
  ApiError,
  type DriveChange,
  type DriveChangeResult,
  type PhotoItemIds,
} from '@smarteverything/domain';
import { z } from 'zod';
import { LOCKED_FOLDER, lockedFolderSql } from '../../drive/access';
import type { DriveWriteService } from '../../drive/service-write';
import type { DriveCaller } from '../../drive/service-write-support';
import type { StoredDrive } from '../../store/repositories/drive-roots';
import { inList } from '../../store/sql';
import type { Store } from '../../store/store';
import { PHOTOS_FOLDER } from '../membership';
import { announceItems, visibleItems, type ItemsChanged } from './items';

export type MoveStore = Pick<
  Store,
  'context' | 'write' | 'feed' | 'driveFeed' | 'driveRoots' | 'driveItems' | 'driveShares'
>;

export interface MoveEnv {
  readonly store: MoveStore;
  readonly write: Pick<DriveWriteService, 'change'>;
  readonly now: () => Date;
}

const LOCKED_ID = z.strictObject({ id: z.string(), taken_at: z.string().nullable() });

type LockedRow = z.output<typeof LOCKED_ID>;

function opened(caller: DriveCaller): DriveCaller {
  return { ...caller, lockedFolder: 'open' };
}

function announceHeld(store: MoveStore, root: StoredDrive, held: readonly LockedRow[]): void {
  announceItems(
    store,
    held.map((row) => ({
      id: row.id,
      rootId: root.id,
      takenAt: row.taken_at,
      tzOffsetMin: null,
      own: true,
    })),
  );
}

function refusal(result: DriveChangeResult): ApiError {
  const reasons = [
    ...result.failed.map((failure) => failure.reason),
    ...result.conflicts.map(
      (conflict) => `A file named ${conflict.name} is already in the destination folder.`,
    ),
  ];
  return new ApiError('invalid_request', reasons[0] ?? 'Nothing was moved.');
}

export class LockedMover {
  constructor(private readonly env: MoveEnv) {}

  async moveIn(caller: DriveCaller, request: PhotoItemIds): Promise<ItemsChanged> {
    const { store } = this.env;
    const root = this.personalRoot(caller);
    const items = visibleItems(store.context, caller, request.itemIds);
    if (items.some((item) => item.rootId !== root.id)) {
      throw new ApiError(
        'invalid_request',
        'Only photos in your own drive can move to the Locked folder.',
      );
    }
    const folder = await this.folder(caller, root, LOCKED_FOLDER);
    const result = await this.env.write.change(opened(caller), {
      action: 'move',
      itemIds: items.map((item) => item.id),
      toFolderId: folder,
    });
    const moved = new Set(result.done.map((done) => done.itemId));
    this.revokeShares([...moved]);
    if (moved.size === 0) throw refusal(result);
    announceItems(
      store,
      items.filter((item) => moved.has(item.id)),
    );
    return { count: moved.size };
  }

  async moveOut(caller: DriveCaller, request: PhotoItemIds): Promise<ItemsChanged> {
    const root = this.personalRoot(caller);
    const held = this.held(root, request);
    const folder = await this.folder(caller, root, PHOTOS_FOLDER);
    const result = await this.env.write.change(opened(caller), {
      action: 'move',
      itemIds: held.map((row) => row.id),
      toFolderId: folder,
    });
    if (result.done.length === 0) throw refusal(result);
    announceHeld(this.env.store, root, held);
    return { count: result.done.length };
  }

  async remove(caller: DriveCaller, request: PhotoItemIds): Promise<ItemsChanged> {
    const root = this.personalRoot(caller);
    const held = this.held(root, request);
    const unlocked = opened(caller);
    const trashed = await this.env.write.change(unlocked, {
      action: 'trash',
      itemIds: held.map((row) => row.id),
    });
    const ids = trashed.done.map((done) => done.itemId);
    if (ids.length === 0) throw refusal(trashed);
    const removed = await this.env.write.change(unlocked, { action: 'delete_now', itemIds: ids });
    if (removed.done.length === 0) throw refusal(removed);
    announceHeld(this.env.store, root, held);
    return { count: removed.done.length };
  }

  private held(root: StoredDrive, request: PhotoItemIds): readonly LockedRow[] {
    const unique = [...new Set(request.itemIds)];
    const filter = inList('i.id', 'ids', unique);
    const held = this.env.store.context.sql.all(
      LOCKED_ID,
      `select i.id, i.taken_at from drive_items i
        where i.root_id = $rootId and i.kind in ('image', 'video')
          and ${lockedFolderSql()} and ${filter.text}`,
      { rootId: root.id, ...filter.parameters },
    );
    if (held.length !== unique.length) {
      throw new ApiError('not_found', 'Some of those photos are not in your Locked folder.');
    }
    return held;
  }

  private personalRoot(caller: DriveCaller): StoredDrive {
    const root = this.env.store.driveRoots.byIdentity('person', caller.profileId);
    if (root === undefined) throw new ApiError('not_found', 'You have no personal drive.');
    return root;
  }

  private async folder(caller: DriveCaller, root: StoredDrive, name: string): Promise<string> {
    const existing = this.env.store.driveItems.byPath(root.id, name, null);
    if (existing !== undefined) return existing.id;
    const change: DriveChange = {
      action: 'new_folder',
      parent: { kind: 'drive', rootId: root.id },
      name,
    };
    const result = await this.env.write.change(caller, change);
    const made = result.done[0]?.resultItemId;
    if (made === null || made === undefined) throw refusal(result);
    return made;
  }

  private revokeShares(itemIds: readonly string[]): void {
    const { driveShares } = this.env.store;
    const at = this.env.now().toISOString();
    this.env.store.write(() => {
      for (const itemId of itemIds) {
        for (const share of driveShares.forItem(itemId)) {
          if (share.revokedAt === null) driveShares.revoke(share.id, at);
        }
      }
    });
  }
}
