import { z } from 'zod';
import type { StoreContext } from '../../store/context';
import { inList } from '../../store/sql';

const TRASHED = z.strictObject({ id: z.string() });

const PLACEMENT = z.strictObject({ id: z.string() });

export interface Reroot {
  readonly itemIds: readonly string[];
  readonly folderIds: readonly string[];
  readonly toRootId: string;
  readonly recipientProfileId: string;
}

export class TransferRows {
  constructor(private readonly context: StoreContext) {}

  reroot(change: Reroot): void {
    const items = inList('item_id', 'ids', change.itemIds);
    const folders = inList('parent_item_id', 'folders', change.folderIds);
    this.context.write(() => {
      this.context.sql.run(
        'move the item versions to the new drive',
        `update drive_versions set root_id = $toRootId, added_by_profile_id = $recipient
          where ${items.text}`,
        { ...items.parameters, toRootId: change.toRootId, recipient: change.recipientProfileId },
      );
      this.context.sql.run(
        'give the share links of the moved items to the new owner',
        `update drive_shares set created_by = $recipient where ${items.text}`,
        { ...items.parameters, recipient: change.recipientProfileId },
      );
      this.context.sql.run(
        'forget the integrity checks of the moved items',
        `delete from drive_scrub where ${items.text}`,
        items.parameters,
      );
      this.context.sql.run(
        'take the moved items out of the photo library',
        `delete from drive_photo_library where ${items.text}`,
        items.parameters,
      );
      this.context.sql.run(
        'move the shortcuts inside the moved folders',
        `update drive_shortcuts set root_id = $toRootId where ${folders.text}`,
        { ...folders.parameters, toRootId: change.toRootId },
      );
    });
  }

  trashedUnder(rootId: string, folderIds: readonly string[]): string[] {
    const folders = inList(`json_extract(r.row, '$.parent_id')`, 'folders', folderIds);
    return this.context.sql
      .all(
        TRASHED,
        `select t.item_id as id from drive_trash t
          join drive_trash_rows r on r.trash_item_id = t.item_id
            and r.table_name = 'drive_items'
            and json_extract(r.row, '$.id') = t.item_id
          where t.root_id = $rootId and ${folders.text}`,
        { ...folders.parameters, rootId },
      )
      .map((row) => row.id);
  }

  placementsOn(fromRootId: string, folderIds: readonly string[]): string[] {
    const folders = inList('folder_item_id', 'folders', folderIds);
    return this.context.sql
      .all(
        PLACEMENT,
        `select id from drive_placements where root_id = $fromRootId and ${folders.text}`,
        { ...folders.parameters, fromRootId },
      )
      .map((row) => row.id);
  }
}
