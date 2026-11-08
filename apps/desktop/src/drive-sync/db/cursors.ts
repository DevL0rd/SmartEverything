import { z } from 'zod';
import { INTEGER, type ClientSql } from './sql.js';

const CURSOR_ROW = z
  .object({ root_id: z.string(), index_id: z.string(), last_seq: INTEGER })
  .strict()
  .readonly();

export interface Cursor {
  readonly rootId: string;
  readonly indexId: string;
  readonly lastSeq: number;
}

export class CursorsRepository {
  constructor(private readonly sql: ClientSql) {}

  get(rootId: string): Cursor | undefined {
    const row = this.sql.get(
      CURSOR_ROW,
      'select root_id, index_id, last_seq from cursors where root_id = ?',
      [rootId],
    );
    return row === undefined
      ? undefined
      : { rootId: row.root_id, indexId: row.index_id, lastSeq: row.last_seq };
  }

  set(cursor: Cursor): void {
    this.sql.run(
      `insert into cursors (root_id, index_id, last_seq) values (?, ?, ?)
       on conflict (root_id) do update set index_id = excluded.index_id, last_seq = excluded.last_seq`,
      [cursor.rootId, cursor.indexId, cursor.lastSeq],
    );
  }

  remove(rootId: string): void {
    this.sql.run('delete from cursors where root_id = ?', [rootId]);
  }
}
