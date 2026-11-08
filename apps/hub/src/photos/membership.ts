export const PHOTO_ROOT_VISIBLE = `($owner = 1 or r.scope = 'home' or r.owner_profile_id = $profile)`;

export function photoMembership(itemId: string): string {
  return `(r.in_photos = 1 or exists (
    select 1 from drive_photo_library p where p.item_id = ${itemId}
  ))`;
}

export const PHOTO_VISIBLE = `${photoMembership('i.id')} and ${PHOTO_ROOT_VISIBLE}`;
