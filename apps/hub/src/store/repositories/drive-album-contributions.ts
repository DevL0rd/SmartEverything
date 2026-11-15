import { randomUUID } from 'node:crypto';
import { ALBUM_MEMBER_ROLES, type AlbumMemberRole } from '@smarteverything/domain';
import { z } from 'zod';
import { albumExposableSql } from '../album-exposure';
import type { StoreContext } from '../context';
import { inList } from '../sql';

export class AlbumContributions {
  constructor(private readonly context: StoreContext) {}

  memberRole(id: string, profileId: string): AlbumMemberRole | null {
    return (
      this.context.sql.get(
        z.strictObject({ role: z.enum(ALBUM_MEMBER_ROLES) }),
        'select role from photo_album_members where album_id = $id and profile_id = $profileId',
        { id, profileId },
      )?.role ?? null
    );
  }

  exposes(id: string, itemId: string): boolean {
    return (
      this.context.sql.get(
        z.strictObject({ shown: z.number() }),
        `select 1 as shown from drive_album_items ai
          join drive_albums al on al.id = ai.album_id
          join drive_items i on i.id = ai.item_id
          join drive_roots r on r.id = i.root_id
          where ai.album_id = $id and ai.item_id = $itemId and ${albumExposableSql()}`,
        { id, itemId },
      ) !== undefined
    );
  }

  unexposedCount(id: string): number {
    return (
      this.context.sql.get(
        z.strictObject({ total: z.number() }),
        `select count(*) as total from drive_album_items ai
          join drive_albums al on al.id = ai.album_id
          join drive_items i on i.id = ai.item_id
          join drive_roots r on r.id = i.root_id
          where ai.album_id = $id and not ${albumExposableSql()}`,
        { id },
      )?.total ?? 0
    );
  }

  hasMembers(id: string): boolean {
    return (
      this.context.sql.get(
        z.strictObject({ shared: z.number() }),
        'select exists (select 1 from photo_album_members where album_id = $id) as shared',
        { id },
      )?.shared === 1
    );
  }

  contributedBy(id: string, itemIds: readonly string[]): ReadonlyMap<string, string | null> {
    const filter = inList('item_id', 'ids', itemIds);
    return new Map(
      this.context.sql
        .all(
          z.strictObject({ item_id: z.string(), added_by: z.string().nullable() }),
          `select item_id, added_by from drive_album_items
            where album_id = $id and ${filter.text}`,
          { id, ...filter.parameters },
        )
        .map((row) => [row.item_id, row.added_by]),
    );
  }

  record(id: string, itemId: string): boolean {
    return (
      this.context.sql.run(
        'record the photo added to the shared album',
        `insert into photo_album_activity (id, album_id, item_id, profile_id, kind, text, created_at)
          select $activityId, $id, $itemId, added_by, 'added', null, $now
            from drive_album_items where album_id = $id and item_id = $itemId
              and added_by is not null
              and exists (select 1 from photo_album_members m where m.album_id = $id)`,
        { activityId: randomUUID(), id, itemId, now: this.context.now() },
      ) > 0
    );
  }
}
