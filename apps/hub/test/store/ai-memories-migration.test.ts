import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { AI_MEMORIES_MIGRATION } from '../../src/store/migrations/ai-memories';
import { AI_MEMORY_STRENGTH_MIGRATION } from '../../src/store/migrations/ai-memory-strength';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-10-25T10:00:00.000Z';
const FIRST = '7b7a1c1e-3a0f-4c63-9a1b-0a8f8c0c0001';
const NAMES = z.object({ name: z.string() });
const COUNT = z.object({ total: z.number() });

function memoryTables(database: DatabaseSync): string[] {
  return database
    .prepare(
      `select name from sqlite_master where name like 'ai\\_memor%' escape '\\' and type = 'table' order by name`,
    )
    .all()
    .map((row) => NAMES.parse(row).name);
}

function opened(): DatabaseSync {
  captureLogs();
  const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  migrate(new Sql(database), MIGRATIONS, NOW, testLogger());
  return database;
}

function profile(database: DatabaseSync, name: string): string {
  const id = crypto.randomUUID();
  database
    .prepare(
      'insert into profiles (id, name, colour, position, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
    )
    .run(id, name, 'amber', 0, NOW, NOW);
  return id;
}

describe('the AI memories migration', () => {
  it('is one free version, adds only its two tables and keeps the stored data', () => {
    captureLogs();
    expect(new Set(MIGRATIONS.map((migration) => migration.version)).size).toBe(MIGRATIONS.length);
    expect(MIGRATIONS).toContain(AI_MEMORIES_MIGRATION);
    const old = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
    const sql = new Sql(old);
    migrate(
      sql,
      MIGRATIONS.filter((migration) => migration.version < AI_MEMORIES_MIGRATION.version),
      NOW,
      testLogger(),
    );
    old.prepare(`insert into rooms (id, name, position) values ('kitchen', 'Kitchen', 0)`).run();
    expect(memoryTables(old)).toStrictEqual([]);
    migrate(sql, MIGRATIONS, NOW, testLogger());
    expect(NAMES.parse(old.prepare('select name from rooms').get()).name).toBe('Kitchen');
    expect(memoryTables(old)).toStrictEqual([
      'ai_memories',
      'ai_memory_learning',
      'ai_memory_settings',
    ]);
  });

  it('keeps a person memory with its person and a home memory with nobody', () => {
    const database = opened();
    const ida = profile(database, 'Ida');
    const insert = database.prepare(
      `insert into ai_memories (id, scope, profile_id, text, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?)`,
    );
    insert.run(FIRST, 'person', ida, 'likes tea', NOW, NOW);
    insert.run(crypto.randomUUID(), 'home', null, 'bins on Tuesday', NOW, NOW);
    expect(() => insert.run(crypto.randomUUID(), 'person', null, 'nobody', NOW, NOW)).toThrow();
    expect(() => insert.run(crypto.randomUUID(), 'home', ida, 'owned home', NOW, NOW)).toThrow();
    expect(() => insert.run(crypto.randomUUID(), 'person', ida, '   ', NOW, NOW)).toThrow();
    expect(() => insert.run(crypto.randomUUID(), 'other', ida, 'x', NOW, NOW)).toThrow();
    expect(
      COUNT.parse(database.prepare('select count(*) as total from ai_memories').get()).total,
    ).toBe(2);
  });

  it('removes the memories and the settings of a removed person and nothing else', () => {
    const database = opened();
    const ida = profile(database, 'Ida');
    const kid = profile(database, 'Kid');
    const insert = database.prepare(
      `insert into ai_memories (id, scope, profile_id, text, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?)`,
    );
    insert.run(crypto.randomUUID(), 'person', ida, 'a', NOW, NOW);
    insert.run(crypto.randomUUID(), 'person', kid, 'b', NOW, NOW);
    insert.run(crypto.randomUUID(), 'home', null, 'c', NOW, NOW);
    database
      .prepare(
        'insert into ai_memory_settings (profile_id, enabled, prompt_chars) values (?, 0, 50)',
      )
      .run(ida);
    expect(() =>
      database
        .prepare(
          'insert into ai_memory_settings (profile_id, enabled, prompt_chars) values (?, 1, 0)',
        )
        .run(kid),
    ).toThrow();

    database.prepare('delete from profiles where id = ?').run(ida);

    expect(
      COUNT.parse(database.prepare('select count(*) as total from ai_memories').get()).total,
    ).toBe(2);
    expect(
      COUNT.parse(database.prepare('select count(*) as total from ai_memory_settings').get()).total,
    ).toBe(0);
  });
});

describe('the AI memory strength migration', () => {
  it('gives stored memories kind fact and importance 50 and adds the learning table', () => {
    captureLogs();
    const old = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
    const sql = new Sql(old);
    migrate(
      sql,
      MIGRATIONS.filter((migration) => migration.version < AI_MEMORY_STRENGTH_MIGRATION.version),
      NOW,
      testLogger(),
    );
    const ida = profile(old, 'Ida');
    old
      .prepare(
        `insert into ai_memories (id, scope, profile_id, text, created_at, updated_at)
         values (?, 'person', ?, 'likes tea', ?, ?)`,
      )
      .run(FIRST, ida, NOW, NOW);
    migrate(sql, MIGRATIONS, NOW, testLogger());
    expect(old.prepare('select * from ai_memories').get()).toMatchObject({
      kind: 'fact',
      importance: 50,
      happened_on: null,
      valid_until: null,
      recalled_at: null,
      recall_count: 0,
    });
    expect(memoryTables(old)).toContain('ai_memory_learning');
    expect(() =>
      old.prepare(`update ai_memories set kind = 'other' where id = ?`).run(FIRST),
    ).toThrow();
    expect(() =>
      old.prepare('update ai_memories set importance = 101 where id = ?').run(FIRST),
    ).toThrow();
  });
});
