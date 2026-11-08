import { z } from 'zod';
import type { ClientSql } from './sql.js';

const PATH_ROW = z.object({ path: z.string() }).strict().readonly();

export class SelectionsRepository {
  constructor(private readonly sql: ClientSql) {}

  list(rootId: string): readonly string[] {
    return this.sql
      .all(PATH_ROW, 'select path from selections where root_id = ? order by path', [rootId])
      .map((row) => row.path);
  }

  replace(rootId: string, paths: readonly string[]): void {
    this.sql.transaction(() => {
      this.sql.run('delete from selections where root_id = ?', [rootId]);
      for (const path of new Set(paths)) {
        this.sql.run('insert into selections (root_id, path) values (?, ?)', [rootId, path]);
      }
    });
  }
}

export class PinsRepository {
  constructor(private readonly sql: ClientSql) {}

  list(rootId: string): readonly string[] {
    return this.sql
      .all(PATH_ROW, 'select path from pins where root_id = ? order by path', [rootId])
      .map((row) => row.path);
  }

  set(rootId: string, path: string, pinned: boolean): void {
    this.sql.transaction(() => {
      if (pinned) {
        this.sql.run('insert into pins (root_id, path) values (?, ?) on conflict do nothing', [
          rootId,
          path,
        ]);
      } else {
        this.sql.run('delete from pins where root_id = ? and path = ?', [rootId, path]);
      }
      this.sql.run(
        `update files set pinned = exists (select 1 from pins where pins.root_id = files.root_id
           and (pins.path = files.rel_path or substr(files.rel_path, 1, length(pins.path) + 1) = pins.path || '/'))
         where root_id = ? and (rel_path = ? or substr(rel_path, 1, length(?) + 1) = ? || '/')`,
        [rootId, path, path, path],
      );
    });
  }
}
