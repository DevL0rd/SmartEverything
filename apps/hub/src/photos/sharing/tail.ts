import { z } from 'zod';
import type { PhotoAlbumActivityRow } from '../../store/repositories/photo-album-activity';
import type { Store } from '../../store/store';

export type TailStore = Pick<Store, 'context' | 'photoAlbumActivity'>;

const ID = z.strictObject({ id: z.string(), created_at: z.string() });

export interface ActivityCursor {
  readonly at: string;
  readonly handled: readonly string[];
}

export interface DrainedActivity {
  readonly cursor: ActivityCursor;
  readonly rows: PhotoAlbumActivityRow[];
}

export function drainActivity(store: TailStore, cursor: ActivityCursor): DrainedActivity {
  const handled = new Set(cursor.handled);
  const rows = store.context.sql
    .all(
      ID,
      `select id, created_at from photo_album_activity
        where created_at >= $at order by created_at, id`,
      { at: cursor.at },
    )
    .filter((row) => !(row.created_at === cursor.at && handled.has(row.id)));
  const last = rows.at(-1);
  if (last === undefined) return { cursor, rows: [] };
  return {
    cursor: {
      at: last.created_at,
      handled: rows.filter((row) => row.created_at === last.created_at).map((row) => row.id),
    },
    rows: rows.flatMap((row) => {
      const found = store.photoAlbumActivity.find(row.id);
      return found === undefined ? [] : [found];
    }),
  };
}
