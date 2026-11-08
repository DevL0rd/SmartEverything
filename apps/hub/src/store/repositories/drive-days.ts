import { z } from 'zod';
import type { StoreContext } from '../context';

const DAY_COLUMNS = z.strictObject({
  day: z.string(),
  root_id: z.string(),
  items: z.number(),
  bytes: z.number(),
  added: z.number(),
  removed: z.number(),
});

const TOTAL_COLUMNS = z.strictObject({
  day: z.string(),
  items: z.number(),
  bytes: z.number(),
  added: z.number(),
  removed: z.number(),
});

const SPAN = z.object({ first: z.string().nullable(), latest: z.string().nullable() });

export interface DriveDay {
  readonly day: string;
  readonly rootId: string;
  readonly items: number;
  readonly bytes: number;
  readonly added: number;
  readonly removed: number;
}

export interface DriveDayTotal {
  readonly day: string;
  readonly items: number;
  readonly bytes: number;
  readonly added: number;
  readonly removed: number;
}

export interface DriveDayRecord {
  readonly rootId: string;
  readonly day: string;
  readonly items: number;
  readonly bytes: number;
  readonly added: number;
  readonly removed: number;
}

export interface DriveDaySpan {
  readonly first: string;
  readonly latest: string;
}

export class DriveDaysRepository {
  constructor(private readonly context: StoreContext) {}

  record(entry: DriveDayRecord): void {
    this.context.write(() => {
      this.context.sql.run(
        'record the drive day',
        `insert into drive_days (day, root_id, items, bytes, added, removed)
          values ($day, $rootId, $items, $bytes, $added, $removed)
          on conflict (root_id, day) do update set
            items = excluded.items,
            bytes = excluded.bytes,
            added = added + excluded.added,
            removed = removed + excluded.removed`,
        { ...entry },
      );
    });
  }

  range(rootId: string, from: string, to: string): DriveDay[] {
    return this.context.sql
      .all(
        DAY_COLUMNS,
        `select day, root_id, items, bytes, added, removed from drive_days
          where root_id = $rootId and day between $from and $to order by day`,
        { rootId, from, to },
      )
      .map((row) => ({
        day: row.day,
        rootId: row.root_id,
        items: row.items,
        bytes: row.bytes,
        added: row.added,
        removed: row.removed,
      }));
  }

  totals(from: string, to: string): DriveDayTotal[] {
    return this.context.sql.all(
      TOTAL_COLUMNS,
      `select day, sum(items) as items, sum(bytes) as bytes, sum(added) as added,
          sum(removed) as removed
        from drive_days where day between $from and $to group by day order by day`,
      { from, to },
    );
  }

  span(): DriveDaySpan | null {
    const row = this.context.sql.get(
      SPAN,
      'select min(day) as first, max(day) as latest from drive_days',
    );
    const first = row?.first ?? null;
    const latest = row?.latest ?? null;
    return first === null || latest === null ? null : { first, latest };
  }
}
