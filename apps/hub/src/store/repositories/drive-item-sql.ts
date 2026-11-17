export const SHARED = `(exists (select 1 from drive_grants g where g.item_id = i.id)
  or exists (select 1 from drive_shares s where s.item_id = i.id and s.revoked_at is null
    and (s.expires_at is null or s.expires_at > $now)))`;

export const OPEN_COMMENTS = `(select count(*) from drive_comments c
  where c.item_id = i.id and c.parent_id is null and c.resolved_at is null
    and (c.deleted_at is null or exists (select 1 from drive_comments r
      where r.parent_id = c.id and r.deleted_at is null)))`;

export const ICON_HINT =
  'exists (select 1 from drive_folder_icons f where f.folder_item_id = i.id)';
