import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ASSISTANT_SETTINGS, JSON_VALUE } from '@smarteverything/domain';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { SUBAGENT_MODEL_CHOICE_DROP_MIGRATION } from '../../src/store/migrations/subagent-model-choice-drop';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-10-25T09:00:00.000Z';
const ROW = z.object({ settings: z.string() });

let database: DatabaseSync;

beforeEach(() => {
  database = new DatabaseSync(':memory:');
  migrate(
    new Sql(database),
    MIGRATIONS.filter(
      (migration) => migration.version < SUBAGENT_MODEL_CHOICE_DROP_MIGRATION.version,
    ),
    NOW,
    testLogger(),
  );
});

afterEach(() => {
  database.close();
});

function stored(settings: unknown): void {
  database
    .prepare('insert into assistant_settings (id, settings, updated_at) values (1, ?, ?)')
    .run(JSON.stringify(settings), NOW);
}

function settings(): unknown {
  const row = ROW.parse(database.prepare('select settings from assistant_settings').get());
  return JSON_VALUE.parse(JSON.parse(row.settings));
}

describe('dropping the helper model choice setting', () => {
  it('removes the stored flag and keeps the helper capacity', () => {
    stored({ agent_loops: { subagents: { max_depth: 2, max_active: 5, model_choice: true } } });

    migrate(new Sql(database), MIGRATIONS, NOW, testLogger());

    expect(settings()).toStrictEqual({
      agent_loops: { subagents: { max_depth: 2, max_active: 5 } },
    });
    expect(ASSISTANT_SETTINGS.safeParse(settings()).success).toBe(true);
  });

  it('leaves settings without the flag unchanged', () => {
    stored({ agent_loops: { subagents: {} } });

    migrate(new Sql(database), MIGRATIONS, NOW, testLogger());

    expect(settings()).toStrictEqual({ agent_loops: { subagents: {} } });
  });
});
