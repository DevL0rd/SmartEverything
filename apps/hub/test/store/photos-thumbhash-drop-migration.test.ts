import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { PHOTOS_THUMBHASH_DROP_MIGRATION } from '../../src/store/migrations/photos-thumbhash-drop';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-15T00:00:00.000Z';
const COLUMN = z.object({ name: z.string() });

let database: DatabaseSync;

function columns(): readonly string[] {
  return database
    .prepare("select name from pragma_table_info('drive_media')")
    .all()
    .map((row) => COLUMN.parse(row).name);
}

function upTo(version: number): void {
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version <= version),
    NOW,
    testLogger(),
  );
}

beforeEach(() => {
  database = new DatabaseSync(':memory:');
});

afterEach(() => {
  database.close();
});

it('drops the placeholder column from the photo media rows and keeps the rest', () => {
  upTo(PHOTOS_THUMBHASH_DROP_MIGRATION.version - 1);
  expect(columns()).toContain('thumbhash');

  upTo(PHOTOS_THUMBHASH_DROP_MIGRATION.version);

  expect(columns()).not.toContain('thumbhash');
  expect(columns()).toEqual(expect.arrayContaining(['item_id', 'preview_state', 'poster_state']));
});
