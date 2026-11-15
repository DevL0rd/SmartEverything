import { accessSql, lockedFolderSql, type DriveActor } from '../drive/access';
import { albumExposableSql, partnerSavedAlbumSql } from '../store/album-exposure';
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

export function albumAccessSql(item = 'i', root = 'r'): string {
  return `exists (select 1 from drive_album_items ai
    join drive_albums al on al.id = ai.album_id
    where ai.item_id = ${item}.id and al.surface = 'photos' and al.kind = 'manual'
      and (
        (al.owner_profile_id = $profile
          and (${albumExposableSql('ai', 'al', root)} or ${partnerSavedAlbumSql('al', root)}))
        or (${albumExposableSql('ai', 'al', root)} and exists (
          select 1 from photo_album_members pm
          where pm.album_id = al.id and pm.profile_id = $profile))))`;
}

export function partnerAccessSql(item = 'i', root = 'r'): string {
  return `(${root}.scope = 'person' and exists (select 1 from photo_partner_shares ps
    where ps.recipient_id = $profile and ps.state = 'accepted'
      and ps.sharer_id = ${root}.owner_profile_id
      and date(coalesce(${item}.taken_at, ${item}.added_at)) >= ps.from_day
      and not exists (select 1 from photo_archive pa
        where pa.profile_id = ps.sharer_id and pa.item_id = ${item}.id)
      and (ps.scope = 'all' or exists (select 1 from photo_faces f
        join photo_group_faces gf on gf.face_id = f.id
        join photo_partner_groups pg on pg.group_id = gf.group_id and pg.share_id = ps.id
        where f.item_id = ${item}.id and gf.profile_id = ps.sharer_id and gf.source <> 'rejected'))))`;
}

export function archivedSql(item = 'i'): string {
  return `exists (select 1 from photo_archive a
    where a.profile_id = $profile and a.item_id = ${item}.id)`;
}

export function photoVisibleSql(item = 'i', root = 'r'): string {
  return `(${photoMembership(item, root)}
    and not ${lockedFolderSql(item)}
    and (${accessSql(item, root)} or ${albumAccessSql(item, root)} or ${partnerAccessSql(item, root)}))`;
}

export function libraryVisibleSql(item = 'i', root = 'r'): string {
  return `(${photoVisibleSql(item, root)} and not ${archivedSql(item)})`;
}

export const PHOTO_VISIBLE = photoVisibleSql();

export const LIBRARY_VISIBLE = libraryVisibleSql();

export function photoVisible(actor: DriveActor): SqlFilter {
  return { text: PHOTO_VISIBLE, parameters: { profile: actor.profileId } };
}

export function libraryVisible(actor: DriveActor): SqlFilter {
  return { text: LIBRARY_VISIBLE, parameters: { profile: actor.profileId } };
}
