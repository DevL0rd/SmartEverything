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
const PROFILE = '0e000000-0000-4000-8000-0000000000f2';
const BED = Date.parse('2026-10-18T16:30:00.000Z');
const VERSION =
  MIGRATIONS.find((migration) => migration.name === 'sleep_stage_duplicates')?.version ?? 0;
const STORED = z.object({ data: z.string() });
const STAGES = z.object({
  title: z.null(),
  stages: z.array(z.object({ startTime: z.string(), endTime: z.string(), stage: z.number() })),
});

interface Stage {
  readonly startTime: string;
  readonly endTime: string;
  readonly stage: number;
}

let directory: string;
let path: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-sleep-stage-duplicates-'));
  path = join(directory, 'hub.db');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function wholeNight(): Stage[] {
  let at = BED;
  return Array.from({ length: 35 }, (_, index) => {
    const from = at;
    at += (5 + (index % 7)) * 60_000;
    return {
      startTime: new Date(from).toISOString(),
      endTime: new Date(at).toISOString(),
      stage: [4, 5, 4, 6][index % 4] ?? 4,
    };
  });
}

function seed(database: DatabaseSync, id: string, stages: readonly Stage[]): void {
  const last = stages.at(-1)?.endTime ?? new Date(BED + 3_600_000).toISOString();
  database
    .prepare(
      `insert into health_records (record_id, record_type, start_time, end_time, zone_offset_seconds, data,
         source_app, last_modified, deleted, received_at, profile_id)
       values (?, 'SleepSession', ?, ?, 25200, ?, 'smarteverything.watch', ?, 0, ?, ?)`,
    )
    .run(
      id,
      new Date(BED).toISOString(),
      last,
      JSON.stringify({ title: null, notes: null, stages }),
      NOW,
      NOW,
      PROFILE,
    );
}

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
      "insert into profiles (id, name, colour, fitness_goals, position, created_at, updated_at) values (?, 'Ann', 'amber', '{}', 0, ?, ?)",
    )
    .run(PROFILE, NOW, NOW);
  const night = wholeNight();
  seed(database, 'doubled', [...night.slice(0, 13), ...night]);
  seed(database, 'clean', night.slice(0, 20));
  seed(database, 'overlapping', [
    { startTime: '2026-10-18T16:30:00.000Z', endTime: '2026-10-18T17:00:00.000Z', stage: 4 },
    { startTime: '2026-10-18T16:30:00.000Z', endTime: '2026-10-18T16:45:00.000Z', stage: 4 },
    { startTime: '2026-10-18T16:30:00.000Z', endTime: '2026-10-18T17:00:00.000Z', stage: 5 },
  ]);
  database.close();
}

function storedStages(id: string): Stage[] {
  const database = new DatabaseSync(path);
  const row = STORED.parse(
    database.prepare('select data from health_records where record_id = ?').get(id),
  );
  database.close();
  return STAGES.parse(JSON.parse(row.data)).stages;
}

function openAt(): void {
  openStore({ path, log: testLogger(), now: () => new Date(NOW), systemTimeZone: 'UTC' }).close();
}

describe('removing sleep stages the watch parser stored twice', () => {
  it('keeps each distinct stage of a doubled night once, in its original order', () => {
    seedBefore();

    openAt();

    expect(storedStages('doubled')).toEqual(wholeNight());
  });

  it('never drops a distinct stage, even one sharing a start with another', () => {
    seedBefore();

    openAt();

    expect(storedStages('clean')).toEqual(wholeNight().slice(0, 20));
    expect(storedStages('overlapping')).toHaveLength(3);
  });
});
