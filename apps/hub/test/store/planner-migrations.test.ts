import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { GOOGLE_ACCOUNTS_MIGRATION } from '../../src/store/migrations/google-accounts';
import { PLANNER_TABLES_MIGRATION } from '../../src/store/migrations/planner-tables';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-11-07T10:00:00.000Z';
const PERSON = '7b7a1c1e-3a0f-4c63-9a1b-0a8f8c0c0001';
const OTHER = '7b7a1c1e-3a0f-4c63-9a1b-0a8f8c0c0002';
const COLLECTION = '7b7a1c1e-3a0f-4c63-9a1b-0a8f8c0c0010';
const NAMES = z.object({ name: z.string() });
const COLUMNS = z.object({ name: z.string(), seqno: z.number() });
const COUNT = z.object({ total: z.number() });
const PLAN = z.object({ detail: z.string() });

const PLANNER_TABLES = [
  'planner_alarms',
  'planner_collections',
  'planner_items',
  'planner_occurrences',
  'planner_preferences',
  'planner_rings',
  'planner_stopwatches',
  'planner_timers',
];

const GOOGLE_TABLES = ['google_accounts', 'google_sync_log', 'google_sync_state'];

function tableNames(database: DatabaseSync): string[] {
  return database
    .prepare(
      `select name from sqlite_master where type = 'table' and (name like 'planner\\_%' escape '\\' or name like 'google\\_%' escape '\\') order by name`,
    )
    .all()
    .map((row) => NAMES.parse(row).name);
}

function indexColumns(database: DatabaseSync, index: string): string[] {
  return database
    .prepare(`select name, seqno from pragma_index_xinfo('${index}') where key = 1 order by seqno`)
    .all()
    .map((row) => COLUMNS.parse(row).name);
}

function opened(): DatabaseSync {
  captureLogs();
  const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  migrate(new Sql(database), MIGRATIONS, NOW, testLogger());
  database
    .prepare(
      'insert into profiles (id, name, colour, position, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
    )
    .run(PERSON, 'Ida', 'amber', 0, NOW, NOW);
  database
    .prepare(
      'insert into profiles (id, name, colour, position, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
    )
    .run(OTHER, 'Sam', 'amber', 1, NOW, NOW);
  return database;
}

function collection(database: DatabaseSync, colour = 'work', source = 'local'): void {
  database
    .prepare(
      `insert into planner_collections
       (id, profile_id, kind, name, colour, icon, position, visible, default_reminders, source, google, created_at, updated_at)
       values (?, ?, 'calendar', 'Work', ?, 'briefcase', 0, 1, '[]', ?, null, ?, ?)`,
    )
    .run(COLLECTION, PERSON, colour, source, NOW, NOW);
}

function item(
  database: DatabaseSync,
  id: string,
  extra: { start?: string; series?: string } = {},
): void {
  database
    .prepare(
      `insert into planner_items
       (id, profile_id, collection_id, kind, title, notes, tags, all_day, exdates, start, status, position,
        completion, attachments, reminders, created_by, created_at, updated_at, series_id, original_start)
       values (?, ?, ?, 'event', 'Standup', '', '[]', 0, '[]', ?, 'open', 0,
        '{"kind":"manual"}', '[]', '[]', 'person', ?, ?, ?, ?)`,
    )
    .run(
      id,
      PERSON,
      COLLECTION,
      extra.start ?? '2026-11-08T09:00:00.000Z',
      NOW,
      NOW,
      extra.series ?? null,
      extra.series === undefined ? null : '2026-11-08T09:00:00',
    );
}

function total(database: DatabaseSync, table: string): number {
  return COUNT.parse(database.prepare(`select count(*) as total from ${table}`).get()).total;
}

