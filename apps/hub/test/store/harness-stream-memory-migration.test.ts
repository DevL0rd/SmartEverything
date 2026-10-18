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
const DELIVERY = '0e000000-0000-4000-8000-0000000000d1';
const REPLY = '0e000000-0000-4000-8000-0000000000a1';
const NAMED = z.object({ name: z.string() });
const DELIVERY_ROW = z.object({
  delivery_id: z.string(),
  session_id: z.string(),
  reply_id: z.string(),
  state: z.string(),
  start_seq: z.number(),
  end_seq: z.number(),
});

let directory: string;
let path: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-stream-memory-'));
  path = join(directory, 'hub.db');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function seedBefore(): void {
  const database = new DatabaseSync(path);
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version <= 86),
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
    "insert into assistant_messages (id, profile_id, role, kind, author, text, created_at, updated_at, chat_id) values (?, ?, 'responder', 'text', 'Jarvis', '', ?, ?, ?)",
    REPLY,
    PROFILE,
    NOW,
    NOW,
    CHAT,
  );
  run(
    "insert into assistant_events (id, kind, chat_id, profile_id, text, received_at) values (?, 'chat', ?, ?, 'work', ?)",
    DELIVERY,
    CHAT,
    PROFILE,
    NOW,
  );
  run(
    "insert into dsh_sessions (session_id, chat_id, profile_id, header, composition, inherited_event_count, creation_request, created_at) values (?, ?, ?, '{}', '{}', 0, '{}', ?)",
    SESSION,
    CHAT,
    PROFILE,
    NOW,
  );
  database
    .prepare(
      "insert into harness_deliveries (delivery_id, session_id, reply_id, state, text, start_seq, end_seq) values (?, ?, ?, 'completed', 'a streamed reply', 3, 9)",
    )
    .run(DELIVERY, SESSION, REPLY);
  database
    .prepare(
      "insert into harness_outbox (session_id, epoch, seq, payload, source) values (?, 1, 4, '{}', '{}')",
    )
    .run(SESSION);
  database
    .prepare(
      "insert into harness_consumers (session_id, epoch, seq, consumer) values (?, 1, 4, 'live-v1')",
    )
    .run(SESSION);
  database.close();
}

function tables(database: DatabaseSync): string[] {
  return z
    .array(NAMED)
    .parse(database.prepare("select name from sqlite_master where type = 'table'").all())
    .map((row) => row.name);
}

describe('migrating a schema-86 database to in-memory streaming', () => {
  it('keeps every delivery with its boundaries and drops the streamed text, outbox and consumers', () => {
    seedBefore();

    openStore({
      path,
      log: testLogger(),
      now: () => new Date(NOW),
      systemTimeZone: 'UTC',
    }).close();

    const migrated = new DatabaseSync(path);
    expect(tables(migrated)).not.toContain('harness_outbox');
    expect(tables(migrated)).not.toContain('harness_consumers');
    expect(
      z
        .array(NAMED)
        .parse(migrated.prepare("select name from pragma_table_info('harness_deliveries')").all())
        .map((column) => column.name),
    ).not.toContain('text');
    expect(
      z.array(DELIVERY_ROW).parse(migrated.prepare('select * from harness_deliveries').all()),
    ).toStrictEqual([
      {
        delivery_id: DELIVERY,
        session_id: SESSION,
        reply_id: REPLY,
        state: 'completed',
        start_seq: 3,
        end_seq: 9,
      },
    ]);
    migrated.close();
  });
});
