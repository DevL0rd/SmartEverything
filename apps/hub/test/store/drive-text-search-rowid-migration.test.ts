import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { z } from 'zod';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DRIVE_TEXT_SEARCH_ROWID_MIGRATION } from '../../src/store/migrations/drive-text-search-rowid';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-16T00:00:00.000Z';

let database: DatabaseSync;
let sql: Sql;

const MATCHES = z.object({ item_id: z.string(), rowid: z.number(), text_rowid: z.number() });

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
  const log = testLogger();
  const context = new StoreContext(new Sql(database), new ChangeFeed(log), () => new Date(NOW));
  sql = context.sql;
  migrate(
    sql,
    MIGRATIONS.filter((migration) => migration.version < DRIVE_TEXT_SEARCH_ROWID_MIGRATION.version),
    NOW,
    log,
  );
  database.exec('pragma foreign_keys = off');
  for (const [itemId, body] of [
    ['item-b', 'banana words'],
    ['item-a', 'apple words'],
  ] as const) {
    database
      .prepare(
        `insert into drive_item_text (item_id, rev, source, state, reason, chars, extracted_at)
          values (?, 1, 'document', 'ok', null, ?, ?)`,
      )
      .run(itemId, body.length, NOW);
  }
  database
    .prepare("insert into drive_item_text_search (item_id, body) values ('item-a', 'apple words')")
    .run();
  database
    .prepare(
      "insert into drive_item_text_search (item_id, body) values ('item-b', 'banana words')",
    )
    .run();
});

afterEach(() => {
  database.close();
});

it('keys the searchable text by the text row so one item is found without a scan', () => {
  for (const statement of DRIVE_TEXT_SEARCH_ROWID_MIGRATION.statements) database.exec(statement);
  const rows = sql.all(
    MATCHES,
    `select s.item_id as item_id, s.rowid as rowid, t.rowid as text_rowid
      from drive_item_text_search s join drive_item_text t on t.item_id = s.item_id
      where drive_item_text_search match 'words' order by s.item_id`,
  );
  expect(rows.map((row) => row.item_id)).toEqual(['item-a', 'item-b']);
  for (const row of rows) expect(row.rowid).toBe(row.text_rowid);
  database.prepare("delete from drive_item_text where item_id = 'item-a'").run();
  expect(
    sql.all(
      z.object({ item_id: z.string() }),
      "select item_id from drive_item_text_search where drive_item_text_search match 'words'",
    ),
  ).toEqual([{ item_id: 'item-b' }]);
});
