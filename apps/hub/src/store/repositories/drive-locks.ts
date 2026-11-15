import { z } from 'zod';
import { lockedSql } from '../../drive/access';
import type { StoreContext } from '../context';

const PRESENT = z.strictObject({ present: z.literal(1) });

export class DriveLocksRepository {
  constructor(private readonly context: StoreContext) {}

  isSet(itemId: string): boolean {
    return (
      this.context.sql.get(
        PRESENT,
        'select 1 as present from drive_item_locks where item_id = $itemId',
        { itemId },
      ) !== undefined
    );
  }

  covers(itemId: string): boolean {
    return (
      this.context.sql.get(
        PRESENT,
        `select 1 as present from drive_items i where i.id = $itemId and ${lockedSql('i')}`,
        { itemId },
      ) !== undefined
    );
  }

  set(itemId: string, lockedBy: string, locked: boolean): void {
    this.context.write(() => {
      if (locked) {
        this.context.sql.run(
          'lock the drive item',
          `insert or ignore into drive_item_locks (item_id, locked_by, locked_at)
            values ($itemId, $lockedBy, $now)`,
          { itemId, lockedBy, now: this.context.now() },
        );
        return;
      }
      this.context.sql.run(
        'unlock the drive item',
        'delete from drive_item_locks where item_id = $itemId',
        { itemId },
      );
    });
  }
}
