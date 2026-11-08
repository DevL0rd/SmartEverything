import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { MESSAGE_QUOTES_MIGRATION } from '../../src/store/migrations/message-quotes';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-07T09:00:00.000Z';
const PROFILE = '0e000000-0000-4000-8000-0000000000f1';
const CHAT = '0e000000-0000-4000-8000-0000000000c1';
const HELPER = '0e000000-0000-4000-8000-0000000000c2';
const HELPER_REPLY = '0e000000-0000-4000-8000-0000000000a1';
const ASKED = '0e000000-0000-4000-8000-0000000000a2';
const PLAIN = '0e000000-0000-4000-8000-0000000000a3';
const GONE = '0e000000-0000-4000-8000-0000000000a4';
const PHOTO = '0e000000-0000-4000-8000-0000000000b1';

const MIGRATED = z.object({
  id: z.string(),
  embeds: z.string(),
  quote: z.string().nullable(),
});

let directory: string;
let path: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-message-quotes-'));
  path = join(directory, 'hub.db');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function dialogue(direction: string, quoted: string | null): string {
  return JSON.stringify([
    {
      kind: 'helper_dialogue',
      direction,
      helper_chat_id: HELPER,
      helper_name: 'Nova',
      quoted_message_id: quoted,
    },
  ]);
}

function seedBefore(): DatabaseSync {
  const database = new DatabaseSync(path);
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version < MESSAGE_QUOTES_MIGRATION.version),
    NOW,
    testLogger(),
  );
  database
    .prepare(
      "insert into profiles (id, name, colour, fitness_goals, position, created_at, updated_at) values (?, 'Ann', 'amber', '{}', 0, ?, ?)",
    )
    .run(PROFILE, NOW, NOW);
  for (const id of [CHAT, HELPER])
    database
      .prepare(
        "insert into ai_chats (id, profile_id, kind, title, engine, pinned, created_at, updated_at) values (?, ?, 'chat', 'Home', '{}', 0, ?, ?)",
      )
      .run(id, PROFILE, NOW, NOW);
  const add = database.prepare(
    "insert into assistant_messages (id, profile_id, role, kind, author, text, attachments, chat_id, embeds, created_at, updated_at) values (?, ?, ?, 'text', ?, ?, ?, ?, ?, ?, ?)",
  );
  const photo = JSON.stringify([
    { id: PHOTO, name: 'a.png', mime: 'image/png', bytes: 5, width: 1, height: 1 },
  ]);
  add.run(
    HELPER_REPLY,
    PROFILE,
    'responder',
    'Nova',
    'The  layout\nis ready',
    photo,
    CHAT,
    dialogue('from_helper', null),
    NOW,
    NOW,
  );
  add.run(
    ASKED,
    PROFILE,
    'person',
    'Ann',
    'How is it?',
    '[]',
    CHAT,
    dialogue('to_helper', HELPER_REPLY),
    NOW,
    NOW,
  );
  add.run(
    GONE,
    PROFILE,
    'person',
    'Ann',
    'Still there?',
    '[]',
    CHAT,
    dialogue('to_helper', PLAIN),
    NOW,
    NOW,
  );
  add.run(PLAIN, PROFILE, 'person', 'Ann', 'hello', '[]', CHAT, '[]', NOW, NOW);
  return database;
}

function migrated(database: DatabaseSync): Map<string, z.output<typeof MIGRATED>> {
  const rows = z
    .array(MIGRATED)
    .parse(database.prepare('select id, embeds, quote from assistant_messages').all());
  return new Map(rows.map((row) => [row.id, row]));
}

describe('message quotes migration', () => {
  it('turns each helper reply quote into a structured quote and drops the old field', () => {
    const database = seedBefore();
    migrate(new Sql(database), MIGRATIONS, NOW, testLogger());
    const rows = migrated(database);
    const asked = rows.get(ASKED);
    expect(JSON.parse(asked?.quote ?? 'null')).toEqual({
      message_id: HELPER_REPLY,
      author: 'Nova',
      excerpt: 'The layout is ready',
      media_kind: 'image',
    });
    expect(JSON.parse(asked?.embeds ?? '[]')).toEqual([
      {
        kind: 'helper_dialogue',
        direction: 'to_helper',
        helper_chat_id: HELPER,
        helper_name: 'Nova',
      },
    ]);
    expect(JSON.parse(rows.get(HELPER_REPLY)?.embeds ?? '[]')).toEqual([
      {
        kind: 'helper_dialogue',
        direction: 'from_helper',
        helper_chat_id: HELPER,
        helper_name: 'Nova',
      },
    ]);
    expect(rows.get(HELPER_REPLY)?.quote).toBeNull();
    database.close();
  });

  it('quotes a message that still exists and leaves other rows untouched', () => {
    const database = seedBefore();
    migrate(new Sql(database), MIGRATIONS, NOW, testLogger());
    const rows = migrated(database);
    expect(JSON.parse(rows.get(GONE)?.quote ?? 'null')).toMatchObject({
      message_id: PLAIN,
      excerpt: 'hello',
      media_kind: null,
    });
    expect(rows.get(PLAIN)).toMatchObject({ embeds: '[]', quote: null });
    database.close();
  });
});
