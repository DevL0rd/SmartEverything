import { z } from 'zod';
import type { StoreContext } from '../context';

const STORED = z
  .strictObject({ text: z.string().nullable(), source: z.enum(['file', 'manual']) })
  .readonly();

export type StoredPhotoDescription = z.infer<typeof STORED>;

const PENDING = z
  .strictObject({ id: z.string(), rel_path: z.string(), dev: z.string(), ino: z.string() })
  .transform((row) => ({ id: row.id, relPath: row.rel_path, dev: row.dev, ino: row.ino }));

export type PendingDescription = z.infer<typeof PENDING>;

export interface ManualDescription {
  readonly itemId: string;
  readonly text: string | null;
  readonly setBy: string;
}

export class PhotoDescriptionsRepository {
  constructor(private readonly context: StoreContext) {}

  find(itemId: string): StoredPhotoDescription | undefined {
    return this.context.sql.get(
      STORED,
      'select text, source from photo_descriptions where item_id = $itemId',
      { itemId },
    );
  }

  fromFile(itemId: string, text: string | null): void {
    this.context.write(() => {
      if (text === null) {
        this.context.sql.run(
          'forget the description the file no longer holds',
          `delete from photo_descriptions where item_id = $itemId and source = 'file'`,
          { itemId },
        );
      } else {
        this.context.sql.run(
          'keep the description read from the file',
          `insert into photo_descriptions (item_id, text, source, set_by, set_at)
            values ($itemId, $text, 'file', null, $now)
            on conflict (item_id) do update set text = excluded.text, set_at = excluded.set_at
              where photo_descriptions.source = 'file'`,
          { itemId, text, now: this.context.now() },
        );
      }
      this.settle(itemId);
    });
  }

  setManual(description: ManualDescription): void {
    this.context.sql.run(
      'keep the description written by hand',
      `insert into photo_descriptions (item_id, text, source, set_by, set_at)
        values ($itemId, $text, 'manual', $setBy, $now)
        on conflict (item_id) do update set text = excluded.text, source = 'manual',
          set_by = excluded.set_by, set_at = excluded.set_at`,
      {
        itemId: description.itemId,
        text: description.text,
        setBy: description.setBy,
        now: this.context.now(),
      },
    );
  }

  pending(rootId: string): readonly PendingDescription[] {
    return this.context.sql.all(
      PENDING,
      `select i.id, i.rel_path, i.dev, i.ino from photo_description_backlog b
        join drive_items i on i.id = b.item_id
        where i.root_id = $rootId and i.dev is not null and i.ino is not null
        order by i.id`,
      { rootId },
    );
  }

  settle(itemId: string): void {
    this.context.sql.run(
      'take the photo off the description backlog',
      'delete from photo_description_backlog where item_id = $itemId',
      { itemId },
    );
  }
}
