import type { DriveItem } from '@smarteverything/domain';
import { z } from 'zod';
import { driveSearchDocument } from '../../drive/search';
import type { StoreContext } from '../../store/context';

const ROW = z.strictObject({ item_id: z.string() });

const TITLE = z.strictObject({ title: z.string() });

export class PhotoSearchLabels {
  constructor(private readonly context: StoreContext) {}

  write(item: DriveItem, labels: readonly string[]): void {
    this.context.write(() => {
      const known = this.context.sql.get(
        ROW,
        'select item_id from drive_items_search where item_id = $itemId',
        { itemId: item.id },
      );
      if (known !== undefined) {
        this.context.sql.run(
          'update the search labels of the photo',
          'update drive_items_search set labels = $labels where item_id = $itemId',
          { itemId: item.id, labels: labels.join(' ') },
        );
        return;
      }
      this.insert(item, labels);
    });
  }

  clear(itemId: string): void {
    this.context.write(() => {
      this.context.sql.run(
        'clear the search labels of the photo',
        "update drive_items_search set labels = '' where item_id = $itemId",
        { itemId },
      );
    });
  }

  private insert(item: DriveItem, labels: readonly string[]): void {
    const titles = this.context.sql
      .all(
        TITLE,
        `select al.title from drive_album_items ai join drive_albums al on al.id = ai.album_id
          where ai.item_id = $itemId order by al.title`,
        { itemId: item.id },
      )
      .map((row) => row.title);
    const document = driveSearchDocument(item, titles, labels);
    this.context.sql.run(
      'index the photo for search',
      `insert into drive_items_search (item_id, name, path, camera, albums, dates, labels)
        values ($itemId, $name, $path, $camera, $albums, $dates, $labels)`,
      { ...document },
    );
  }
}
