import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { PLANNER_CLOCK_WAVE2_MIGRATION } from '../../src/store/migrations/planner-clock-wave2';
import { Sql } from '../../src/store/sql';
import { openStore } from '../../src/store/store';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import { TEST_ENGINE } from '../support/engine';
import { unusedDrivePath } from '../support/store';

const SESSION = '0d000000-0000-4000-8000-000000000001';
const NOW = '2026-10-16T09:00:00.000Z';
const HEAD = Math.max(...MIGRATIONS.map((migration) => migration.version));
const LIVE = 80;
const COUNT = z.object({ count: z.number() });
const NAMED = z.object({ name: z.string() });
const LINE = z.object({ id: z.number(), text: z.string() });
const SEQ = z.object({ seq: z.number() });

let directory: string;
let path: string;
let logs: CapturedLogs;

beforeEach(async () => {
  logs = captureLogs();
  directory = await mkdtemp(join(tmpdir(), 'hub-migrations-'));
  path = join(directory, 'hub.db');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function build(version: number): DatabaseSync {
  const database = new DatabaseSync(path, { enableForeignKeyConstraints: true });
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version <= version),
    NOW,
    testLogger(),
  );
  return database;
}

function seedLive(database: DatabaseSync): void {
  database
    .prepare(
      "insert into transcript_sessions (id, source, source_id, title, started_at) values (?, 'camera', 'cam', 'Hall', ?)",
    )
    .run(SESSION, NOW);
  const add = database.prepare(
    "insert into transcript_lines (id, session_id, at, speaker, text, timing) values (?, ?, ?, 'Ann', ?, 'wall_clock')",
  );
  for (const id of [1, 2, 3, 4, 5]) add.run(id, SESSION, NOW, `line ${String(id)} kettle`);
  database.prepare('delete from transcript_lines where id in (4, 5)').run();
  database.prepare('update transcript_line_sequence set next_id = 6').run();
  database.prepare("insert into rooms (id, name, position) values ('r1', 'Hall', 0)").run();
}

function tableCounts(database: DatabaseSync, skip: readonly string[]): Record<string, number> {
  const names = z
    .array(NAMED)
    .parse(
      database
        .prepare(
          "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like 'transcript_lines_search%' and sql not like 'create virtual%' order by name",
        )
        .all(),
    )
    .map((row) => row.name)
    .filter((name) => !skip.includes(name));
  return Object.fromEntries(
    names.map((name) => [
      name,
      COUNT.parse(database.prepare(`select count(*) as count from "${name}"`).get()).count,
    ]),
  );
}

function open(): ReturnType<typeof openStore> {
  return openStore({
    path,
    log: testLogger(),
    now: () => new Date(NOW),
    systemTimeZone: 'UTC',
    drivePathOf: unusedDrivePath,
  });
}

describe('migrating a live schema-80 database', () => {
  it('backs the database up first, reaches head, then discards the backup with every row and foreign key intact', () => {
    const before = build(LIVE);
    seedLive(before);
    const counts = tableCounts(before, ['transcript_line_sequence']);
    before.close();

    const store = open();
    store.close();

    const migrated = new DatabaseSync(path);
    expect(
      COUNT.parse(migrated.prepare('select max(version) as count from schema_version').get()).count,
    ).toBe(HEAD);
    const after = tableCounts(migrated, []);
    expect([after['rooms'], after['transcript_sessions'], after['transcript_lines']]).toStrictEqual(
      [counts['rooms'], counts['transcript_sessions'], counts['transcript_lines']],
    );
    expect(Object.keys(counts).filter((name) => !(name in after))).toStrictEqual([
      'ai_preview_projects',
      'automation_sequences',
      'dsh_session_claim_receipts',
      'harness_admissions',
      'harness_children',
      'harness_consumers',
      'harness_openings',
      'harness_outbox',
      'harness_skill_presentations',
      'preview_error_rules',
      'scenes',
    ]);
    expect(migrated.prepare('pragma foreign_key_check').all()).toStrictEqual([]);
    expect(
      z
        .array(LINE)
        .parse(migrated.prepare('select id, text from transcript_lines order by id').all()),
    ).toStrictEqual([1, 2, 3].map((id) => ({ id, text: `line ${String(id)} kettle` })));
    migrated.close();
    const [saved] = logs.records.filter((record) => record.event === 'store.backed_up');
    expect(saved?.payload).toMatchObject({ from: LIVE, to: HEAD });
    expect(logs.events()).toContain('store.backup_discarded');
    expect(readdirSync(directory).filter((name) => name.endsWith('.sqlite'))).toStrictEqual([]);
  });

  it('never reuses transcript ids that were deleted before the rebuild and keeps search working', () => {
    const before = build(LIVE);
    seedLive(before);
    before.close();
    const store = open();
    const added = store.transcripts.append(SESSION, {
      at: NOW,
      speaker_id: null,
      speaker: 'Bob',
      text: 'fresh kettle',
      bot: false,
    });
    expect(added.id).toBe(6);
    store.transcripts.append(SESSION, {
      at: NOW,
      speaker_id: null,
      speaker: 'Bob',
      text: 'second',
      bot: false,
    });
    store.close();
    const database = new DatabaseSync(path);
    expect(
      z
        .array(SEQ)
        .parse(
          database.prepare("select seq from sqlite_sequence where name = 'transcript_lines'").all(),
        ),
    ).toStrictEqual([{ seq: 7 }]);
    expect(
      COUNT.parse(
        database
          .prepare(
            "select count(*) as count from transcript_lines_search where transcript_lines_search match 'kettle'",
          )
          .get(),
      ).count,
    ).toBe(4);
    database.close();
  });

  it('issues strictly increasing speech commit ids without keeping rows', () => {
    build(LIVE).close();
    const store = open();
    expect(store.speech.watermark()).toBe(0);
    const issued = [
      store.speech.nextCommit(),
      store.speech.nextCommit(),
      store.speech.nextCommit(),
    ];
    expect(issued).toStrictEqual([1, 2, 3]);
    expect(store.speech.watermark()).toBe(3);
    store.close();
    const database = new DatabaseSync(path);
    expect(
      COUNT.parse(database.prepare('select count(*) as count from speech_commits').get()).count,
    ).toBe(0);
    database.close();
    const reopened = open();
    expect(reopened.speech.nextCommit()).toBe(4);
    reopened.close();
  });
});

