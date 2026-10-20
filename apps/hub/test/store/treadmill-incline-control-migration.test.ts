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

const NOW = '2026-10-19T10:07:01.388Z';
const VERSION =
  MIGRATIONS.find((migration) => migration.name === 'drop_incline_control')?.version ?? 0;
const STORED = z.object({ config: z.string() });
const CONFIG = z.object({ settings: z.record(z.string(), z.unknown()) });

let directory: string;
let path: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-treadmill-incline-control-'));
  path = join(directory, 'hub.db');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function seedBefore(): void {
  const database = new DatabaseSync(path);
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version < VERSION),
    NOW,
    testLogger(),
  );
  database
    .prepare(
      `insert into local_devices (external_id, driver, address, name, config, created_at)
       values ('g15', 'kingsmith_treadmill', 'AA:BB', 'G15', ?, ?)`,
    )
    .run(
      JSON.stringify({
        settings: { stayConnected: true, inclineControl: { status: 'unproven' } },
      }),
      NOW,
    );
  database.close();
}

describe('removing the stored one-time incline check result', () => {
  it('drops inclineControl and keeps the other treadmill settings', () => {
    seedBefore();

    openStore({ path, log: testLogger(), now: () => new Date(NOW), systemTimeZone: 'UTC' }).close();

    const database = new DatabaseSync(path);
    const row = STORED.parse(
      database.prepare("select config from local_devices where external_id = 'g15'").get(),
    );
    database.close();
    expect(CONFIG.parse(JSON.parse(row.config)).settings).toEqual({ stayConnected: true });
  });
});
