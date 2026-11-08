import { DatabaseSync } from 'node:sqlite';
import { LIVE_TABLES } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { MODELS_MIGRATION } from '../../src/store/migrations/models';
import { sha256Of } from '../../src/store/repositories/model-assets';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-10-25T10:00:00.000Z';
const NAMES = z.object({ name: z.string() });
const SPEC_BYTES = new TextEncoder().encode('{"schema":1,"id":"dev.fan.example"}');

function tablesOf(db: DatabaseSync): string[] {
  return db
    .prepare(
      `select name from sqlite_master where name like 'model\\_%' escape '\\' and type = 'table'`,
    )
    .all()
    .map((row) => NAMES.parse(row).name)
    .sort();
}

describe('the models migration', () => {
  it('takes one free version, is part of the latest migrations and adds only its tables', () => {
    captureLogs();
    expect(MODELS_MIGRATION.version).toBe(145);
    expect(new Set(MIGRATIONS.map((migration) => migration.version)).size).toBe(MIGRATIONS.length);
    expect(MIGRATIONS).toContain(MODELS_MIGRATION);
    const old = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
    const oldSql = new Sql(old);
    migrate(
      oldSql,
      MIGRATIONS.filter((migration) => migration.version < MODELS_MIGRATION.version),
      NOW,
      testLogger(),
    );
    old.prepare(`insert into rooms (id, name, position) values ('kitchen', 'Kitchen', 0)`).run();
    expect(tablesOf(old)).toStrictEqual([]);
    migrate(oldSql, MIGRATIONS, NOW, testLogger());
    expect(NAMES.parse(old.prepare('select name from rooms').get()).name).toBe('Kitchen');
    expect(tablesOf(old)).toStrictEqual(['model_assets', 'model_catalog', 'model_overrides']);
  });

  it('lists the three tables as live tables', () => {
    expect(LIVE_TABLES).toStrictEqual(
      expect.arrayContaining(['model_assets', 'model_catalog', 'model_overrides']),
    );
  });

  it('refuses rows that break the table rules', () => {
    captureLogs();
    const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
    migrate(new Sql(database), MIGRATIONS, NOW, testLogger());
    const insertAsset = database.prepare(
      `insert into model_assets (sha256, kind, bytes, size, owner, created) values (?, ?, ?, ?, ?, ?)`,
    );
    const good = sha256Of(SPEC_BYTES);
    expect(() =>
      insertAsset.run('ABC', 'spec', SPEC_BYTES, SPEC_BYTES.length, 'builtin', NOW),
    ).toThrow();
    expect(() =>
      insertAsset.run(good, 'svg', SPEC_BYTES, SPEC_BYTES.length, 'builtin', NOW),
    ).toThrow();
    expect(() => insertAsset.run(good, 'spec', SPEC_BYTES, 3, 'builtin', NOW)).toThrow();
    expect(() =>
      insertAsset.run(good, 'spec', SPEC_BYTES, SPEC_BYTES.length, 'somebody', NOW),
    ).toThrow();
    const insertOverride = database.prepare(
      `insert into model_overrides (scope, target, model_id, asset_hash, finish, params, set_by, updated_at)
       values (?, ?, ?, ?, null, ?, 'profile:a', ?)`,
    );
    expect(() => insertOverride.run('device', 'd1', null, null, '{}', NOW)).toThrow();
    expect(() => insertOverride.run('device', 'd1', 'dev.fan.example', good, '{}', NOW)).toThrow();
    expect(() => insertOverride.run('room', 'd1', 'dev.fan.example', null, '{}', NOW)).toThrow();
    expect(() => insertOverride.run('device', 'd1', 'dev.fan.example', null, '[]', NOW)).toThrow();
    expect(() => insertOverride.run('device', 'd1', null, good, '{}', NOW)).toThrow();
  });
});
