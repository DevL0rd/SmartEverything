import { z } from 'zod';
import type { ClientSql } from './sql.js';

const PATH_ROW = z.object({ path: z.string() }).strict().readonly();

export class ExclusionsRepository {
  constructor(private readonly sql: ClientSql) {}

  list(placementId: string): readonly string[] {
    return this.sql
      .all(PATH_ROW, 'select path from exclusions where placement_id = ? order by path', [
        placementId,
      ])
      .map((row) => row.path);
  }

  replace(placementId: string, paths: readonly string[]): void {
    this.sql.transaction(() => {
      this.sql.run('delete from exclusions where placement_id = ?', [placementId]);
      for (const path of new Set(paths)) {
        this.sql.run('insert into exclusions (placement_id, path) values (?, ?)', [
          placementId,
          path,
        ]);
      }
    });
  }
}

export class PinsRepository {
  constructor(private readonly sql: ClientSql) {}

  list(placementId: string): readonly string[] {
    return this.sql
      .all(PATH_ROW, 'select path from pins where placement_id = ? order by path', [placementId])
      .map((row) => row.path);
  }

  set(placementId: string, path: string, pinned: boolean): void {
    this.sql.transaction(() => {
      if (pinned) {
        this.sql.run('insert into pins (placement_id, path) values (?, ?) on conflict do nothing', [
          placementId,
          path,
        ]);
      } else {
        this.sql.run('delete from pins where placement_id = ? and path = ?', [placementId, path]);
      }
      this.sql.run(
        `update files set pinned = exists (select 1 from pins where pins.placement_id = files.placement_id
           and (pins.path = files.rel_path or substr(files.rel_path, 1, length(pins.path) + 1) = pins.path || '/'))
         where placement_id = ? and (rel_path = ? or substr(rel_path, 1, length(?) + 1) = ? || '/')`,
        [placementId, path, path, path],
      );
    });
  }
}
