import type { StoreContext } from '../context';

export function invalidateDerivedRevision(context: StoreContext, itemId: string): void {
  context.sql.run(
    'invalidate the previous revision thumbnail',
    "update drive_items set thumb_state = 'none', thumb_reason = null where id = $itemId",
    { itemId },
  );
  context.sql.run(
    'invalidate the previous revision derived media',
    `update drive_media set thumbhash = null, preview_state = 'none', preview_reason = null,
      poster_state = 'none', poster_reason = null, playable_state = 'none', playable_reason = null
      where item_id = $itemId`,
    { itemId },
  );
}
