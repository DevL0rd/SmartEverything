import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { PHOTO_VISION_REFUSED_RETRY_MIGRATION } from '../../src/store/migrations/photo-vision-refused-retry';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-15T05:00:00.000Z';
const COUNT = z.object({ n: z.int() });

let directory: string;
let database: DatabaseSync;
let sql: Sql;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-vision-retry-'));
  database = new DatabaseSync(join(directory, 'hub.db'));
  sql = new Sql(database);
  migrate(
    sql,
    MIGRATIONS.filter((migration) => migration.version < 225),
    NOW,
    testLogger(),
  );
});

afterEach(async () => {
  database.close();
  await rm(directory, { recursive: true, force: true });
});

function count(table: string, where: string): number {
  return sql.get(COUNT, `select count(*) as n from ${table} where ${where}`)?.n ?? 0;
}

describe('photo-vision-refused-retry migration', () => {
  it('forgets failed vision jobs and failed analyses so they run again, and keeps everything else', () => {
    database.exec('pragma foreign_keys = off');
    const job = database.prepare(
      'insert into drive_media_jobs (id, kind, item_id, rev, state, visible, attempts, error, queued_at) values (?, ?, ?, 1, ?, 0, 0, ?, ?)',
    );
    job.run('j1', 'vision', 'i1', 'failed', 'refused', NOW);
    job.run('j2', 'vision', 'i2', 'done', null, NOW);
    job.run('j3', 'faces', 'i3', 'failed', 'broken', NOW);
    const analysis = database.prepare(
      "insert into photo_analysis (item_id, rev, model, state, labels, pets, error, analysed_at) values (?, 1, 'm', ?, '[]', '[]', ?, ?)",
    );
    analysis.run('i1', 'failed', 'refused', NOW);
    analysis.run('i2', 'needs_key', null, NOW);
    for (const statement of PHOTO_VISION_REFUSED_RETRY_MIGRATION.statements)
      database.exec(statement);
    expect(count('drive_media_jobs', "kind = 'vision' and state = 'failed'")).toBe(0);
    expect(count('drive_media_jobs', '1 = 1')).toBe(2);
    expect(count('photo_analysis', "state = 'failed'")).toBe(0);
    expect(count('photo_analysis', '1 = 1')).toBe(1);
  });
});
