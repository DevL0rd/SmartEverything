import { DRIVE_PLACEMENT, type DrivePlacement } from '@smarteverything/domain';
import { z } from 'zod';
import type { ClientSql } from './sql.js';

const PLACEMENT_ROW = z.object({ body: z.string() }).strict().readonly();

export class PlacementsRepository {
  constructor(private readonly sql: ClientSql) {}

  all(): readonly DrivePlacement[] {
    return this.sql
      .all(PLACEMENT_ROW, 'select body from placements order by position')
      .map((row) => DRIVE_PLACEMENT.parse(JSON.parse(row.body)));
  }

  replaceAll(placements: readonly DrivePlacement[]): void {
    this.sql.transaction(() => {
      this.sql.run('delete from placements');
      placements.forEach((placement, position) => {
        this.sql.run('insert into placements (id, position, body) values (?, ?, ?)', [
          placement.id,
          position,
          JSON.stringify(DRIVE_PLACEMENT.parse(placement)),
        ]);
      });
    });
  }

  clear(): void {
    this.sql.run('delete from placements');
  }
}