describe('migrating a schema-84 database to unbounded text', () => {
  const PROFILE = '0f000000-0000-4000-8000-000000000001';
  const FIRST = '0f000000-0000-4000-8000-0000000000a1';
  const SECOND = '0f000000-0000-4000-8000-0000000000a2';
  const MESSAGE_TEXT = z.object({ id: z.string(), text: z.string() });

  function seedBounded(database: DatabaseSync): void {
    database
      .prepare(
        "insert into profiles (id, name, colour, fitness_goals, position, created_at, updated_at) values (?, 'Ann', 'amber', '{}', 0, ?, ?)",
      )
      .run(PROFILE, NOW, NOW);
    const add = database.prepare(
      "insert into assistant_messages (id, profile_id, role, kind, author, text, created_at, updated_at, reply_to) values (?, ?, 'responder', 'text', 'Jarvis', ?, ?, ?, ?)",
    );
    add.run(FIRST, PROFILE, 'x'.repeat(16000), NOW, NOW, null);
    add.run(SECOND, PROFILE, 'second', NOW, NOW, FIRST);
    database
      .prepare(
        "insert into transcript_sessions (id, source, source_id, title, started_at) values (?, 'camera', 'cam', 'Hall', ?)",
      )
      .run(SESSION, NOW);
    database
      .prepare(
        "insert into transcript_lines (session_id, at, speaker, text, timing) values (?, ?, 'Ann', ?, 'wall_clock')",
      )
      .run(SESSION, NOW, 'y'.repeat(4000));
  }

  it('keeps every row, link and index, then stores a 100000-character message and a 20000-character line', () => {
    const before = build(84);
    seedBounded(before);
    expect(() =>
      before
        .prepare(
          "insert into assistant_messages (id, profile_id, role, kind, author, text, created_at, updated_at) values ('big', ?, 'responder', 'text', 'Jarvis', ?, ?, ?)",
        )
        .run(PROFILE, 'z'.repeat(16001), NOW, NOW),
    ).toThrow(/CHECK/);
    before.close();

    const store = open();
    const chat = store.aiChats.create({
      profileId: PROFILE,
      kind: 'chat',
      title: 'Home',
      icon: null,
      parentId: null,
      sourceKey: null,
      engine: TEST_ENGINE,
    });
    const message = store.assistantChat.addMessage({
      profile_id: PROFILE,
      client_id: null,
      chat_id: chat.id,
      role: 'responder',
      kind: 'text',
      author: 'Jarvis',
      text: 'z'.repeat(100_000),
      attachments: [],
      state: null,
      reason: null,
      steps: [],
      step_states: [],
      reply_to: SECOND,
      quote: null,
      origin: null,
      embeds: [],
      cost_micros: 0,
      model: null,
    });
    const line = store.transcripts.append(SESSION, {
      at: NOW,
      speaker_id: null,
      speaker: 'Bob',
      text: `${'w'.repeat(19_990)} marmalade`,
      bot: false,
    });
    expect(store.assistantChat.message(message.id).text.length).toBe(100_000);
    store.close();

    const database = new DatabaseSync(path, { enableForeignKeyConstraints: true });
    const messages = z
      .array(MESSAGE_TEXT)
      .parse(
        database
          .prepare('select id, text from assistant_messages order by created_at, rowid')
          .all(),
      );
    expect(messages.map((row) => [row.id, row.text.length])).toStrictEqual([
      [FIRST, 16000],
      [SECOND, 6],
      [message.id, 100_000],
    ]);
    expect(
      z
        .array(z.object({ reply_to: z.string().nullable() }))
        .parse(
          database.prepare('select reply_to from assistant_messages where id = ?').all(SECOND),
        ),
    ).toStrictEqual([{ reply_to: FIRST }]);
    expect(line.text.length).toBe(20_000);
    expect(
      COUNT.parse(
        database
          .prepare(
            "select count(*) as count from transcript_lines_search where transcript_lines_search match 'marmalade'",
          )
          .get(),
      ).count,
    ).toBe(1);
    expect(
      z
        .array(z.object({ length: z.number() }))
        .parse(
          database.prepare('select length(text) as length from transcript_lines order by id').all(),
        ),
    ).toStrictEqual([{ length: 4000 }, { length: 20_000 }]);
    expect(
      z
        .array(NAMED)
        .parse(
          database
            .prepare(
              "select name from sqlite_master where tbl_name in ('assistant_messages', 'transcript_lines') and type in ('index', 'trigger') and name not like 'sqlite_%' order by name",
            )
            .all(),
        )
        .map((row) => row.name),
    ).toStrictEqual([
      'assistant_messages_by_chat',
      'assistant_messages_by_client_message',
      'assistant_messages_by_profile',
      'assistant_messages_working',
      'transcript_lines_added',
      'transcript_lines_removed',
      'transcript_lines_session',
      'transcript_lines_session_time',
      'transcript_lines_time',
    ]);
    expect(database.prepare('pragma foreign_key_check').all()).toStrictEqual([]);
    database.close();
  });
});

