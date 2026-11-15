import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { z } from 'zod';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { AI_USAGE_PHOTOS_MIGRATION } from '../../src/store/migrations/ai-usage-photos';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-14T00:00:00.000Z';

let database: DatabaseSync;
let sql: Sql;
let profile: string;

function usage(id: string, work: string): void {
  database
    .prepare(
      `insert into ai_usage (id, at, profile_id, source, work, cost_micros, cost_state)
        values (?, ?, ?, 'openrouter', ?, 5, 'reported')`,
    )
    .run(id, NOW, profile, work);
}

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  sql = new Sql(database);
  const before = MIGRATIONS.filter(
    (migration) => migration.version < AI_USAGE_PHOTOS_MIGRATION.version,
  );
  migrate(sql, before, NOW, testLogger());
  const context = new StoreContext(sql, new ChangeFeed(testLogger()), () => new Date(NOW));
  profile = new ProfilesRepository(context).create({ name: 'Alice' }).id;
  usage('before', 'chat');
});

afterEach(() => {
  database.close();
});

it('keeps the usage rows and lets the photos work be recorded', () => {
  expect(() => {
    usage('refused', 'photos');
  }).toThrow(/constraint/u);
  migrate(sql, MIGRATIONS, NOW, testLogger());
  usage('after', 'photos');
  const rows = z
    .array(z.strictObject({ id: z.string(), work: z.string() }))
    .parse(database.prepare('select id, work from ai_usage order by id').all());
  expect(rows).toEqual([
    { id: 'after', work: 'photos' },
    { id: 'before', work: 'chat' },
  ]);
});

it('keeps every usage index', () => {
  migrate(sql, MIGRATIONS, NOW, testLogger());
  const names = z
    .array(z.strictObject({ name: z.string() }))
    .parse(
      database
        .prepare("select name from sqlite_master where type = 'index' and tbl_name = 'ai_usage'")
        .all(),
    )
    .map((row) => row.name)
    .filter((name) => name.startsWith('ai_usage_by_'));
  expect(names.toSorted()).toEqual([
    'ai_usage_by_at',
    'ai_usage_by_chat',
    'ai_usage_by_chat_meter',
    'ai_usage_by_client',
    'ai_usage_by_message',
    'ai_usage_by_profile',
    'ai_usage_by_work',
  ]);
});
