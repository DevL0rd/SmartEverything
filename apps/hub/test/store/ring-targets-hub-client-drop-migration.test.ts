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
import { unusedDrivePath } from '../support/store';

const NOW = '2026-11-14T09:00:00.000Z';
const PROFILE = '0e000000-0000-4000-8000-0000000000a1';
const HUB = '0e000000-0000-4000-8000-0000000000b1';
const PHONE = '0e000000-0000-4000-8000-0000000000b2';
const WATCH = '0e000000-0000-4000-8000-0000000000c1';
const TARGETS = z.object({ targets: z.string() });
const PREFERENCES = z.object({ preferences: z.string() });

const HUB_TARGET = { kind: 'client', clientId: HUB };
const PHONE_TARGET = { kind: 'client', clientId: PHONE };
const WATCH_TARGET = { kind: 'device', deviceId: WATCH };

let directory: string;
let path: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-ring-targets-'));
  path = join(directory, 'hub.db');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function seedBefore(): void {
  const database = new DatabaseSync(path);
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version <= 204),
    NOW,
    testLogger(),
  );
  database
    .prepare(
      `insert into profiles (id, name, colour, fitness_goals, position, created_at, updated_at)
       values (?, 'Owner', 'amber', '{}', 0, ?, ?)`,
    )
    .run(PROFILE, NOW, NOW);
  const client = database.prepare(
    `insert into clients (id, name, platform, kind, role, built_in, token_hash, profile_id, created_at)
     values (?, ?, ?, ?, 'owner', ?, ?, ?, ?)`,
  );
  client.run(HUB, 'This computer', 'desktop', 'computer', 1, 'h1', PROFILE, NOW);
  client.run(PHONE, 'Pixel', 'android', 'phone', 0, 'h2', PROFILE, NOW);
  const targets = JSON.stringify([HUB_TARGET, PHONE_TARGET, WATCH_TARGET]);
  database
    .prepare(
      `insert into planner_alarms (id, profile_id, time, days, enabled, sound, ramp_seconds, vibrate,
         snooze_minutes, targets, watch, source, created_at, updated_at)
       values (?, ?, '07:00', '[]', 1, '{"kind":"tone","id":"a"}', 0, 1, 9, ?, '[]', 'planner', ?, ?)`,
    )
    .run('alarm-1', PROFILE, targets, NOW, NOW);
  database
    .prepare(
      `insert into planner_alarms (id, profile_id, time, days, enabled, sound, ramp_seconds, vibrate,
         snooze_minutes, targets, watch, source, created_at, updated_at)
       values (?, ?, '08:00', '[]', 1, '{"kind":"tone","id":"a"}', 0, 1, 9, '[]', '[]', 'planner', ?, ?)`,
    )
    .run('alarm-2', PROFILE, NOW, NOW);
  database
    .prepare(
      `insert into planner_timers (id, profile_id, duration_ms, state, targets, created_at, updated_at)
       values ('timer-1', ?, 60000, 'done', ?, ?, ?)`,
    )
    .run(PROFILE, JSON.stringify([HUB_TARGET]), NOW, NOW);
  database
    .prepare(
      `insert into planner_preferences (profile_id, preferences, updated_at) values (?, ?, ?)`,
    )
    .run(PROFILE, JSON.stringify({ clock: { targets: [PHONE_TARGET, HUB_TARGET] } }), NOW);
  database.close();
}

describe('migrating to drop the hub built-in client from stored ring targets', () => {
  it('keeps every other target in order and leaves untouched rows alone', () => {
    seedBefore();

    openStore({
      path,
      log: testLogger(),
      now: () => new Date(NOW),
      systemTimeZone: 'UTC',
      drivePathOf: unusedDrivePath,
    }).close();

    const migrated = new DatabaseSync(path);
    const alarmTargets = (id: string): unknown =>
      JSON.parse(
        TARGETS.parse(migrated.prepare('select targets from planner_alarms where id = ?').get(id))
          .targets,
      );
    expect(alarmTargets('alarm-1')).toEqual([PHONE_TARGET, WATCH_TARGET]);
    expect(alarmTargets('alarm-2')).toEqual([]);
    expect(
      JSON.parse(
        TARGETS.parse(
          migrated.prepare("select targets from planner_timers where id = 'timer-1'").get(),
        ).targets,
      ),
    ).toEqual([]);
    expect(
      JSON.parse(
        PREFERENCES.parse(migrated.prepare('select preferences from planner_preferences').get())
          .preferences,
      ),
    ).toMatchObject({ clock: { targets: [PHONE_TARGET] } });
    migrated.close();
  });
});
