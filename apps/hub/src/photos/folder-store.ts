import {
  PHOTO_FOLDER_KEY,
  photoFolderKindOf,
  type PhotoFolderOrigin,
  type PhotoHiddenFolder,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { Sql } from '../store/sql';

const HIDDEN_ROW = z.strictObject({
  folder_key: PHOTO_FOLDER_KEY,
  name: z.string().trim().min(1),
  hidden_at: z.string().min(1),
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
