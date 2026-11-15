import { ApiError } from '@smarteverything/domain';
import { z } from 'zod';
import { lockedFolderSql } from '../../drive/access';
import type { StoreContext } from '../../store/context';
import { inList } from '../../store/sql';
import type { PhotoPartnerShareRow } from '../../store/repositories/photo-partner-shares';
import { partnerAccessSql, photoMembership } from '../membership';

const ID = z.strictObject({ id: z.string() });

const SHARED_BY_PARTNER = `i.kind in ('image', 'video')
  and r.scope = 'person' and r.owner_profile_id = $sharer
  and ${photoMembership('i', 'r')}
  and not ${lockedFolderSql('i')}
  and ${partnerAccessSql('i', 'r')}`;

export function partnerItemIds(
  context: StoreContext,
  share: PhotoPartnerShareRow,
  itemIds: readonly string[],
): readonly string[] {
  const unique = [...new Set(itemIds)];
  const filter = inList('i.id', 'ids', unique);
  const found = context.sql
    .all(
      ID,
      `select i.id from drive_items i join drive_roots r on r.id = i.root_id
        where ${SHARED_BY_PARTNER} and ${filter.text} order by i.id`,
      { profile: share.recipientId, sharer: share.sharerId, ...filter.parameters },
    )
    .map((row) => row.id);
  if (found.length !== unique.length) {
    throw new ApiError(
      'not_found',
      `${String(unique.length - found.length)} of the photos are not shared with you by this partner.`,
    );
  }
  return found;
}

export function unsavedPartnerItemIds(
  context: StoreContext,
  share: PhotoPartnerShareRow,
  albumId: string,
): readonly string[] {
  return context.sql
    .all(
      ID,
      `select i.id from drive_items i join drive_roots r on r.id = i.root_id
        where ${SHARED_BY_PARTNER}
          and not exists (select 1 from drive_album_items a
            where a.album_id = $albumId and a.item_id = i.id)
          and not exists (select 1 from photo_partner_delivered d
            where d.album_id = $albumId and d.item_id = i.id)
        order by i.id`,
      { profile: share.recipientId, sharer: share.sharerId, albumId },
    )
    .map((row) => row.id);
}

export function presentCount(
  context: StoreContext,
  albumId: string,
  itemIds: readonly string[],
): number {
  const filter = inList('item_id', 'ids', itemIds);
  return (
    context.sql.get(
      z.strictObject({ total: z.number() }),
      `select count(*) as total from drive_album_items where album_id = $albumId and ${filter.text}`,
      { albumId, ...filter.parameters },
    )?.total ?? 0
  );
}

export function recordDelivered(
  context: StoreContext,
  albumId: string,
  itemIds: readonly string[],
): void {
  const deliveredAt = context.now();
  for (const itemId of itemIds) {
    context.sql.run(
      'remember that the photo was handed to the saved album',
      `insert or ignore into photo_partner_delivered (album_id, item_id, delivered_at)
        values ($albumId, $itemId, $deliveredAt)`,
      { albumId, itemId, deliveredAt },
    );
  }
}
