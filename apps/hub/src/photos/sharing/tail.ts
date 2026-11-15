import { z } from 'zod';
import type { PhotoAlbumActivityRow } from '../../store/repositories/photo-album-activity';
import type { Store } from '../../store/store';

export type TailStore = Pick<Store, 'context' | 'photoAlbumActivity'>;

const ID = z.strictObject({ id: z.string(), created_at: z.string() });

export class ActivityTail {
  private at: string;
  private handled = new Set<string>();

  constructor(private readonly store: TailStore) {
    this.at = store.context.now();
    this.drain();
  }

  drain(): readonly PhotoAlbumActivityRow[] {
    const rows = this.store.context.sql
      .all(
        ID,
        `select id, created_at from photo_album_activity
          where created_at >= $at order by created_at, id`,
        { at: this.at },
      )
      .filter((row) => !(row.created_at === this.at && this.handled.has(row.id)));
    const last = rows.at(-1);
    if (last === undefined) return [];
    this.at = last.created_at;
    this.handled = new Set(
      rows.filter((row) => row.created_at === last.created_at).map((row) => row.id),
    );
    return rows.flatMap((row) => {
      const found = this.store.photoAlbumActivity.find(row.id);
      return found === undefined ? [] : [found];
    });
  }
}
