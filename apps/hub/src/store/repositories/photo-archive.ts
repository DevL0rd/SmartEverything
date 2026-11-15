import { z } from 'zod';
import type { StoreContext } from '../context';
import { inList } from '../sql';

const COUNT = z.strictObject({ total: z.number() });

export class PhotoArchiveRepository {
  constructor(private readonly context: StoreContext) {}

  archive(profileId: string, itemIds: readonly string[]): number {
    return this.context.write(() => {
      let changed = 0;
      for (const itemId of itemIds) {
        changed += this.context.sql.run(
          'archive the photo',
          `insert into photo_archive (profile_id, item_id, archived_at)
            values ($profileId, $itemId, $now)
            on conflict do nothing`,
          { profileId, itemId, now: this.context.now() },
        );
      }
      return changed;
    });
  }

  restore(profileId: string, itemIds: readonly string[]): number {
    const filter = inList('item_id', 'ids', itemIds);
    return this.context.write(() =>
      this.context.sql.run(
        'restore the archived photos',
        `delete from photo_archive where profile_id = $profileId and ${filter.text}`,
        { profileId, ...filter.parameters },
      ),
    );
  }

  archivedAmong(profileId: string, itemIds: readonly string[]): string[] {
    const filter = inList('item_id', 'ids', itemIds);
    return this.context.sql
      .all(
        z.strictObject({ item_id: z.string() }),
        `select item_id from photo_archive
          where profile_id = $profileId and ${filter.text} order by item_id`,
        { profileId, ...filter.parameters },
      )
      .map((row) => row.item_id);
  }

  count(profileId: string): number {
    return (
      this.context.sql.get(
        COUNT,
        'select count(*) as total from photo_archive where profile_id = $profileId',
        { profileId },
      )?.total ?? 0
    );
  }
}
