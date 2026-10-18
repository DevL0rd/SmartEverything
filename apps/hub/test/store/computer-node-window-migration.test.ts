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
const DEVICE = '0e000000-0000-4000-8000-0000000000d1';
const NAMED = z.object({ name: z.string() });
const NODE_ROW = z.object({
  device_id: z.string(),
  token_hash: z.string(),
  window_client_id: z.null(),
});

let directory: string;
let path: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-node-window-'));
  path = join(directory, 'hub.db');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function seedBefore(): void {
  const database = new DatabaseSync(path);
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version <= 89),
    NOW,
    testLogger(),
  );
  database
    .prepare(
      "insert into devices (id, provider, external_id, kind, name, model, manufacturer, online, capabilities, details, created_at, updated_at) values (?, 'local', 'computer:aa', 'computer', 'Desk', 'm', 'v', 0, '[]', '{}', ?, ?)",
    )
    .run(DEVICE, NOW, NOW);
  database
    .prepare(
      "insert into computer_nodes (device_id, machine_id, token_hash, hub_url, paired_at, revoked_at, mcp_token_hash) values (?, ?, 'hash', 'https://hub.example', ?, null, 'legacy')",
    )
    .run(DEVICE, 'a'.repeat(32), NOW);
  database.close();
}

describe('migrating a schema-89 database to computer pairings with a window credential', () => {
  it('keeps every paired computer, drops the legacy token column and adds the window link', () => {
    seedBefore();

    openStore({ path, log: testLogger(), now: () => new Date(NOW), systemTimeZone: 'UTC' }).close();

    const migrated = new DatabaseSync(path);
    const columns = z
      .array(NAMED)
      .parse(migrated.prepare("select name from pragma_table_info('computer_nodes')").all())
      .map((column) => column.name);
    expect(columns).not.toContain('mcp_token_hash');
    expect(columns).toContain('window_client_id');
    expect(
      z
        .array(NODE_ROW)
        .parse(
          migrated
            .prepare('select device_id, token_hash, window_client_id from computer_nodes')
            .all(),
        ),
    ).toStrictEqual([{ device_id: DEVICE, token_hash: 'hash', window_client_id: null }]);
    migrated.close();
  });
});