describe('migration backups', () => {
  it('takes no backup for a new database or one already at head', () => {
    open().close();
    open().close();
    expect(readdirSync(directory).filter((name) => name.endsWith('.sqlite'))).toStrictEqual([]);
    expect(logs.events()).not.toContain('store.backed_up');
  });

  it('discards every pre-migration copy once the new schema has started', () => {
    for (const name of [
      'hub.db.v10-before-v20.sqlite',
      'hub.db.v40-before-v50.sqlite',
      'other.db.v1-before-v2.sqlite',
    ]) {
      writeFileSync(join(directory, name), 'x');
    }
    build(LIVE).close();
    open().close();
    expect(readdirSync(directory).filter((name) => name.endsWith('.sqlite'))).toStrictEqual([
      'other.db.v1-before-v2.sqlite',
    ]);
  });

  it('migrates nothing when the backup cannot be written', () => {
    build(LIVE).close();
    mkdirSync(`${path}.v${String(LIVE)}-before-v${String(HEAD)}.sqlite`);
    expect(() => open()).toThrow(/could not be backed up/);
    expect(readdirSync(directory).filter((name) => name.endsWith('.partial'))).toStrictEqual([]);
    const database = new DatabaseSync(path);
    expect(
      COUNT.parse(database.prepare('select max(version) as count from schema_version').get()).count,
    ).toBe(LIVE);
    database.close();
  });

  it('keeps the copy while a start fails and discards it after the next healthy start', () => {
    build(LIVE).close();
    const database = new DatabaseSync(path, { enableForeignKeyConstraints: true });
    expect(() =>
      migrate(
        new Sql(database),
        [
          ...MIGRATIONS,
          { version: HEAD + 1, name: 'broken', statements: ['select * from nowhere'] },
        ],
        NOW,
        testLogger(),
      ),
    ).toThrow();
    database.close();
    const copy = `${path}.v${String(LIVE)}-before-v${String(HEAD + 1)}.sqlite`;
    expect(readdirSync(directory)).toContain(basename(copy));
    const kept = new DatabaseSync(copy);
    expect(
      COUNT.parse(kept.prepare('select max(version) as count from schema_version').get()).count,
    ).toBe(LIVE);
    kept.close();
    open().close();
    expect(readdirSync(directory).filter((name) => name.endsWith('.sqlite'))).toStrictEqual([]);
  });
});

