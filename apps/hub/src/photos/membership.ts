import { accessSql, type DriveActor } from '../drive/access';
import type { SqlFilter } from '../store/sql';

export const PHOTOS_FOLDER = 'Photos';

export function photoMembership(item = 'i', root = 'r'): string {
  return `(exists (select 1 from drive_photo_library p where p.item_id = ${item}.id)
    or (${root}.scope = 'person' and ${item}.rel_path glob '${PHOTOS_FOLDER}/*'))`;
}

export function trashedPhotoMembership(trash = 't', root = 'r'): string {
  return `(exists (select 1 from drive_photo_library p where p.item_id = ${trash}.item_id)
    or (${root}.scope = 'person' and ${trash}.original_rel_path glob '${PHOTOS_FOLDER}/*'))`;
}

export const PHOTO_VISIBLE = `${photoMembership()} and ${accessSql()}`;

export function photoVisible(actor: DriveActor): SqlFilter {
  return { text: PHOTO_VISIBLE, parameters: { profile: actor.profileId } };
}
