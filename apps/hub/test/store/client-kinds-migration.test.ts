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
const VERSION = MIGRATIONS.find((migration) => migration.name === 'client_kinds')?.version ?? 0;
const ROWS = z.array(z.record(z.string(), z.unknown()));

let directory: string;
let database: DatabaseSync;

beforeEach(async () => {
  captureLogs();
  directory = await mkdtemp(join(tmpdir(), 'hub-client-kinds-'));
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

function client(id: string, platform: string): void {
  database
    .prepare(
      'insert into clients (id, name, platform, role, built_in, token_hash, created_at) values (?, ?, ?, ?, 0, ?, ?)',
    )
    .run(id, id, platform, 'owner', id, NOW);
}

describe('client kinds migration', () => {
  it('gives every existing client the kind its platform implies', () => {
    upTo(VERSION - 1);
    client('desk', 'desktop');
    client('pixel', 'android');
    client('tab', 'web');
    upTo(VERSION);
    const rows = ROWS.parse(database.prepare('select id, kind from clients order by id').all());
    expect(rows).toEqual([
      { id: 'desk', kind: 'computer' },
      { id: 'pixel', kind: 'phone' },
      { id: 'tab', kind: 'browser' },
    ]);
  });

  it('refuses a kind outside the known ones', () => {
    upTo(VERSION);
    client('x', 'android');
    expect(() => database.prepare("update clients set kind = 'watch'").run()).toThrow();
  });
});
