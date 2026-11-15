export function albumExposableSql(entry = 'ai', album = 'al', root = 'r'): string {
  return `(${root}.scope = 'home'
    or (${root}.scope = 'person'
      and (${root}.owner_profile_id is ${album}.owner_profile_id
        or (${root}.owner_profile_id is ${entry}.added_by
          and exists (select 1 from photo_album_members m
            where m.album_id = ${album}.id and m.profile_id = ${entry}.added_by)))))`;
}

export function partnerSavedAlbumSql(album = 'al', root = 'r'): string {
  return `(exists (select 1 from photo_partner_saved_albums sa where sa.album_id = ${album}.id)
    and ${root}.scope = 'person'
    and exists (select 1 from photo_partner_shares ps
      where ps.recipient_id = ${album}.owner_profile_id
        and ps.sharer_id = ${root}.owner_profile_id))`;
}
