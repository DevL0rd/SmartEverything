import {
  photoFolderKindOf,
  photoFolderPlaceOf,
  type LibraryScope,
  type PhotoFolderKey,
} from '@smarteverything/domain';
import type { DriveActor } from '../drive/access';
import type { SqlParameters } from '../store/sql';

export interface FolderStatement {
  readonly text: string;
  readonly parameters: SqlParameters;
}

export const DRIVE_FOLDER_OF = (item = 'i'): string =>
  `coalesce(${item}.parent_id, ${item}.root_id)`;

const ORIGIN_OF = (item: string): string => `drive_backup_assets a
  join photo_asset_folders f on f.backup_device_id = a.backup_device_id and f.local_id = a.local_id
  where a.item_id = ${item}.id`;

const HIDDEN_KEY = (key: string): string =>
  `exists (select 1 from photo_hidden_folders h
    where h.profile_id = $hiddenFor and h.folder_key = ${key})`;

export function folderShownSql(item = 'i'): string {
  return `not ${HIDDEN_KEY(`'drive:' || ${DRIVE_FOLDER_OF(item)}`)}
    and not (exists (select 1 from ${ORIGIN_OF(item)} and ${HIDDEN_KEY('f.folder_key')})
      and not exists (select 1 from ${ORIGIN_OF(item)} and not ${HIDDEN_KEY('f.folder_key')}))`;
}

export function folderShown(actor: DriveActor, item = 'i'): FolderStatement {
  return { text: folderShownSql(item), parameters: { hiddenFor: actor.profileId } };
}

export function inFolder(key: PhotoFolderKey, item = 'i'): FolderStatement {
  if (photoFolderKindOf(key) === 'drive') {
    return {
      text: `${DRIVE_FOLDER_OF(item)} = $folderPlace`,
      parameters: { folderPlace: photoFolderPlaceOf(key) },
    };
  }
  return {
    text: `exists (select 1 from ${ORIGIN_OF(item)} and f.folder_key = $folderKey)`,
    parameters: { folderKey: key },
  };
}

export function folderNarrowing(actor: DriveActor, scope: LibraryScope): FolderStatement {
  if (scope.folder !== undefined) {
    const inside = inFolder(scope.folder);
    return { text: ` and ${inside.text}`, parameters: inside.parameters };
  }
  if (scope.folders === 'all') return { text: '', parameters: {} };
  const shown = folderShown(actor);
  return { text: ` and ${shown.text}`, parameters: shown.parameters };
}
