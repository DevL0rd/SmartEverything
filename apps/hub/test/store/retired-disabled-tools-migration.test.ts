import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { API_ENDPOINTS } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { Sql } from '../../src/store/sql';
import { openStore } from '../../src/store/store';
import { testLogger } from '../support/logs';

const NOW = '2026-10-17T09:00:00.000Z';

let directory: string;
let path: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-disabled-tools-'));
  path = join(directory, 'hub.db');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function seedBefore(disabled: readonly string[]): void {
  const database = new DatabaseSync(path);
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version <= 87),
    NOW,
    testLogger(),
  );
  database
    .prepare(
      'insert or ignore into settings (id, home_name, updated_at, mcp_disabled_tools) values (1, ?, ?, ?)',
    )
    .run('Home', NOW, JSON.stringify(disabled));
  database
    .prepare('update settings set mcp_disabled_tools = ? where id = 1')
    .run(JSON.stringify(disabled));
  database.close();
}

describe('migrating a schema-87 database with tools switched off under a retired name', () => {
  it('stores the current names so the app and the hub agree and the list can be saved again', () => {
    seedBefore(['remove_automation_value', 'stop_automation_runs', 'list_scenes', 'speak']);

    const store = openStore({
      path,
      log: testLogger(),
      now: () => new Date(NOW),
      systemTimeZone: 'UTC',
    });
    const stored = store.settings.read().mcp_disabled_tools;

    expect(stored).toStrictEqual(['edit_value', 'stop_automation', 'list_scenes', 'speak']);
    expect(API_ENDPOINTS.updateMcpTools.body.safeParse({ disabled: stored }).success).toBe(true);
    store.close();
  });

  it('drops a switched-off name that no tool answers to any more', () => {
    seedBefore(['create_automation_sequence', 'edit_value']);

    const store = openStore({
      path,
      log: testLogger(),
      now: () => new Date(NOW),
      systemTimeZone: 'UTC',
    });

    expect(store.settings.read().mcp_disabled_tools).toStrictEqual(['edit_value']);
    store.close();
  });
});
