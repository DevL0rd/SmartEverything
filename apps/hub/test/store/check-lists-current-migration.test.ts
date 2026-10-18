import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-10-17T09:00:00.000Z';
const BEFORE = 96;
const MASTER = z.array(
  z.object({
    type: z.string(),
    name: z.string(),
    tbl_name: z.string(),
    sql: z.string().nullable(),
  }),
);
const COUNT = z.object({ count: z.number() });

const OLD_LISTS: readonly (readonly [string, string, string])[] = [
  ['devices', "'samsung_tv', 'local')", "'samsung_tv')"],
  ['profiles', "'lime', 'ice')", "'lime')"],
  ['phone_contexts', "'navigating', 'parked')", "'navigating')"],
  ['provider_links', "'awaiting_answer', 'discovering')", "'awaiting_answer')"],
];

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-check-lists-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function build(name: string, version: number): DatabaseSync {
  const database = new DatabaseSync(join(directory, name), { enableForeignKeyConstraints: true });
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version <= version),
    NOW,
    testLogger(),
  );
  return database;
}

function upgrade(name: string): DatabaseSync {
  const database = new DatabaseSync(join(directory, name), { enableForeignKeyConstraints: true });
  migrate(new Sql(database), MIGRATIONS, NOW, testLogger());
  return database;
}

function schemaOf(database: DatabaseSync): z.output<typeof MASTER> {
  return MASTER.parse(
    database
      .prepare(
        "select type, name, tbl_name, sql from sqlite_master where name not like 'sqlite_%' order by type, name",
      )
      .all(),
  );
}

function seed(database: DatabaseSync): void {
  database
    .prepare(
      "insert into clients (id, name, platform, role, built_in, token_hash, created_at) values ('c1', 'Phone', 'android', 'owner', 0, 'hash', ?)",
    )
    .run(NOW);
  database
    .prepare(
      "insert into profiles (id, name, colour, fitness_goals, position, created_at, updated_at) values ('p1', 'Ann', 'amber', '{}', 1, ?, ?)",
    )
    .run(NOW, NOW);
  database
    .prepare(
      "insert into devices (id, provider, external_id, kind, name, model, manufacturer, created_at, updated_at) values ('d1', 'xiaomi', 'x1', 'light', 'Lamp', 'm', 'mf', ?, ?)",
    )
    .run(NOW, NOW);
  database
    .prepare(
      "insert into phone_contexts (device_id, profile_id, client_id, state, reported_at) values ('d1', 'p1', 'c1', 'still', ?)",
    )
    .run(NOW);
  database.prepare("insert into provider_links (provider, updated_at) values ('tuya', ?)").run(NOW);
}

function withOldLists(name: string): void {
  const database = new DatabaseSync(join(directory, name), { defensive: false });
  database.exec('pragma writable_schema = on');
  for (const [table, current, old] of OLD_LISTS) {
    database
      .prepare('update sqlite_master set sql = replace(sql, ?, ?) where type = ? and name = ?')
      .run(current, old, 'table', table);
  }
  database.exec('pragma writable_schema = off');
  database.close();
}

function count(database: DatabaseSync, table: string): number {
  return COUNT.parse(database.prepare(`select count(*) as count from ${table}`).get()).count;
}

describe('rebuilding the CHECK lists that older databases froze', () => {
  it('ends an upgraded database with exactly the schema of a fresh one', () => {
    build('fresh.db', BEFORE).close();
    build('old.db', BEFORE).close();
    withOldLists('old.db');
    const fresh = upgrade('fresh.db');
    const upgraded = upgrade('old.db');
    expect(schemaOf(upgraded)).toStrictEqual(schemaOf(fresh));
    expect(upgraded.prepare('pragma foreign_key_check').all()).toStrictEqual([]);
    fresh.close();
    upgraded.close();
  });

  it('accepts values added after the old lists were frozen and keeps every row', () => {
    const old = build('old.db', BEFORE);
    seed(old);
    old.close();
    withOldLists('old.db');

    const frozen = new DatabaseSync(join(directory, 'old.db'), {
      enableForeignKeyConstraints: true,
    });
    expect(() =>
      frozen
        .prepare(
          "insert into devices (id, provider, external_id, kind, name, model, manufacturer, created_at, updated_at) values ('d2', 'local', 'l1', 'light', 'Local', 'm', 'mf', ?, ?)",
        )
        .run(NOW, NOW),
    ).toThrow(/CHECK/);
    frozen.close();

    const database = upgrade('old.db');
    database
      .prepare(
        "insert into devices (id, provider, external_id, kind, name, model, manufacturer, created_at, updated_at) values ('d2', 'local', 'l1', 'light', 'Local', 'm', 'mf', ?, ?)",
      )
      .run(NOW, NOW);
    database
      .prepare(
        "insert into profiles (id, name, colour, fitness_goals, position, created_at, updated_at) values ('p2', 'Bo', 'ice', '{}', 2, ?, ?)",
      )
      .run(NOW, NOW);
    database
      .prepare(
        "insert into phone_contexts (device_id, profile_id, client_id, state, reported_at) values ('d2', 'p2', 'c1', 'parked', ?)",
      )
      .run(NOW);
    database
      .prepare("update provider_links set phase = 'discovering' where provider = 'tuya'")
      .run();
    expect([
      count(database, 'devices'),
      count(database, 'profiles'),
      count(database, 'phone_contexts'),
      count(database, 'provider_links'),
    ]).toStrictEqual([2, 3, 2, 1]);
    expect(database.prepare('pragma foreign_key_check').all()).toStrictEqual([]);
    database.close();
  });
});
