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
const PROFILE = '0e000000-0000-4000-8000-0000000000f2';
const CHAT = '0e000000-0000-4000-8000-0000000000c2';
const NAMED = z.object({ name: z.string() });

let directory: string;
let path: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-error-rules-drop-'));
  path = join(directory, 'hub.db');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function seedBefore(): void {
  const database = new DatabaseSync(path);
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version <= 93),
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
    "insert into preview_error_rules (chat_id, scope_key, fingerprint, reason, created_at) values (?, 'page', 'fp', 'noisy', ?)",
    CHAT,
    NOW,
  );
  database.close();
}

describe('migrating a schema-93 database past the removed preview error rules', () => {
  it('drops the rule table, keeps the chat and the held native tables', () => {
    seedBefore();

    const migrated = new DatabaseSync(path);
    migrate(
      new Sql(migrated),
      MIGRATIONS.filter((migration) => migration.version <= 94),
      NOW,
      testLogger(),
    );
    const tables = z
      .array(NAMED)
      .parse(migrated.prepare("select name from sqlite_master where type = 'table'").all())
      .map((row) => row.name);
    expect(tables).not.toContain('preview_error_rules');
    expect(tables).toContain('computer_native_mcp_policy');
    expect(tables).toContain('claude_cli_operations');
    expect(tables).toContain('native_command_operations');
    expect(
      z
        .object({ n: z.number() })
        .parse(migrated.prepare('select count(*) as n from ai_chats').get()).n,
    ).toBe(1);
    migrated.close();
  });
});
