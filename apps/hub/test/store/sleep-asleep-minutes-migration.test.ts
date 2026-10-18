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
const PROFILE = '0e000000-0000-4000-8000-0000000000f1';
const VALUE = z.object({ day: z.string(), value: z.number() });

let directory: string;
let path: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-sleep-asleep-'));
  path = join(directory, 'hub.db');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function stage(from: string, to: string, code: number): object {
  return { startTime: from, endTime: to, stage: code };
}

interface Session {
  readonly id: string;
  readonly start: string;
  readonly end: string;
  readonly stages: readonly object[];
  readonly source?: string;
}

function seedSession(database: DatabaseSync, session: Session): void {
  database
    .prepare(
      `insert into health_records (record_id, record_type, start_time, end_time, zone_offset_seconds, data,
         source_app, last_modified, deleted, received_at, profile_id)
       values (?, 'SleepSession', ?, ?, 0, ?, ?, ?, 0, ?, ?)`,
    )
    .run(
      session.id,
      session.start,
      session.end,
      JSON.stringify({ title: null, notes: null, stages: session.stages }),
      session.source ?? 'com.mi.health',
      NOW,
      NOW,
      PROFILE,
    );
}

function seedBefore(): void {
  const database = new DatabaseSync(path);
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version <= 95),
    NOW,
    testLogger(),
  );
  database
    .prepare(
      "insert into profiles (id, name, colour, fitness_goals, position, created_at, updated_at) values (?, 'Ann', 'amber', '{}', 0, ?, ?)",
    )
    .run(PROFILE, NOW, NOW);
  seedSession(database, {
    id: 'night',
    start: '2026-10-07T23:00:00.000Z',
    end: '2026-10-08T07:00:00.000Z',
    stages: [
      stage('2026-10-07T23:00:00.000Z', '2026-10-08T01:00:00.000Z', 4),
      stage('2026-10-08T01:00:00.000Z', '2026-10-08T02:30:00.000Z', 1),
      stage('2026-10-08T02:30:00.000Z', '2026-10-08T07:00:00.000Z', 5),
    ],
  });
  seedSession(database, {
    id: 'nap',
    start: '2026-10-08T14:00:00.000Z',
    end: '2026-10-08T14:30:00.000Z',
    stages: [],
  });
  seedSession(database, {
    id: 'other-app',
    start: '2026-10-08T14:00:00.000Z',
    end: '2026-10-08T15:00:00.000Z',
    stages: [],
    source: 'z.other',
  });
  seedSession(database, {
    id: 'plain',
    start: '2026-10-09T00:00:00.000Z',
    end: '2026-10-09T06:00:00.000Z',
    stages: [],
  });
  const daily = database.prepare(
    "insert into health_daily (profile_id, day, metric, value, unit, updated_at) values (?, ?, ?, ?, 'min', ?)",
  );
  daily.run(PROFILE, '2026-10-08', 'sleep', 510, NOW);
  daily.run(PROFILE, '2026-10-09', 'sleep', 360, NOW);
  daily.run(PROFILE, '2026-10-08', 'steps', 4000, NOW);
  database.close();
}

function rows(metric: string): Record<string, number> {
  const database = new DatabaseSync(path);
  const found = z
    .array(VALUE)
    .parse(
      database
        .prepare('select day, value from health_daily where metric = ? order by day')
        .all(metric),
    );
  database.close();
  return Object.fromEntries(found.map((row) => [row.day, row.value]));
}

describe('migrating daily sleep from time in bed to time asleep', () => {
  it('recomputes each stored sleep day from its sessions, awake stages left out', () => {
    seedBefore();

    openStore({ path, log: testLogger(), now: () => new Date(NOW), systemTimeZone: 'UTC' }).close();

    expect(rows('sleep')).toEqual({ '2026-10-08': 120 + 270 + 30, '2026-10-09': 360 });
  });

  it('leaves every other metric alone', () => {
    seedBefore();

    openStore({ path, log: testLogger(), now: () => new Date(NOW), systemTimeZone: 'UTC' }).close();

    expect(rows('steps')).toEqual({ '2026-10-08': 4000 });
  });
});
