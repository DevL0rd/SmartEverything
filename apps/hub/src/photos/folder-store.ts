import {
  PHOTO_FOLDER_KEY,
  photoFolderKindOf,
  type PhotoFolderOrigin,
  type PhotoHiddenFolder,
} from '@smarteverything/domain';
import { z } from 'zod';
import { inList, type Sql } from '../store/sql';

const HIDDEN_ROW = z.strictObject({
  folder_key: PHOTO_FOLDER_KEY,
  name: z.string().trim().min(1),
  hidden_at: z.string().min(1),
});

const ORIGIN_ROW = z.strictObject({
  item_id: z.string().min(1),
  folder_key: PHOTO_FOLDER_KEY,
  folder_name: z.string().trim().min(1),
});

export interface HiddenChange {
  readonly profileId: string;
  readonly key: string;
  readonly name: string;
  readonly hidden: boolean;
  readonly at: string;
}

export class PhotoFolderStore {
  constructor(private readonly sql: Sql) {}

  saveOrigin(backupDeviceId: string, localId: string, origin: PhotoFolderOrigin | null): void {
    if (origin === null) {
      this.sql.run(
        'forget where the backed-up photo came from',
        `delete from photo_asset_folders
         where backup_device_id = $backupDeviceId and local_id = $localId`,
        { backupDeviceId, localId },
      );
      return;
    }
    this.sql.run(
      'record where the backed-up photo came from',
      `insert into photo_asset_folders (backup_device_id, local_id, folder_key, folder_name)
       values ($backupDeviceId, $localId, $key, $name)
       on conflict (backup_device_id, local_id) do update set
         folder_key = excluded.folder_key, folder_name = excluded.folder_name`,
      { backupDeviceId, localId, key: origin.key, name: origin.name },
    );
  }

  originsOf(
    backupDeviceId: string,
    itemIds: readonly string[],
  ): ReadonlyMap<string, PhotoFolderOrigin> {
    const items = inList('a.item_id', 'itemIds', [...new Set(itemIds)]);
    const rows = this.sql.all(
      ORIGIN_ROW,
      `select a.item_id, f.folder_key, f.folder_name from drive_backup_assets a
       join photo_asset_folders f
         on f.backup_device_id = a.backup_device_id and f.local_id = a.local_id
       where a.backup_device_id = $backupDeviceId and ${items.text}
       order by a.item_id, f.folder_key`,
      { backupDeviceId, ...items.parameters },
    );
    const origins = new Map<string, PhotoFolderOrigin>();
    for (const row of rows) {
      if (!origins.has(row.item_id))
        origins.set(row.item_id, { key: row.folder_key, name: row.folder_name });
    }
    return origins;
  }

  hiddenOf(profileId: string): readonly PhotoHiddenFolder[] {
    return this.sql
      .all(
        HIDDEN_ROW,
        `select folder_key, name, hidden_at from photo_hidden_folders
         where profile_id = $profileId order by lower(name), folder_key`,
        { profileId },
      )
      .map((row) => ({
        key: row.folder_key,
        kind: photoFolderKindOf(row.folder_key),
        name: row.name,
        hiddenAt: row.hidden_at,
      }));
  }

  setHidden(change: HiddenChange): number {
    if (!change.hidden) {
      return this.sql.run(
        'show the photo folder again',
        'delete from photo_hidden_folders where profile_id = $profileId and folder_key = $key',
        { profileId: change.profileId, key: change.key },
      );
    }
    return this.sql.run(
      'hide the photo folder',
      `insert into photo_hidden_folders (profile_id, folder_key, name, hidden_at)
       values ($profileId, $key, $name, $at)
       on conflict (profile_id, folder_key) do update set name = excluded.name`,
      { profileId: change.profileId, key: change.key, name: change.name, at: change.at },
    );
  }
}
