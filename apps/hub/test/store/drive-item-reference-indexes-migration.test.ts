import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { z } from 'zod';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DRIVE_ITEM_REFERENCE_INDEXES_MIGRATION } from '../../src/store/migrations/drive-item-reference-indexes';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-17T00:00:00.000Z';
const NAME = z.object({ name: z.string() });
const REFERENCE = z.object({ table: z.string(), from: z.string() });
const COLUMN = z.object({ seqno: z.number(), name: z.string().nullable() });
const KEY = z.object({ name: z.string(), pk: z.number() });

let database: DatabaseSync;
let context: StoreContext;

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
  const log = testLogger();
  context = new StoreContext(new Sql(database), new ChangeFeed(log), () => new Date(NOW));
  migrate(context.sql, MIGRATIONS, NOW, log);
});

afterEach(() => {
  database.close();
});

function leadingColumns(table: string): Set<string> {
  const sql = context.sql;
  const leading = new Set(
    sql
      .all(KEY, 'select name, pk from pragma_table_info(:table)', { table })
      .filter((column) => column.pk === 1)
      .map((column) => column.name),
  );
  for (const index of sql.all(NAME, 'select name from pragma_index_list(:table)', { table })) {
    const first = sql
      .all(COLUMN, 'select seqno, name from pragma_index_info(:index)', { index: index.name })
      .find((column) => column.seqno === 0);
    if (first !== undefined && first.name !== null) leading.add(first.name);
  }
  return leading;
}

it('indexes every column that references a Drive item so an item delete never scans a table', () => {
  const sql = context.sql;
  const tables = sql.all(NAME, "select name from sqlite_master where type = 'table'");
  const unindexed = tables.flatMap(({ name }) => {
    const leading = leadingColumns(name);
    return sql
      .all(REFERENCE, 'select "table", "from" from pragma_foreign_key_list(:table)', {
        table: name,
      })
      .filter((reference) => reference.table === 'drive_items' && !leading.has(reference.from))
      .map((reference) => `${name}.${reference.from}`);
  });
  expect(unindexed).toEqual([]);
});

it('adds the four reference indexes', () => {
  const names = context.sql
    .all(NAME, "select name from sqlite_master where type = 'index'")
    .filter((row) =>
      [
        'drive_albums_by_cover',
        'drive_conflicts_by_item',
        'drive_conflicts_by_conflict_item',
        'photo_partner_delivered_by_item',
      ].includes(row.name),
    )
    .map((row) => row.name)
    .sort();
  expect(names).toEqual([
    'drive_albums_by_cover',
    'drive_conflicts_by_conflict_item',
    'drive_conflicts_by_item',
    'photo_partner_delivered_by_item',
  ]);
  expect(DRIVE_ITEM_REFERENCE_INDEXES_MIGRATION.version).toBe(229);
});
