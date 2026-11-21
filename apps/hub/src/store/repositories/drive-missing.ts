import { z } from 'zod';
import { found, type StoreContext } from '../context';
import { DriveTrashRows, MISSING_LEDGER, type StashedRow } from './drive-trash-rows';

const ITEMS = 'drive_items';

const INODES = 'drive_inodes';

const EXPIRING = z.strictObject({ expiring: z.union([z.literal(0), z.literal(1)]) });

const MISSING_COLUMNS = z
  .strictObject({
    item_id: z.string().min(1),
    rel_path: z.string().min(1),
    bytes: z.int().nonnegative(),
    sha256: z.string().nullable(),
    missing_at: z.string().min(1),
  })
  .transform((row): MissingItem => ({
    itemId: row.item_id,
    relPath: row.rel_path,
    bytes: row.bytes,
    sha256: row.sha256,
    missingAt: row.missing_at,
  }));

export interface MissingItem {
  readonly itemId: string;
  readonly relPath: string;
  readonly bytes: number;
  readonly sha256: string | null;
  readonly missingAt: string;
}

export interface MissingRecord {
  readonly itemId: string;
  readonly rootId: string;
  readonly relPath: string;
  readonly bytes: number;
  readonly sha256: string | null;
  readonly missingAt: string;
  readonly purgeAt: string;
}

export interface ReclaimPlace {
  readonly parentId: string | null;
  readonly relPath: string;
  readonly name: string;
  readonly modifiedAt: string | null;
  readonly mtimeNs: string;
  readonly dev: string;
  readonly ino: string;
}

function placed(row: StashedRow, itemId: string, place: ReclaimPlace): StashedRow {
  if (row.table === ITEMS && row.values['id'] === itemId) {
    return {
      table: row.table,
      values: {
        ...row.values,
        parent_id: place.parentId,
        rel_path: place.relPath,
        name: place.name,
        ...(place.modifiedAt === null ? {} : { modified_at: place.modifiedAt }),
        dev: place.dev,
        ino: place.ino,
      },
    };
  }
  if (row.table === INODES) {
    return { table: row.table, values: { ...row.values, mtime_ns: place.mtimeNs } };
  }
  return row;
}

export class DriveMissingRepository {
  private readonly rows: DriveTrashRows;

  constructor(private readonly context: StoreContext) {
    this.rows = new DriveTrashRows(context, MISSING_LEDGER);
  }

  record(missing: MissingRecord): void {
    this.context.write(() => {
      this.context.sql.run(
        'remember the missing drive item',
        `insert into drive_missing (item_id, root_id, rel_path, bytes, sha256, missing_at, purge_at)
         values ($itemId, $rootId, $relPath, $bytes, $sha256, $missingAt, $purgeAt)`,
        { ...missing },
      );
      this.rows.stash(missing.itemId);
    });
  }

  ofRoot(rootId: string): MissingItem[] {
    return this.context.sql.all(
      MISSING_COLUMNS,
      `select item_id, rel_path, bytes, sha256, missing_at from drive_missing
       where root_id = $rootId order by missing_at desc, item_id`,
      { rootId },
    );
  }

  expiring(rootId: string, at: string): boolean {
    const row = this.context.sql.get(
      EXPIRING,
      `select exists (select 1 from drive_missing where root_id = $rootId and purge_at <= $at)
         as expiring`,
      { rootId, at },
    );
    return found(row, 'drive missing expiry', rootId).expiring === 1;
  }

  expire(rootId: string, at: string): number {
    return this.context.sql.run(
      'forget the missing drive items past their keep time',
      'delete from drive_missing where root_id = $rootId and purge_at <= $at',
      { rootId, at },
    );
  }

  reclaim(itemId: string, place: ReclaimPlace): void {
    this.context.write(() => {
      const rows = this.rows.rows(itemId);
      if (!rows.some((row) => row.table === ITEMS && row.values['id'] === itemId)) {
        throw new Error(`The missing item ${itemId} has no stashed row.`);
      }
      this.context.sql.run(
        'take the missing drive item back',
        'delete from drive_missing where item_id = $itemId',
        { itemId },
      );
      this.rows.restore(rows.map((row) => placed(row, itemId, place)));
    });
  }
}
