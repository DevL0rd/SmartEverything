import { z } from 'zod';
import { INTEGER, type ClientSql } from './sql.js';

const CURSOR_ROW = z
  .object({ placement_id: z.string(), index_id: z.string(), last_seq: INTEGER })
  .strict()
  .readonly();

export interface Cursor {
  readonly placementId: string;
  readonly indexId: string;
  readonly lastSeq: number;
}

export class CursorsRepository {
  constructor(private readonly sql: ClientSql) {}

  get(placementId: string): Cursor | undefined {
    const row = this.sql.get(
      CURSOR_ROW,
      'select placement_id, index_id, last_seq from cursors where placement_id = ?',
      [placementId],
    );
    return row === undefined
      ? undefined
      : { placementId: row.placement_id, indexId: row.index_id, lastSeq: row.last_seq };
  }

  set(cursor: Cursor): void {
    this.sql.run(
      `insert into cursors (placement_id, index_id, last_seq) values (?, ?, ?)
       on conflict (placement_id) do update set index_id = excluded.index_id, last_seq = excluded.last_seq`,
      [cursor.placementId, cursor.indexId, cursor.lastSeq],
    );
  }

  remove(placementId: string): void {
    this.sql.run('delete from cursors where placement_id = ?', [placementId]);
  }
}