describe('the planner and Google account migrations', () => {
  it('take two contiguous unique versions behind the head and add only new tables', () => {
    captureLogs();
    const versions = MIGRATIONS.map((migration) => migration.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect(MIGRATIONS).toContain(PLANNER_TABLES_MIGRATION);
    expect(MIGRATIONS).toContain(GOOGLE_ACCOUNTS_MIGRATION);
    expect(GOOGLE_ACCOUNTS_MIGRATION.version).toBe(PLANNER_TABLES_MIGRATION.version + 1);
    expect(Math.max(...versions)).toBe(GOOGLE_ACCOUNTS_MIGRATION.version);
    const old = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
    const sql = new Sql(old);
    migrate(
      sql,
      MIGRATIONS.filter((migration) => migration.version < PLANNER_TABLES_MIGRATION.version),
      NOW,
      testLogger(),
    );
    old.prepare(`insert into rooms (id, name, position) values ('kitchen', 'Kitchen', 0)`).run();
    expect(tableNames(old)).toStrictEqual([]);
    migrate(sql, MIGRATIONS, NOW, testLogger());
    expect(NAMES.parse(old.prepare('select name from rooms').get()).name).toBe('Kitchen');
    expect(tableNames(old)).toStrictEqual([...GOOGLE_TABLES, ...PLANNER_TABLES].sort());
  });

  it('indexes the range, due, status, series end, series and item reads', () => {
    const database = opened();
    expect(indexColumns(database, 'planner_items_by_start')).toStrictEqual(['profile_id', 'start']);
    expect(indexColumns(database, 'planner_items_by_due')).toStrictEqual(['profile_id', 'due_at']);
    expect(indexColumns(database, 'planner_items_by_status')).toStrictEqual([
      'profile_id',
      'status',
    ]);
    expect(indexColumns(database, 'planner_items_by_series_end')).toStrictEqual([
      'profile_id',
      'series_end',
    ]);
    expect(indexColumns(database, 'planner_items_by_series')).toStrictEqual(['series_id']);
    expect(indexColumns(database, 'sqlite_autoindex_planner_occurrences_1')).toStrictEqual([
      'item_id',
      'occurrence_key',
    ]);
    const plan = database
      .prepare(
        `explain query plan select id from planner_items where profile_id = ? and start >= ? and start < ?`,
      )
      .all(PERSON, '2026-11-08', '2026-11-09')
      .map((row) => PLAN.parse(row).detail)
      .join(' ');
    expect(plan).toContain('planner_items_by_start');
  });

  it('rejects a hex colour, a Google collection without its link and a bad stopwatch', () => {
    const database = opened();
    expect(() => {
      collection(database, '#ff0000');
    }).toThrow();
    expect(() => {
      collection(database, 'work', 'google');
    }).toThrow();
    collection(database);
    expect(() =>
      database
        .prepare(
          `insert into planner_stopwatches (id, profile_id, running, started_at, accumulated_ms, laps, updated_at)
           values (?, ?, 1, null, 0, '[]', ?)`,
        )
        .run(COLLECTION, PERSON, NOW),
    ).toThrow();
  });

  it('cascades from the person and the collection, and from an item to its occurrences', () => {
    const database = opened();
    collection(database);
    const first = '7b7a1c1e-3a0f-4c63-9a1b-0a8f8c0c0020';
    const second = '7b7a1c1e-3a0f-4c63-9a1b-0a8f8c0c0021';
    item(database, first);
    item(database, second, { series: first });
    database
      .prepare(
        `insert into planner_occurrences (item_id, occurrence_key, status, completed_at, completed_by)
         values (?, 'single', 'done', ?, 'person')`,
      )
      .run(first, NOW);
    expect(() =>
      database
        .prepare(
          `insert into planner_occurrences (item_id, occurrence_key, status) values (?, 'x', 'done')`,
        )
        .run(first),
    ).toThrow();
    database.prepare('delete from planner_items where id = ?').run(first);
    expect(total(database, 'planner_items')).toBe(0);
    expect(total(database, 'planner_occurrences')).toBe(0);
    item(database, first);
    database.prepare('delete from profiles where id = ?').run(PERSON);
    expect(total(database, 'planner_items')).toBe(0);
    expect(total(database, 'planner_collections')).toBe(0);
  });

  it('keeps Google status with no token column and one channel per push id', () => {
    const database = opened();
    const columns = database
      .prepare(`select name from pragma_table_info('google_accounts')`)
      .all()
      .map((row) => NAMES.parse(row).name);
    expect(columns).toStrictEqual([
      'profile_id',
      'email',
      'scopes',
      'status',
      'problem',
      'calendar_ids',
      'list_ids',
      'last_sync_at',
      'last_error',
    ]);
    const account = database.prepare(
      `insert into google_accounts (profile_id, email, scopes, status, problem, calendar_ids, list_ids, last_sync_at, last_error)
       values (?, null, '[]', 'linked', null, '[]', '[]', null, null)`,
    );
    account.run(PERSON);
    account.run(OTHER);
    const state = database.prepare(
      `insert into google_sync_state (profile_id, product, resource_id, sync_token, channel, last_pull_at)
       values (?, 'calendar', ?, null, '{"channel_id":"c1","resource_id":"r","expires_at":"2026-11-09T00:00:00Z"}', null)`,
    );
    state.run(PERSON, 'primary');
    expect(() => state.run(OTHER, 'primary')).toThrow();
    expect(() =>
      database
        .prepare(`update google_accounts set status = 'broken' where profile_id = ?`)
        .run(PERSON),
    ).toThrow();
    database
      .prepare(
        `insert into google_sync_log (id, profile_id, at, trigger, product, counts, conflicts, error, choice)
         values (?, ?, ?, 'manual', null, '{}', '[]', null, null)`,
      )
      .run(COLLECTION, PERSON, NOW);
    database.prepare('delete from google_accounts where profile_id = ?').run(PERSON);
    expect(total(database, 'google_sync_state')).toBe(0);
    expect(total(database, 'google_sync_log')).toBe(0);
  });
});
