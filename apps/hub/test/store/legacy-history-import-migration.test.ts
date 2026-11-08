import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DSH_SESSION_EVENTS_WRITE } from '@smarteverything/domain';
import { readNativeHistory } from '@smarteverything/harness/process';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { LEGACY_HISTORY_IMPORT_MIGRATION } from '../../src/store/migrations/legacy-history-import';
import { validateNativeAppend } from '../../src/store/repositories/dsh-session-event-validation';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-10-25T10:00:00.000Z';
const BEFORE = MIGRATIONS.filter(
  (migration) => migration.version < LEGACY_HISTORY_IMPORT_MIGRATION.version,
);
const ENGINE = z.object({ kind: z.string(), session_id: z.string().nullable() });
const SESSION = z.object({ session_id: z.string(), header: z.string(), next_seq: z.number() });
const EVENT = z.object({
  event: z.string().transform((text): unknown => z.json().parse(JSON.parse(text))),
});
const TIMELINE = {
  kind: 'chat_timeline',
  version: 1,
  parts: [
    { kind: 'reasoning', key: 'r', text: 'Thinking.' },
    { kind: 'text', key: 't', text: 'Looking.' },
    {
      kind: 'tool',
      key: 'c',
      tool: {
        callId: 'call-1',
        name: 'read',
        title: 'read',
        state: 'done',
        detail: 'contents of a',
        input: '{"path":"a"}',
        output: 'contents of a',
      },
    },
    { kind: 'text', key: 'u', text: 'Done.' },
  ],
};

interface Seeded {
  readonly database: DatabaseSync;
  readonly profile: string;
}

function seeded(): Seeded {
  captureLogs();
  const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  migrate(new Sql(database), BEFORE, NOW, testLogger());
  const profile = randomUUID();
  database
    .prepare(
      `insert into profiles (id, name, colour, fitness_goals, position, created_at, updated_at) values (?, 'Ann', 'amber', '{}', 0, ?, ?)`,
    )
    .run(profile, NOW, NOW);
  return { database, profile };
}

function chat(
  { database, profile }: Seeded,
  engine: object,
  created = '2026-10-01T10:00:00.000Z',
): string {
  const id = randomUUID();
  database
    .prepare(
      `insert into ai_chats (id, profile_id, kind, title, engine, pinned, created_at, updated_at) values (?, ?, 'chat', 'Home', ?, 0, ?, ?)`,
    )
    .run(id, profile, JSON.stringify(engine), created, created);
  return id;
}

