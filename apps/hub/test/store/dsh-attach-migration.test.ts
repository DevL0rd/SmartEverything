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
const PROFILE = '0e000000-0000-4000-8000-0000000000f1';
const CHAT = '0e000000-0000-4000-8000-0000000000c1';
const SESSION = '0e000000-0000-4000-8000-000000000001';
const NAMED = z.object({ name: z.string() });
const SESSION_ROW = z.object({
  session_id: z.string(),
  next_seq: z.number(),
  epoch: z.number(),
  claim: z.null(),
});

let directory: string;
let path: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-dsh-attach-'));
  path = join(directory, 'hub.db');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function seedBefore(): void {
  const database = new DatabaseSync(path);
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version <= 91),
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
    `insert into dsh_sessions (session_id, chat_id, profile_id, header, composition, inherited_event_count, next_seq, epoch, claim, claim_state, acquire_operation, creation_request, created_at)
     values (?, ?, ?, '{}', '{}', 0, 2, 7, '{"token":"t","expires_at":"2026-10-17T09:02:00.000Z"}', 'active', 'op', '{}', ?)`,
    SESSION,
    CHAT,
    PROFILE,
    NOW,
  );
  run(
    "insert into dsh_session_events (session_id, seq, event) values (?, 0, '{}'), (?, 1, '{}')",
    SESSION,
    SESSION,
  );
  run(
    "insert into dsh_session_claim_receipts (session_id, operation_id, request, claim) values (?, 'op', '{}', '{}')",
    SESSION,
  );
  run("insert into harness_admissions (chat_id, signature, request) values (?, 's', '{}')", CHAT);
  run(
    "insert into harness_openings (chat_id, signature, request, state) values (?, 's', '{}', 'ready')",
    CHAT,
  );
  database.close();
}

describe('migrating a schema-91 database to machine attachment', () => {
  it('keeps every session and its log, detaches it from any machine and drops the lease bookkeeping', () => {
    seedBefore();

    openStore({ path, log: testLogger(), now: () => new Date(NOW), systemTimeZone: 'UTC' }).close();

    const migrated = new DatabaseSync(path);
    const columns = z
      .array(NAMED)
      .parse(migrated.prepare("select name from pragma_table_info('dsh_sessions')").all())
      .map((column) => column.name);
    expect(columns).toStrictEqual([
      'session_id',
      'chat_id',
      'profile_id',
      'header',
      'inherited_event_count',
      'next_seq',
      'epoch',
      'claim',
      'created_at',
    ]);
    expect(
      z
        .array(SESSION_ROW)
        .parse(
          migrated.prepare('select session_id, next_seq, epoch, claim from dsh_sessions').all(),
        ),
    ).toStrictEqual([{ session_id: SESSION, next_seq: 2, epoch: 7, claim: null }]);
    expect(
      z
        .object({ n: z.number() })
        .parse(migrated.prepare('select count(*) as n from dsh_session_events').get()).n,
    ).toBe(2);
    const tables = z
      .array(NAMED)
      .parse(migrated.prepare("select name from sqlite_master where type = 'table'").all())
      .map((row) => row.name);
    expect(tables).not.toContain('dsh_session_claim_receipts');
    expect(tables).not.toContain('harness_admissions');
    expect(tables).not.toContain('harness_openings');
    migrated.close();
  });
});
