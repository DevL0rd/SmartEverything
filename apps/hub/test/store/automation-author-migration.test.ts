import { mkdtemp, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-10-18T09:00:00.000Z';
const VERSION =
  MIGRATIONS.find((migration) => migration.name === 'automation_author')?.version ?? 0;
const ID = '5a000000-0000-4000-8000-000000000001';
const ROWS = z.array(z.record(z.string(), z.unknown()));

let directory: string;
let database: DatabaseSync;

beforeEach(async () => {
  captureLogs();
  directory = await mkdtemp(join(tmpdir(), 'hub-automation-author-'));
  database = new DatabaseSync(join(directory, 'hub.db'), { enableForeignKeyConstraints: true });
});

afterEach(async () => {
  database.close();
  await rm(directory, { recursive: true, force: true });
});

function upTo(version: number): void {
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version <= version),
    NOW,
    testLogger(),
  );
}

describe('automation author migration', () => {
  it('keeps every existing automation and leaves its maker unrecorded', () => {
    upTo(VERSION - 1);
    database
      .prepare(
        'insert into automations (id, name, enabled, definition, created_at, updated_at) values (?, \'Old\', 1, \'{"when":[],"steps":[]}\', ?, ?)',
      )
      .run(ID, NOW, NOW);
    upTo(VERSION);
    const [row] = ROWS.parse(
      database.prepare('select name, author from automations where id = ?').all(ID),
    );
    expect(row).toStrictEqual({ name: 'Old', author: null });
  });

  it('refuses an author that is not a JSON object', () => {
    upTo(VERSION);
    expect(() =>
      database
        .prepare(
          "insert into automations (id, name, enabled, definition, author, created_at, updated_at) values (?, 'Bad', 1, '{}', '[1]', ?, ?)",
        )
        .run(ID, NOW, NOW),
    ).toThrow();
  });
});