function message(
  { database, profile }: Seeded,
  chatId: string,
  input: {
    readonly role: 'person' | 'responder';
    readonly text: string;
    readonly at: string;
    readonly state?: string;
    readonly embeds?: readonly object[];
  },
): string {
  const id = randomUUID();
  database
    .prepare(
      `insert into assistant_messages (id, profile_id, role, kind, author, text, attachments, state, steps, step_states, chat_id, embeds, model, created_at, updated_at)
       values (?, ?, ?, 'text', ?, ?, '[]', ?, '[]', '[]', ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      profile,
      input.role,
      input.role === 'person' ? 'Ann' : 'Assistant',
      input.text,
      input.state ?? 'answered',
      chatId,
      JSON.stringify(input.embeds ?? []),
      input.role === 'responder' ? 'model-a' : null,
      input.at,
      input.at,
    );
  return id;
}

function conversation(seed: Seeded, chatId: string): void {
  message(seed, chatId, { role: 'person', text: 'work', at: '2026-10-01T10:01:00.000Z' });
  message(seed, chatId, {
    role: 'responder',
    text: 'Looking.Done.',
    at: '2026-10-01T10:02:00.000Z',
    embeds: [TIMELINE],
  });
  message(seed, chatId, {
    role: 'person',
    text: 'summary of the earlier talk',
    at: '2026-10-01T10:02:30.000Z',
    embeds: [{ kind: 'compaction', through_at: '2026-10-01T10:02:00.000Z' }],
  });
  message(seed, chatId, {
    role: 'person',
    text: 'still running',
    at: '2026-10-01T10:03:00.000Z',
    state: 'working',
  });
}

function sessions(database: DatabaseSync): z.infer<typeof SESSION>[] {
  return database
    .prepare('select session_id, header, next_seq from dsh_sessions')
    .all()
    .map((row) => SESSION.parse(row));
}

function eventsOf(database: DatabaseSync, id: string): unknown[] {
  return database
    .prepare('select event from dsh_session_events where session_id = ? order by seq')
    .all(id)
    .map((row) => EVENT.parse(row).event);
}

function engineOf(database: DatabaseSync, id: string): z.infer<typeof ENGINE> {
  const row = z
    .object({ engine: z.string() })
    .parse(database.prepare('select engine from ai_chats where id = ?').get(id));
  return ENGINE.parse(JSON.parse(row.engine));
}

describe('the legacy history migration', () => {
  it('has its own version, after every migration before it', () => {
    expect(new Set(MIGRATIONS.map((migration) => migration.version)).size).toBe(MIGRATIONS.length);
    const position = MIGRATIONS.indexOf(LEGACY_HISTORY_IMPORT_MIGRATION);
    expect(position).toBeGreaterThan(-1);
    expect(
      MIGRATIONS.slice(0, position).every(
        (migration) => migration.version < LEGACY_HISTORY_IMPORT_MIGRATION.version,
      ),
    ).toBe(true);
  });

  it('gives a chat with no native session one that carries its settled history', () => {
    const seed = seeded();
    const id = chat(seed, { kind: 'dsh', session_id: null });
    conversation(seed, id);

    migrate(new Sql(seed.database), MIGRATIONS, NOW, testLogger());

    const [session] = sessions(seed.database);
    expect(sessions(seed.database)).toHaveLength(1);
    expect(engineOf(seed.database, id).session_id).toBe(session?.session_id);
    const events = eventsOf(seed.database, session?.session_id ?? '');
    expect(events).toHaveLength(session?.next_seq ?? -1);
    const history = readNativeHistory(JSON.parse(session?.header ?? '{}'), events);
    const types: string[] = history.map((event) => event.type);
    expect(types.filter((type) => type === 'plugin:smarteverything/legacy-message')).toHaveLength(
      3,
    );
    expect(types).toContain('tool/call');
    expect(types).toContain('tool/result');
    expect(() => {
      validateNativeAppend(
        {
          sessionId: session?.session_id ?? '',
          from: 0,
          events: DSH_SESSION_EVENTS_WRITE.parse(events),
          stored: () => undefined,
        },
        { nodes: [] },
      );
    }).not.toThrow();
    expect(JSON.stringify(history)).toContain('Looking.');
    expect(JSON.stringify(history)).not.toContain('still running');
  });

  it('fills a native session that exists but was never written to', () => {
    const seed = seeded();
    const id = chat(seed, { kind: 'dsh', session_id: null });
    conversation(seed, id);
    const sessionId = randomUUID();
    seed.database
      .prepare(
        `insert into dsh_sessions (session_id, chat_id, profile_id, header, inherited_event_count, next_seq, epoch, claim, created_at)
         values (?, ?, ?, ?, 0, 0, 0, null, ?)`,
      )
      .run(
        sessionId,
        id,
        seed.profile,
        JSON.stringify({ version: 4, id: sessionId, createdAt: 1, cwd: '/tmp/x', isSeeded: false }),
        NOW,
      );
    seed.database
      .prepare(`update ai_chats set engine = ? where id = ?`)
      .run(JSON.stringify({ kind: 'dsh', session_id: sessionId }), id);

    migrate(new Sql(seed.database), MIGRATIONS, NOW, testLogger());

    expect(sessions(seed.database)).toHaveLength(1);
    expect(sessions(seed.database)[0]?.next_seq).toBeGreaterThan(0);
    expect(JSON.parse(sessions(seed.database)[0]?.header ?? '{}')).toMatchObject({ cwd: '/tmp/x' });
  });

  it('leaves a chat that already has native history, a fork and other engines alone', () => {
    const seed = seeded();
    const written = chat(seed, { kind: 'dsh', session_id: null });
    conversation(seed, written);
    const sessionId = randomUUID();
    seed.database
      .prepare(
        `insert into dsh_sessions (session_id, chat_id, profile_id, header, inherited_event_count, next_seq, epoch, claim, created_at)
         values (?, ?, ?, ?, 0, 3, 0, null, ?)`,
      )
      .run(
        sessionId,
        written,
        seed.profile,
        JSON.stringify({ version: 4, id: sessionId, createdAt: 1, isSeeded: false }),
        NOW,
      );
    seed.database
      .prepare(`update ai_chats set engine = ? where id = ?`)
      .run(JSON.stringify({ kind: 'dsh', session_id: sessionId }), written);
    const computer = chat(seed, { kind: 'claude', session_id: null });
    conversation(seed, computer);
    const empty = chat(seed, { kind: 'dsh', session_id: null });

    migrate(new Sql(seed.database), MIGRATIONS, NOW, testLogger());

    expect(sessions(seed.database).map((session) => session.session_id)).toStrictEqual([sessionId]);
    expect(engineOf(seed.database, computer).session_id).toBeNull();
    expect(engineOf(seed.database, empty).session_id).toBeNull();
  });
});
