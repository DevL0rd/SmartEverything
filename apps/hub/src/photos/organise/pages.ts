import type { LibraryBucket, LibraryPage, LibraryScope } from '@smarteverything/domain';
import { z } from 'zod';
import { lockedFolderSql, type DriveActor } from '../../drive/access';
import type { StoreContext } from '../../store/context';
import {
  FLAGS_SQL,
  LIBRARY_PAGE_SIZE,
  PHOTO_FROM,
  afterCursor,
  monthWindow,
  pageOf,
  type PageQuery,
  type Statement,
} from '../library';
import { AlbumScopes, LOCAL_MONTH, narrowing } from '../library-scope';
import { PHOTO_VISIBLE, archivedSql } from '../membership';

const NUMBER = z.number().nullable();

const BUCKET_ROW = z.strictObject({ month: z.string(), count: z.int().positive() });

const PAGE_ROW = z.strictObject({
  id: z.string(),
  rev: z.number(),
  width: NUMBER,
  height: NUMBER,
  orientation: NUMBER,
  taken_at: z.string(),
  tz_offset_min: NUMBER,
  duration_ms: NUMBER,
  flags: z.number(),
});

const SHOWN_AS_COVER = `not exists (select 1 from drive_media c where c.motion_clip_id = i.id)
  and (m.stack_id is null or s.cover_item_id = i.id
    or (s.cover_item_id is null
      and i.id = (select min(x.item_id) from drive_media x where x.stack_id = m.stack_id)))`;

const MEDIA = `i.kind in ('image', 'video') and i.taken_at is not null and ${SHOWN_AS_COVER}`;

export const ARCHIVED_SHOWN = `${MEDIA} and ${PHOTO_VISIBLE} and ${archivedSql()}`;

export const LOCKED_SHOWN = `${MEDIA} and r.scope = 'person' and r.owner_profile_id = $profile
  and ${lockedFolderSql()}`;

export class OrganisePages {
  private readonly albums: AlbumScopes;

  constructor(
    private readonly context: StoreContext,
    timeZone: () => string,
  ) {
    this.albums = new AlbumScopes(context, timeZone);
  }

  archiveBuckets(actor: DriveActor, scope: LibraryScope): LibraryBucket[] {
    return this.buckets(ARCHIVED_SHOWN, actor, scope);
  }

  archivePage(actor: DriveActor, month: string, query: PageQuery): LibraryPage {
    return this.page(ARCHIVED_SHOWN, actor, month, query);
  }

  lockedBuckets(actor: DriveActor, scope: LibraryScope): LibraryBucket[] {
    return this.buckets(LOCKED_SHOWN, actor, scope);
  }

  lockedPage(actor: DriveActor, month: string, query: PageQuery): LibraryPage {
    return this.page(LOCKED_SHOWN, actor, month, query);
  }

  private buckets(shown: string, actor: DriveActor, scope: LibraryScope): LibraryBucket[] {
    const filter = narrowing(actor, scope, this.albums);
    const statement: Statement = {
      text: `select ${LOCAL_MONTH} as month, count(*) as count
        from ${PHOTO_FROM}
        where ${shown}${filter.text}
        group by month order by month desc`,
      parameters: { profile: actor.profileId, ...filter.parameters },
    };
    return this.context.sql
      .all(BUCKET_ROW, statement.text, statement.parameters)
      .map((row) => ({ month: row.month, count: row.count }));
  }

  private page(shown: string, actor: DriveActor, month: string, query: PageQuery): LibraryPage {
    const filter = narrowing(actor, query, this.albums);
    const window = monthWindow(month);
    const after = afterCursor(query.cursor, '<');
    const rows = this.context.sql.all(
      PAGE_ROW,
      `select i.id, i.rev, i.width, i.height, i.orientation, i.taken_at, m.tz_offset_min,
          i.duration_ms, ${FLAGS_SQL} as flags
        from ${PHOTO_FROM}
        where ${shown}${filter.text}
          and i.taken_at >= $monthFrom and i.taken_at < $monthTo
          and ${LOCAL_MONTH} = $month${after.text}
        order by i.taken_at desc, i.id desc
        limit $limit`,
      {
        profile: actor.profileId,
        ...filter.parameters,
        ...after.parameters,
        monthFrom: window.from,
        monthTo: window.to,
        month,
        limit: LIBRARY_PAGE_SIZE + 1,
      },
    );
    return pageOf(month, rows);
  }
}
