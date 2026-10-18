import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-10-17T09:00:00.000Z';
const BEFORE = 100;

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-transcript-sources-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function open(name: string, version: number): DatabaseSync {
  const database = new DatabaseSync(join(directory, name), { enableForeignKeyConstraints: true });
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version <= version),
    NOW,
    testLogger(),
  );
  return database;
}

function session(database: DatabaseSync, id: string, source: string): void {
  database
    .prepare(
      "insert into transcript_sessions (id, source, source_id, title, started_at) values (?, ?, 'one', 'Title', ?)",
    )
    .run(id, source, NOW);
}

describe('transcripts from phones and computers', () => {
  it('keeps every session and line and then accepts the new sources', () => {
    const old = open('old.db', BEFORE);
    session(old, 's1', 'camera');
    old
      .prepare(
        "insert into transcript_lines (session_id, at, speaker, text, bot) values ('s1', ?, 'Someone', 'hello', 0)",
      )
      .run(NOW);
    expect(() => {
      session(old, 's2', 'phone');
    }).toThrow(/CHECK/);
    old.close();

    const database = open('old.db', 1000);
    session(database, 's2', 'phone');
    session(database, 's3', 'computer');
    const lines = database
      .prepare("select count(*) as count from transcript_lines where session_id = 's1'")
      .get();
    expect(lines).toEqual({ count: 1 });
    expect(database.prepare('pragma foreign_key_check').all()).toStrictEqual([]);
    expect(() => {
      session(database, 's4', 'watch');
    }).toThrow(/CHECK/);
    database.close();
  });

  it('finds the search triggers still working after the rebuild', () => {
    const database = open('fresh.db', 1000);
    session(database, 's1', 'computer');
    database
      .prepare(
        "insert into transcript_lines (session_id, at, speaker, text, bot) values ('s1', ?, 'Someone', 'findable words', 0)",
      )
      .run(NOW);
    const found = database
      .prepare(
        "select count(*) as count from transcript_lines_search where transcript_lines_search match 'findable'",
      )
      .get();
    expect(found).toEqual({ count: 1 });
    database.close();
  });
});
