import { ALBUM_ACTIVITY_KINDS, type AlbumActivityKind } from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../context';

const COLUMNS = 'id, album_id, item_id, profile_id, kind, text, created_at';

const ACTIVITY_COLUMNS = z.strictObject({
  id: z.string(),
  album_id: z.string(),
  item_id: z.string().nullable(),
  profile_id: z.string(),
  kind: z.enum(ALBUM_ACTIVITY_KINDS),
  text: z.string().nullable(),
  created_at: z.string(),
});

export interface PhotoAlbumActivityRow {
  readonly id: string;
  readonly albumId: string;
  readonly itemId: string | null;
  readonly profileId: string;
  readonly kind: AlbumActivityKind;
  readonly text: string | null;
  readonly createdAt: string;
}

const STORED_ACTIVITY = ACTIVITY_COLUMNS.transform((row): PhotoAlbumActivityRow => ({
  id: row.id,
  albumId: row.album_id,
  itemId: row.item_id,
  profileId: row.profile_id,
  kind: row.kind,
  text: row.text,
  createdAt: row.created_at,
}));

export interface PhotoActivityDraft {
  readonly id: string;
  readonly albumId: string;
  readonly itemId: string | null;
  readonly profileId: string;
  readonly kind: AlbumActivityKind;
  readonly text: string | null;
}

export interface PhotoActivityCursor {
  readonly createdAt: string;
  readonly id: string;
}

export interface PhotoActivityWindow {
  readonly activity: readonly PhotoAlbumActivityRow[];
  readonly next: PhotoActivityCursor | null;
}

export class PhotoAlbumActivityRepository {
  constructor(private readonly context: StoreContext) {}

  find(id: string): PhotoAlbumActivityRow | undefined {
    return this.context.sql.get(
      STORED_ACTIVITY,
      `select ${COLUMNS} from photo_album_activity where id = $id`,
      { id },
    );
  }

  add(draft: PhotoActivityDraft): PhotoAlbumActivityRow | undefined {
    return this.context.write(() => {
      const changed = this.context.sql.run(
        'record the album activity',
        `insert into photo_album_activity (${COLUMNS})
          values ($id, $albumId, $itemId, $profileId, $kind, $text, $now)
          on conflict do nothing`,
        {
          id: draft.id,
          albumId: draft.albumId,
          itemId: draft.itemId,
          profileId: draft.profileId,
          kind: draft.kind,
          text: draft.text,
          now: this.context.now(),
        },
      );
      return changed === 0 ? undefined : this.find(draft.id);
    });
  }

  remove(id: string): boolean {
    return this.context.write(
      () =>
        this.context.sql.run(
          'remove the album activity',
          'delete from photo_album_activity where id = $id',
          { id },
        ) > 0,
    );
  }

  unlike(albumId: string, itemId: string | null, profileId: string): boolean {
    return this.context.write(
      () =>
        this.context.sql.run(
          'remove the like',
          `delete from photo_album_activity
            where album_id = $albumId and coalesce(item_id, '') = coalesce($itemId, '')
              and profile_id = $profileId and kind = 'like'`,
          { albumId, itemId, profileId },
        ) > 0,
    );
  }

  page(albumId: string, after: PhotoActivityCursor | null, limit: number): PhotoActivityWindow {
    const rows = this.context.sql.all(
      STORED_ACTIVITY,
      `select ${COLUMNS} from photo_album_activity
        where album_id = $albumId
          ${after === null ? '' : 'and (created_at, id) < ($afterAt, $afterId)'}
        order by created_at desc, id desc limit $limit`,
      {
        albumId,
        limit: limit + 1,
        ...(after === null ? {} : { afterAt: after.createdAt, afterId: after.id }),
      },
    );
    const shown = rows.slice(0, limit);
    const last = shown.at(-1);
    return {
      activity: shown,
      next:
        rows.length > limit && last !== undefined
          ? { createdAt: last.createdAt, id: last.id }
          : null,
    };
  }

  forItem(albumId: string, itemId: string): PhotoAlbumActivityRow[] {
    return this.context.sql.all(
      STORED_ACTIVITY,
      `select ${COLUMNS} from photo_album_activity
        where album_id = $albumId and item_id = $itemId order by created_at, id`,
      { albumId, itemId },
    );
  }

  removeForProfile(albumId: string, profileId: string): number {
    return this.context.write(() =>
      this.context.sql.run(
        'remove the album activity of a person',
        'delete from photo_album_activity where album_id = $albumId and profile_id = $profileId',
        { albumId, profileId },
      ),
    );
  }
}
