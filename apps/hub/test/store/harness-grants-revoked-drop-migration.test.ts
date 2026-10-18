import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { Sql } from '../../src/store/sql';
import { openStore } from '../../src/store/store';
import { testLogger } from '../support/logs';

const NOW = '2026-10-17T09:00:00.000Z';
const PROFILE = '0e000000-0000-4000-8000-0000000000f3';
const CHAT = '0e000000-0000-4000-8000-0000000000c3';
const SESSION = '0e000000-0000-4000-8000-000000000003';
const INSTANCE = '0e000000-0000-4000-8000-0000000000a3';
const GENERATION = '0e000000-0000-4000-8000-0000000000b3';
const NAMED = z.object({ name: z.string() });
const GRANT_ROW = z.object({ session_id: z.string(), permission: z.string(), cwd: z.string() });

let directory: string;
let path: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-grants-revoked-'));
  path = join(directory, 'hub.db');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function seedBefore(): void {
  const database = new DatabaseSync(path);
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version <= 94),
    NOW,
    testLogger(),
  );
  const run = (sql: string, ...values: string[]): void => {
    database.prepare(sql).run(...values);
  };
  run(
    "insert into profiles (id, name, colour, fitness_goals, position, created_at, updated_at) values (?, 'Ann', 'amber', '{}', 0, ?, ?)",
    PROFILE,
    NOW,
    NOW,
  );
  run(
    "insert into ai_chats (id, profile_id, kind, title, engine, pinned, created_at, updated_at) values (?, ?, 'chat', 'Home', '{}', 0, ?, ?)",
    CHAT,
    PROFILE,
    NOW,
    NOW,
  );
  run(
    "insert into dsh_sessions (session_id, chat_id, profile_id, header, inherited_event_count, created_at) values (?, ?, ?, '{}', 0, ?)",
    SESSION,
    CHAT,
    PROFILE,
    NOW,
  );
  run(
    `insert into harness_grants (session_id, profile_id, target, runtime_instance, generation, authority, route, permission, cwd, client_id, role)
     values (?, ?, '{}', ?, ?, '{}', '{}', '"ask"', '/work', null, 'owner')`,
    SESSION,
    PROFILE,
    INSTANCE,
    GENERATION,
  );
  database.close();
}

describe('migrating a schema-94 database to grants without a revoked flag', () => {
  it('keeps every issued grant and drops the never-set revoked column', () => {
    seedBefore();

    openStore({ path, log: testLogger(), now: () => new Date(NOW), systemTimeZone: 'UTC' }).close();

    const migrated = new DatabaseSync(path);
    const columns = z
      .array(NAMED)
      .parse(migrated.prepare("select name from pragma_table_info('harness_grants')").all())
      .map((column) => column.name);
    expect(columns).not.toContain('revoked');
    expect(columns).toContain('permission');
    expect(
      z
        .array(GRANT_ROW)
        .parse(migrated.prepare('select session_id, permission, cwd from harness_grants').all()),
    ).toStrictEqual([{ session_id: SESSION, permission: '"ask"', cwd: '/work' }]);
    expect(migrated.prepare('pragma foreign_key_check').all()).toStrictEqual([]);
    migrated.close();
  });
});