describe('migrating planner alarms and preferences to the clock wave 2 shapes', () => {
  const PROFILE = '0d000000-0000-4000-8000-0000000000a1';
  const OLD_LISTS = [
    'today',
    'upcoming',
    'overdue',
    'device_tasks',
    'habits',
    'someday',
    'completed',
  ];
  const COLUMN = z.object({ value: z.string().nullable() });

  function oldPreferences(sound: string, smartLists: readonly string[]): string {
    return JSON.stringify({
      general: { week_start: 1 },
      tasks: { default_collection_id: null, smart_lists: smartLists, suggest_completion: true },
      clock: {
        sound,
        ramp_seconds: 30,
        snooze_minutes: 9,
        targets: [],
        wake_scene_id: null,
        world_clocks: [],
      },
      watch: { watch_alarm_sync: true, watch_calendar_push: true },
    });
  }

  function seedOld(database: DatabaseSync): void {
    database
      .prepare(
        "insert into profiles (id, name, colour, fitness_goals, created_at, updated_at) values (?, 'Ann', 'aqua', '{}', ?, ?)",
      )
      .run(PROFILE, NOW, NOW);
    const alarm = database.prepare(
      `insert into planner_alarms (id, profile_id, label, time, days, once_on, skip_on, enabled, sound,
        ramp_seconds, vibrate, snooze_minutes, smart_minutes, wake_scene_id, wake_lead_minutes, targets,
        watch, source, created_at, updated_at)
       values (?, ?, null, '07:00', '[1,2]', null, null, 1, ?, 30, 1, 9, null, null, null, '[]', '[]', 'planner', ?, ?)`,
    );
    alarm.run('a1', PROFILE, 'sunrise', NOW, NOW);
    alarm.run('a2', PROFILE, 'default', NOW, NOW);
    database
      .prepare(
        'insert into planner_preferences (profile_id, preferences, updated_at) values (?, ?, ?)',
      )
      .run(PROFILE, oldPreferences('dawn', OLD_LISTS), NOW);
  }

  function value(database: DatabaseSync, query: string): string | null {
    return COLUMN.parse(database.prepare(query).get()).value;
  }

  function migrated(): DatabaseSync {
    const database = new DatabaseSync(path, { enableForeignKeyConstraints: true });
    const before = MIGRATIONS.filter(
      (migration) => migration.version < PLANNER_CLOCK_WAVE2_MIGRATION.version,
    );
    migrate(new Sql(database), before, NOW, testLogger());
    seedOld(database);
    migrate(new Sql(database), MIGRATIONS, NOW, testLogger());
    return database;
  }

  it('rewrites every stored alarm sound to a tone once and gives the new columns their defaults', () => {
    const database = migrated();
    expect(value(database, "select sound as value from planner_alarms where id = 'a1'")).toBe(
      '{"kind":"tone","id":"sunrise"}',
    );
    expect(value(database, "select sound as value from planner_alarms where id = 'a2'")).toBe(
      '{"kind":"tone","id":"default"}',
    );
    expect(value(database, "select challenge as value from planner_alarms where id = 'a1'")).toBe(
      '{"kind":"none"}',
    );
    expect(
      value(database, "select snooze_limit as value from planner_alarms where id = 'a1'"),
    ).toBeNull();
    expect(
      value(database, "select sunrise as value from planner_alarms where id = 'a1'"),
    ).toBeNull();
    database.close();
  });

  it('rewrites the stored preferences once and adds the bedtime and sleep sound sections', () => {
    const database = migrated();
    const read = (path: string): string | null =>
      value(
        database,
        `select cast(json_extract(preferences, '${path}') as text) as value from planner_preferences`,
      );
    expect(read('$.clock.sound')).toBe('{"kind":"tone","id":"dawn"}');
    expect(
      value(
        database,
        "select json_type(preferences, '$.clock.snooze_limit') as value from planner_preferences",
      ),
    ).toBe('null');
    expect(read('$.bedtime')).toBe(
      '{"enabled":false,"schedule":[],"reminder_minutes":30,"wind_down_minutes":30,"do_not_disturb":true,"sleep_sound":null,"wind_down_automation_id":null}',
    );
    expect(read('$.sleep_sounds')).toBe('{"sound":null,"timer_minutes":60,"fade_seconds":30}');
    expect(read('$.general.week_start')).toBe('1');
    database.close();
  });

  it('adds the assigned smart list to the default list only', () => {
    const database = migrated();
    expect(
      value(
        database,
        "select json_extract(preferences, '$.tasks.smart_lists') as value from planner_preferences",
      ),
    ).toBe(
      '["today","upcoming","overdue","assigned","device_tasks","habits","someday","completed"]',
    );
    database.close();
    rmSync(path);
    const custom = new DatabaseSync(path, { enableForeignKeyConstraints: true });
    migrate(
      new Sql(custom),
      MIGRATIONS.filter((migration) => migration.version < PLANNER_CLOCK_WAVE2_MIGRATION.version),
      NOW,
      testLogger(),
    );
    seedOld(custom);
    custom
      .prepare('update planner_preferences set preferences = ?')
      .run(oldPreferences('dawn', ['today', 'someday']));
    migrate(new Sql(custom), MIGRATIONS, NOW, testLogger());
    expect(
      value(
        custom,
        "select json_extract(preferences, '$.tasks.smart_lists') as value from planner_preferences",
      ),
    ).toBe('["today","someday"]');
    custom.close();
  });
});
