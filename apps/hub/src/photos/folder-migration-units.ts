import type { DriveItem, DriveTrashEntry } from '@smarteverything/domain';
import { z } from 'zod';
import { announce, appendFeed } from '../drive/units/change-feed';
import { repathItem, type RepathTarget } from '../drive/service-write-repath';
import { storeUnit } from '../store/host/unit';
import type { DriveItemIdentity } from '../store/repositories/drive-items';
import type { StoredDrive } from '../store/repositories/drive-roots';
import type { HostStore } from '../store/host/host-store';

const RELOCATION = z.strictObject({
  item_id: z.string(),
  from_path: z.string(),
  to_path: z.string().nullable(),
  mtime_ns: z.string().nullable(),
});

export type Relocation = z.output<typeof RELOCATION>;

const PENDING_UPLOAD = z.strictObject({ id: z.string(), name: z.string(), owner: z.string() });

export type PendingPhotoUpload = z.output<typeof PENDING_UPLOAD>;

export interface RelocationSource {
  readonly item: DriveItem;
  readonly root: StoredDrive;
  readonly identity: DriveItemIdentity | null;
}

export interface OldFolderState {
  readonly item: DriveItem;
  readonly root: StoredDrive;
  readonly occupied: boolean;
}

export interface TrashFolderEntry {
  readonly entry: DriveTrashEntry;
  readonly root: StoredDrive;
}

export interface ById {
  readonly id: string;
}

function sql(store: HostStore): HostStore['context']['sql'] {
  return store.context.sql;
}

export const PHOTO_RELOCATIONS_UNIT = storeUnit((store, _input: null) =>
  sql(store).all(
    RELOCATION,
    'select item_id, from_path, to_path, mtime_ns from drive_photo_relocations order by item_id',
  ),
);

export const PHOTO_RELOCATION_SOURCE_UNIT = storeUnit((store, input: ById): RelocationSource => {
  const item = store.driveItems.byId(input.id, null);
  return {
    item,
    root: store.driveRoots.byId(item.rootId),
    identity: store.driveItems.identityOf(item.id),
  };
});

export const PHOTO_RELOCATION_PLAN_UNIT = storeUnit(
  (
    store,
    input: { readonly id: string; readonly target: string; readonly mtimeNs: string },
  ): void => {
    sql(store).run(
      'plan the photo relocation',
      'update drive_photo_relocations set to_path = $target, mtime_ns = $mtimeNs where item_id = $id',
      input,
    );
  },
);

export const PHOTO_RELOCATION_FINISH_UNIT = storeUnit(
  (
    store,
    input: { readonly item: DriveItem; readonly target: RepathTarget; readonly owner: string },
  ): void => {
    repathItem({ store }, input.item, input.target, {
      op: 'move',
      actor: { actorProfileId: input.owner, via: 'app', deviceId: null },
    });
    sql(store).run(
      'finish the photo relocation',
      'delete from drive_photo_relocations where item_id = $id',
      { id: input.item.id },
    );
  },
);

export const PHOTO_OLD_FOLDERS_UNIT = storeUnit((store, _input: null) =>
  sql(store)
    .all(
      z.strictObject({ item_id: z.string() }),
      `select f.item_id from drive_photo_old_folders f join drive_items i on i.id = f.item_id
        order by length(i.rel_path) desc, i.id`,
    )
    .map((row) => row.item_id),
);

export const PHOTO_OLD_FOLDER_STATE_UNIT = storeUnit((store, input: ById): OldFolderState => {
  const item = store.driveItems.byId(input.id, null);
  const root = store.driveRoots.byId(item.rootId);
  const children = store.driveItems.children({
    rootId: root.id,
    parentId: item.id,
    after: null,
    limit: 1,
    viewer: null,
  });
  const pending = sql(store).get(
    z.strictObject({ id: z.string() }),
    "select id from drive_uploads where target_kind = 'folder' and target_id = $id and state = 'open'",
    { id: item.id },
  );
  return { item, root, occupied: children.entries.length > 0 || pending !== undefined };
});

export const PHOTO_OLD_FOLDER_RETAIN_UNIT = storeUnit((store, input: ById): void => {
  sql(store).run(
    'retain a nonempty former photo folder',
    'delete from drive_photo_old_folders where item_id = $id',
    { id: input.id },
  );
});

export const PHOTO_OLD_FOLDER_REMOVE_UNIT = storeUnit(
  (store, input: { readonly item: DriveItem }): void => {
    const { item } = input;
    appendFeed({ store }, { ...item, rev: item.rev + 1 }, 'delete', {
      actorProfileId: null,
      via: 'scan',
      deviceId: null,
    });
    store.driveItems.remove(item.id);
    store.driveGrants.sweepOrphans();
    store.driveShortcuts.sweepOrphans();
    announce({ store }, item.rootId, item.parentId, []);
  },
);

export const PHOTO_PENDING_UPLOADS_UNIT = storeUnit((store, _input: null) =>
  sql(store).all(
    PENDING_UPLOAD,
    `select u.id, u.name, r.owner_profile_id as owner from drive_uploads u
      join drive_items f on f.id = u.target_id join drive_roots r on r.id = f.root_id
      where u.state = 'open' and u.target_kind = 'folder'
        and r.scope = 'person' and (f.rel_path in ('Camera roll', 'Uploads')
          or f.rel_path glob 'Camera roll/*' or f.rel_path glob 'Uploads/*')`,
  ),
);

export const PHOTO_UPLOAD_RETARGET_UNIT = storeUnit(
  (store, input: { readonly id: string; readonly folderId: string }): void => {
    sql(store).run(
      'retarget the existing photo upload',
      'update drive_uploads set target_id = $folderId where id = $id',
      input,
    );
  },
);

export const PHOTO_TRASH_FOLDERS_UNIT = storeUnit((store, _input: null): TrashFolderEntry[] =>
  sql(store)
    .all(
      z.strictObject({ item_id: z.string() }),
      'select item_id from drive_photo_trash_folders order by item_id',
    )
    .map((row) => {
      const entry = store.driveTrash.byId(row.item_id);
      return { entry, root: store.driveRoots.byId(entry.rootId) };
    }),
);

export const PHOTO_TRASH_RETARGET_UNIT = storeUnit(
  (store, input: { readonly id: string; readonly path: string }): void => {
    sql(store).run(
      'retarget the deleted photo restoration',
      'update drive_trash set original_rel_path = $path where item_id = $id',
      input,
    );
    sql(store).run(
      'finish the deleted photo folder migration',
      'delete from drive_photo_trash_folders where item_id = $id',
      { id: input.id },
    );
  },
);

export const PHOTO_TRASH_RETAIN_UNIT = storeUnit((store, input: ById): void => {
  sql(store).run(
    'retain a non-media trash destination',
    'delete from drive_photo_trash_folders where item_id = $id',
    { id: input.id },
  );
});

export const PHOTO_FOLDERS_PENDING_UNIT = storeUnit((store, _input: null): number => {
  const pending = sql(store).get(
    z.strictObject({ total: z.int().nonnegative() }),
    `select (select count(*) from drive_photo_relocations)
      + (select count(*) from drive_photo_old_folders)
      + (select count(*) from drive_photo_trash_folders) as total`,
  );
  if (pending === undefined) throw new Error('The photo folder preparation count is missing.');
  return pending.total;
});
