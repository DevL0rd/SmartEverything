import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { QUOTE_EXCERPTS_MIGRATION } from '../../src/store/migrations/quote-excerpts';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-07T09:00:00.000Z';
const PROFILE = '0e000000-0000-4000-8000-0000000000f1';
const CHAT = '0e000000-0000-4000-8000-0000000000c1';
const REPLY = '0e000000-0000-4000-8000-0000000000a1';
const QUOTING = '0e000000-0000-4000-8000-0000000000a2';
const ORPHAN = '0e000000-0000-4000-8000-0000000000a3';
const EDITED = '0e000000-0000-4000-8000-0000000000a4';
const QUOTING_EDITED = '0e000000-0000-4000-8000-0000000000a5';
const PLAIN = '0e000000-0000-4000-8000-0000000000a6';
const GONE = '0e000000-0000-4000-8000-0000000000b9';

const REPLY_TEXT = 'Three that fit:\n1. **Hue Filament Globe**: 2200 K\n2. *Tradfri* globe';

let directory: string;
let path: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-quote-excerpts-'));
  path = join(directory, 'hub.db');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function quoteOf(id: string, excerpt: string): string {
  return JSON.stringify({ message_id: id, author: 'Assistant', excerpt, media_kind: null });
}

function seedBefore(): DatabaseSync {
  const database = new DatabaseSync(path);
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version < QUOTE_EXCERPTS_MIGRATION.version),
    NOW,
    testLogger(),
  );
  database
    .prepare(
      "insert into profiles (id, name, colour, fitness_goals, position, created_at, updated_at) values (?, 'Ann', 'amber', '{}', 0, ?, ?)",
    )
    .run(PROFILE, NOW, NOW);
  database
    .prepare(
      "insert into ai_chats (id, profile_id, kind, title, engine, pinned, created_at, updated_at) values (?, ?, 'chat', 'Home', '{}', 0, ?, ?)",
    )
    .run(CHAT, PROFILE, NOW, NOW);
  const add = database.prepare(
    "insert into assistant_messages (id, profile_id, role, kind, author, text, attachments, chat_id, embeds, quote, created_at, updated_at) values (?, ?, ?, 'text', ?, ?, '[]', ?, '[]', ?, ?, ?)",
  );
  const row = (id: string, author: string, text: string, quote: string | null): void => {
    add.run(
      id,
      PROFILE,
      author === 'Ann' ? 'person' : 'responder',
      author,
      text,
      CHAT,
      quote,
      NOW,
      NOW,
    );
  };
  row(REPLY, 'Assistant', REPLY_TEXT, null);
  row(QUOTING, 'Ann', 'Which is warmest?', quoteOf(REPLY, REPLY_TEXT.replace(/\s+/g, ' ')));
  row(ORPHAN, 'Ann', 'And that one?', quoteOf(GONE, 'Use **two** of `them`'));
  row(EDITED, 'Assistant', 'Something else now', null);
  row(QUOTING_EDITED, 'Ann', 'Ok', quoteOf(EDITED, 'Was **bold** before'));
  row(PLAIN, 'Ann', 'Thanks', quoteOf(REPLY, 'already plain'));
  return database;
}

function excerpts(database: DatabaseSync): ReadonlyMap<string, string> {
  const rows = z
    .array(z.object({ id: z.string(), quote: z.string() }))
    .parse(
      database.prepare('select id, quote from assistant_messages where quote is not null').all(),
    );
  return new Map(
    rows.map((row) => [
      row.id,
      z.object({ excerpt: z.string() }).parse(JSON.parse(row.quote)).excerpt,
    ]),
  );
}

describe('quote excerpts migration', () => {
  it('stores every quote excerpt as plain text once', () => {
    const database = seedBefore();
    migrate(new Sql(database), MIGRATIONS, NOW, testLogger());
    expect(Object.fromEntries(excerpts(database))).toEqual({
      [QUOTING]: 'Three that fit: Hue Filament Globe: 2200 K · Tradfri globe',
      [ORPHAN]: 'Use two of them',
      [QUOTING_EDITED]: 'Was bold before',
      [PLAIN]: 'already plain',
    });
    database.close();
  });
});
