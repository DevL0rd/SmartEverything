import { z } from 'zod';
import type { StoreContext } from '../context';

const OPEN = z.strictObject({ item_id: z.string(), opened_at: z.string() });

export function openedAtBy(profile = '$viewer', item = 'i.id'): string {
  return `(select o.opened_at from drive_opens o where o.item_id = ${item} and o.profile_id = ${profile})`;
}

export class DriveOpensRepository {
  constructor(private readonly context: StoreContext) {}

  record(profileId: string, itemId: string, at: string): void {
    this.context.write(() => {
      this.context.sql.run(
        'record that the person opened the drive item',
        `insert into drive_opens (profile_id, item_id, opened_at) values ($profileId, $itemId, $at)
          on conflict (profile_id, item_id) do update set opened_at = excluded.opened_at
          where excluded.opened_at > drive_opens.opened_at`,
        { profileId, itemId, at },
      );
    });
  }

  latestInDrive(rootId: string): Map<string, string> {
    const rows = this.context.sql.all(
      OPEN,
      `select o.item_id, max(o.opened_at) as opened_at
        from drive_opens o join drive_items i on i.id = o.item_id
        where i.root_id = $rootId group by o.item_id`,
      { rootId },
    );
    return new Map(rows.map((row) => [row.item_id, row.opened_at]));
  }
}
