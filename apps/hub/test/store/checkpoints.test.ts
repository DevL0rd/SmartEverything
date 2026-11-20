import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StoreCheckpoints } from '../../src/store/checkpoints';
import { captureLogs, testLogger } from '../support/logs';

let folder: string;
let database: DatabaseSync;
let checkpoints: StoreCheckpoints;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'hub-checkpoints-'));
  const path = join(folder, 'store.db');
  database = new DatabaseSync(path);
  database.exec('pragma journal_mode = wal');
  database.exec('pragma wal_autocheckpoint = 0');
  database.exec('create table notes (id integer primary key, text text)');
  checkpoints = new StoreCheckpoints({ path, busyTimeoutMs: 1000, frames: 100, log: testLogger() });
});

afterEach(async () => {
  checkpoints.close();
  database.close();
  await rm(folder, { recursive: true, force: true });
});

function walFrames(): { readonly log: number; readonly checkpointed: number } {
  const row = database.prepare('pragma wal_checkpoint(passive)').get();
  return { log: Number(row?.['log']), checkpointed: Number(row?.['checkpointed']) };
}

describe('write-ahead log checkpoints on their own thread', () => {
  it('copies the committed pages into the database when told about commits', async () => {
    const insert = database.prepare('insert into notes (text) values (?)');
    for (let index = 0; index < 200; index += 1) insert.run('x'.repeat(500));
    checkpoints.trigger();
    checkpoints.trigger();
    await checkpoints.settled();
    const frames = walFrames();
    expect(frames.log).toBeGreaterThan(0);
    expect(frames.checkpointed).toBe(frames.log);
  });

  it('leaves a short log for later and copies it once enough frames wait', async () => {
    const logs = captureLogs();
    const insert = database.prepare('insert into notes (text) values (?)');
    insert.run('x'.repeat(500));
    checkpoints.trigger();
    await checkpoints.settled();
    expect(logs.events()).toContain('store.checkpoint_deferred');
    logs.records.length = 0;
    for (let index = 0; index < 200; index += 1) insert.run('x'.repeat(500));
    checkpoints.trigger();
    await checkpoints.settled();
    expect(logs.events()).not.toContain('store.checkpoint_deferred');
    expect(logs.events()).not.toContain('store.checkpoint_failed');
  });

  it('is settled at once when nothing was triggered', async () => {
    await expect(checkpoints.settled()).resolves.toBeUndefined();
  });
});
