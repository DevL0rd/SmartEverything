import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { ONE_CONVERSATION_CHAT_MIGRATION } from '../../src/store/migrations/one-conversation-chat';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-07T09:00:00.000Z';
const ENGINE = '{"kind":"dsh"}';

const CHAT = z.object({
  id: z.string(),
  title: z.string(),
  title_auto: z.number(),
  source_key: z.string().nullable(),
});

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-one-conversation-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function seeded(settings: string): DatabaseSync {
  const database = new DatabaseSync(join(directory, 'hub.db'));
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version < ONE_CONVERSATION_CHAT_MIGRATION.version),
    NOW,
    testLogger(),
  );
  const profile = database.prepare(
    "insert into profiles(id,name,colour,created_at,updated_at) values(?,?,'amber',?,?)",
  );
  profile.run('ann', 'Ann', NOW, NOW);
  profile.run('bo', 'Bo', NOW, NOW);
  database
    .prepare('insert into assistant_settings(id, settings, updated_at) values (1, ?, ?)')
    .run(settings, NOW);
  const chat = database.prepare(
    'insert into ai_chats(id,profile_id,kind,title,source_key,engine,pinned,archived_at,last_message_at,created_at,updated_at,title_auto) values(?,?,?,?,?,?,0,?,?,?,?,1)',
  );
  chat.run(
    'old',
    'ann',
    'chat',
    'Voice · the phone · 08:00',
    'conversation',
    ENGINE,
    null,
    '2026-11-07T08:00:00.000Z',
    NOW,
    NOW,
  );
  chat.run(
    'new',
    'ann',
    'chat',
    'Talking via Camera',
    'conversation',
    ENGINE,
    null,
    '2026-11-07T08:30:00.000Z',
    NOW,
    NOW,
  );
  chat.run(
    'gone',
    'ann',
    'chat',
    'Walkie-talkie',
    'conversation',
    ENGINE,
    NOW,
    '2026-11-07T08:50:00.000Z',
    NOW,
    NOW,
  );
  chat.run(
    'bos',
    'bo',
    'chat',
    'Call from Coordinator',
    'conversation',
    ENGINE,
    null,
    null,
    NOW,
    NOW,
  );
  chat.run('plug', 'ann', 'plugin', '#general', 'plugin:discord:1', ENGINE, null, NOW, NOW, NOW);
  return database;
}

function chats(database: DatabaseSync): Readonly<Record<string, z.infer<typeof CHAT>>> {
  const rows = z
    .array(CHAT)
    .parse(database.prepare('select id, title, title_auto, source_key from ai_chats').all());
  return Object.fromEntries(rows.map((row) => [row.id, row]));
}

describe('one conversation chat migration', () => {
  it('keeps one conversation chat per person, named after the AI, and drops the reuse window', () => {
    const database = seeded('{"name":"Jarvis","reuse_chat_minutes":120,"activity_steps":true}');
    migrate(new Sql(database), MIGRATIONS, NOW, testLogger());
    const after = chats(database);
    expect(after['new']).toEqual({
      id: 'new',
      title: 'Jarvis',
      title_auto: 0,
      source_key: 'conversation',
    });
    expect(after['bos']).toEqual({
      id: 'bos',
      title: 'Jarvis',
      title_auto: 0,
      source_key: 'conversation',
    });
    expect(after['old']).toMatchObject({ title: 'Voice · the phone · 08:00', source_key: null });
    expect(after['gone']).toMatchObject({ title: 'Walkie-talkie', source_key: null });
    expect(after['plug']).toMatchObject({ title: '#general', source_key: 'plugin:discord:1' });
    const settings = z
      .object({ settings: z.string() })
      .parse(database.prepare('select settings from assistant_settings where id = 1').get());
    expect(JSON.parse(settings.settings)).toEqual({ name: 'Jarvis', activity_steps: true });
    database.close();
  });

  it('names the chat Coordinator when the AI has no name of its own', () => {
    const database = seeded('{"name":null}');
    migrate(new Sql(database), MIGRATIONS, NOW, testLogger());
    expect(chats(database)['new']?.title).toBe('Coordinator');
    database.close();
  });
});
