import { DatabaseSync } from 'node:sqlite';
import { LIVE_TABLES } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { AUTOMATION_PLUGIN_KINDS_MIGRATION } from '../../src/store/migrations/automation-plugin-kinds';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-10-25T10:00:00.000Z';
const HASH = 'a'.repeat(64);
const NAMES = z.object({ name: z.string() });
const COUNT = z.object({ total: z.number() });

function tablesOf(database: DatabaseSync): string[] {
  return database
    .prepare(
      `select name from sqlite_master where name like 'automation\\_plugin\\_kinds%' escape '\\' and type = 'table'`,
    )
    .all()
    .map((row) => NAMES.parse(row).name);
}

describe('the automation plugin kinds migration', () => {
  it('has its own version, adds only its table and keeps the stored data', () => {
    captureLogs();
    expect(new Set(MIGRATIONS.map((migration) => migration.version)).size).toBe(MIGRATIONS.length);
    expect(MIGRATIONS).toContain(AUTOMATION_PLUGIN_KINDS_MIGRATION);
    const old = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
    const sql = new Sql(old);
    migrate(
      sql,
      MIGRATIONS.filter(
        (migration) => migration.version < AUTOMATION_PLUGIN_KINDS_MIGRATION.version,
      ),
      NOW,
      testLogger(),
    );
    old.prepare(`insert into rooms (id, name, position) values ('kitchen', 'Kitchen', 0)`).run();
    expect(tablesOf(old)).toStrictEqual([]);
    migrate(sql, MIGRATIONS, NOW, testLogger());
    expect(NAMES.parse(old.prepare('select name from rooms').get()).name).toBe('Kitchen');
    expect(tablesOf(old)).toStrictEqual(['automation_plugin_kinds']);
    const position = MIGRATIONS.indexOf(AUTOMATION_PLUGIN_KINDS_MIGRATION);
    expect(
      MIGRATIONS.slice(0, position).every(
        (migration) => migration.version < AUTOMATION_PLUGIN_KINDS_MIGRATION.version,
      ),
    ).toBe(true);
  });

  it('streams the table as a live table', () => {
    expect(LIVE_TABLES).toContain('automation_plugin_kinds');
  });

  it('refuses rows that break the table rules', () => {
    captureLogs();
    const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
    migrate(new Sql(database), MIGRATIONS, NOW, testLogger());
    const insert = database.prepare(
      `insert into automation_plugin_kinds (kind_id, owner, version, interface_hash, declaration, status, updated)
       values (?, ?, ?, ?, ?, ?, ?)`,
    );
    insert.run('plugin.chat.post', 'plugin:chat', '1.0.0', HASH, '{}', 'active', NOW);
    expect(() =>
      insert.run('plugin.chat.post', 'plugin:chat', '1.0.0', HASH, '{}', 'active', NOW),
    ).toThrow();
    expect(() => insert.run('', 'plugin:chat', '1.0.0', HASH, '{}', 'active', NOW)).toThrow();
    expect(() => insert.run('a', 'somebody', '1.0.0', HASH, '{}', 'active', NOW)).toThrow();
    expect(() => insert.run('b', 'plugin:', '1.0.0', HASH, '{}', 'active', NOW)).toThrow();
    expect(() => insert.run('c', 'driver:g15', '', HASH, '{}', 'active', NOW)).toThrow();
    expect(() => insert.run('d', 'driver:g15', '1', 'ABC', '{}', 'active', NOW)).toThrow();
    expect(() => insert.run('e', 'driver:g15', '1', HASH, '[]', 'active', NOW)).toThrow();
    expect(() => insert.run('f', 'driver:g15', '1', HASH, 'nope', 'active', NOW)).toThrow();
    expect(() => insert.run('g', 'driver:g15', '1', HASH, '{}', 'gone', NOW)).toThrow();
    insert.run('h', 'driver:g15', '1', HASH, '{}', 'retired', NOW);
    expect(
      COUNT.parse(database.prepare('select count(*) as total from automation_plugin_kinds').get())
        .total,
    ).toBe(2);
  });
});
