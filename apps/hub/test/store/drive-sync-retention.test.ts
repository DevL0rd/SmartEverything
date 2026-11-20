import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { z } from 'zod';
import { DRIVE_SYNC_OP_KEEP_MS, DriveSyncRetention } from '../../src/store/drive-sync-retention';
import { testLogger } from '../support/logs';

const NOW = Date.parse('2026-11-20T10:00:00.000Z');

const ROWS = z.array(z.object({ op_id: z.string() }));

let directory: string;
let database: DatabaseSync;
let now = NOW;

function remember(opId: string, at: number): void {
  database
    .prepare("insert into drive_sync_ops values ('placement', $opId, '{}', $at)")
    .run({ opId, at: new Date(at).toISOString() });
}

function kept(): readonly string[] {
  return ROWS.parse(database.prepare('select op_id from drive_sync_ops order by op_id').all()).map(
    (row) => row.op_id,
  );
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-sync-ops-'));
  database = new DatabaseSync(join(directory, 'hub.db'));
  database.exec('pragma journal_mode = wal');
  database.exec(`create table drive_sync_ops (
    placement_id text not null, op_id text not null, result text not null, at text not null,
    primary key (placement_id, op_id)) strict, without rowid`);
  now = NOW;
});

afterEach(async () => {
  database.close();
  await rm(directory, { recursive: true, force: true });
});

it('forgets drive sync operations older than the kept window off the main thread', async () => {
  remember('old', NOW - DRIVE_SYNC_OP_KEEP_MS - 1000);
  remember('new', NOW - 1000);
  const retention = new DriveSyncRetention({
    path: join(directory, 'hub.db'),
    busyTimeoutMs: 1000,
    now: (): Date => new Date(now),
    log: testLogger('retention'),
  });
  try {
    retention.observe();
    await retention.settled();
    expect(kept()).toEqual(['new']);
    remember('later', NOW);
    now = NOW + 1000;
    retention.observe();
    await retention.settled();
    expect(kept()).toEqual(['later', 'new']);
  } finally {
    retention.close();
  }
});
