import { itemsOf, VISIBLE_ITEM } from './rows';

export const PEOPLE_COUNT_SQL = `select count(*) as total from photo_groups g
  where g.profile_id = $profile and g.hidden = 0
    and exists (select 1 from photo_group_faces gf join photo_faces f on f.id = gf.face_id
      join ${itemsOf('f.item_id')}
      where gf.group_id = g.id and gf.profile_id = $profile and gf.source <> 'rejected'
        and ${VISIBLE_ITEM})`;
