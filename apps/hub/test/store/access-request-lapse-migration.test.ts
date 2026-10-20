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
  MIGRATIONS.find((migration) => migration.name === 'access_request_lapse')?.version ?? 0;
const ROWS = z.array(z.record(z.string(), z.unknown()));

let directory: string;
let database: DatabaseSync;

beforeEach(async () => {
  captureLogs();
  directory = await mkdtemp(join(tmpdir(), 'hub-access-lapse-'));
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

function rows(sql: string): Record<string, unknown>[] {
  return ROWS.parse(database.prepare(sql).all());
}

describe('access request lapse migration', () => {
  it('keeps every request from the previous shape and adds the open end', () => {
    upTo(VERSION - 1);
    const profile = z.string().parse(rows('select id from profiles')[0]?.['id']);
    const insert = database.prepare(
      `insert into access_requests (id, profile_id, kind, target, note, status, until, requested_at, decided_at, decided_by)
       values (?, ?, 'area', 'settings', '', ?, ?, ?, ?, ?)`,
    );
    insert.run('r-pending', profile, 'pending', null, NOW, null, null);
    insert.run('r-timed', profile, 'approved', '2026-10-18T12:00:00.000Z', NOW, NOW, 'c1');
    insert.run('r-denied', profile, 'denied', null, NOW, NOW, 'c1');
    upTo(VERSION);
    expect(
      rows('select id, status, until, lapsed_at from access_requests order by id'),
    ).toStrictEqual([
      { id: 'r-denied', status: 'denied', until: null, lapsed_at: null },
      { id: 'r-pending', status: 'pending', until: null, lapsed_at: null },
      { id: 'r-timed', status: 'approved', until: '2026-10-18T12:00:00.000Z', lapsed_at: null },
    ]);
    expect(
      rows("select name from sqlite_master where name = 'access_requests_lapsing'"),
    ).toStrictEqual([{ name: 'access_requests_lapsing' }]);
    expect(rows('pragma foreign_key_check')).toStrictEqual([]);
  });
});
