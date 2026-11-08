import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { NATIVE_CHAT_ADMISSION_MIGRATION } from '../../src/store/migrations/native-chat-admission';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';
import { CLAUDE_TEST_ENGINE, TEST_ENGINE } from '../support/engine';

const NOW = '2026-11-05T00:00:00.000Z';

it('persists retirement for legacy native roots, imported helpers and their same-profile descendants', () => {
  const database = new DatabaseSync(':memory:');
  try {
    const sql = new Sql(database);
    const logger = testLogger();
    migrate(
      sql,
      MIGRATIONS.filter((migration) => migration.version < NATIVE_CHAT_ADMISSION_MIGRATION.version),
      NOW,
      logger,
    );
    const profile = randomUUID();
    database
      .prepare(
        "insert into profiles (id, name, colour, fitness_goals, position, created_at, updated_at) values (?, 'Owner', 'amber', '{}', 0, ?, ?)",
      )
      .run(profile, NOW, NOW);
    const insert = database.prepare(
      'insert into ai_chats (id, profile_id, kind, title, parent_id, engine, pinned, created_at, updated_at) values (?, ?, ?, ?, ?, ?, 0, ?, ?)',
    );
    insert.run(
      'coordinator',
      profile,
      'chat',
      'Coordinator',
      null,
      JSON.stringify(TEST_ENGINE),
      NOW,
      NOW,
    );
    insert.run(
      'native',
      profile,
      'chat',
      'Legacy native',
      null,
      JSON.stringify(CLAUDE_TEST_ENGINE),
      NOW,
      NOW,
    );
    insert.run(
      'ordinary-helper',
      profile,
      'subagent',
      'Ordinary helper',
      'coordinator',
      JSON.stringify(CLAUDE_TEST_ENGINE),
      NOW,
      NOW,
    );
    const imported = { ...CLAUDE_TEST_ENGINE, continued_from: randomUUID() };
    insert.run(
      'imported',
      profile,
      'subagent',
      'Imported helper',
      'coordinator',
      JSON.stringify(imported),
      NOW,
      NOW,
    );
    insert.run(
      'native-descendant',
      profile,
      'chat',
      'Legacy branch',
      'native',
      JSON.stringify(TEST_ENGINE),
      NOW,
      NOW,
    );
    insert.run(
      'import-descendant',
      profile,
      'subagent',
      'Legacy helper',
      'imported',
      JSON.stringify(TEST_ENGINE),
      NOW,
      NOW,
    );

    migrate(sql, MIGRATIONS, NOW, logger);

    const retired = database
      .prepare("select id from ai_chats where native_admission = 'retired' order by id")
      .all();
    expect(retired).toEqual(
      ['import-descendant', 'imported', 'native', 'native-descendant'].map((id) => ({ id })),
    );
    const saved = database
      .prepare("select title, engine from ai_chats where id = 'imported'")
      .get();
    expect(saved).toEqual({ title: 'Imported helper', engine: JSON.stringify(imported) });
  } finally {
    database.close();
  }
});
