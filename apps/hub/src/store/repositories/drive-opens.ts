import type { StoreContext } from '../context';

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
}
