import { z } from 'zod';
import type { StoreContext } from '../context';

const PRESENT = z.strictObject({ present: z.literal(1) });

export function starredBy(profile = '$profile', item = 'i.id'): string {
  return `exists (select 1 from drive_stars star where star.item_id = ${item} and star.profile_id = ${profile})`;
}

export class DriveStarsRepository {
  constructor(private readonly context: StoreContext) {}

  isStarred(profileId: string, itemId: string): boolean {
    return (
      this.context.sql.get(
        PRESENT,
        'select 1 as present from drive_stars where profile_id = $profileId and item_id = $itemId',
        { profileId, itemId },
      ) !== undefined
    );
  }

  star(profileId: string, itemId: string): void {
    this.context.write(() => {
      this.context.sql.run(
        'star the drive item',
        'insert or ignore into drive_stars (profile_id, item_id) values ($profileId, $itemId)',
        { profileId, itemId },
      );
    });
  }

  unstar(profileId: string, itemId: string): void {
    this.context.write(() => {
      this.context.sql.run(
        'unstar the drive item',
        'delete from drive_stars where profile_id = $profileId and item_id = $itemId',
        { profileId, itemId },
      );
    });
  }
}
