import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  inputOf,
  openDriveSyncDatabase,
  type DriveSyncDatabase,
  type FileInput,
  type FileRecord,
} from '../../src/drive-sync/db/index.js';
import { PushQueue } from '../../src/drive-sync/push-queue.js';
import { NO_META } from './pull-support.js';

const PATH = z.looseObject({ relPath: z.string() });
const ROOT = '66666666-6666-4666-8666-666666666666';
const BLOCK = 128 * 1024;

let scratch = '';
let database: DriveSyncDatabase;
let queue: PushQueue;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'drive-sync-queue-'));
  database = openDriveSyncDatabase(
    join(scratch, 'client.sqlite'),
    new Logger('desktop.drive-sync'),
  );
  queue = new PushQueue(database, ROOT);
});

afterEach(async () => {
  database.close();
  await rm(scratch, { recursive: true, force: true });
});

function record(relPath: string, changes: Partial<FileInput> = {}): FileRecord {
  database.files.upsert({
    ...NO_META,
    placementId: ROOT,
    relPath,
    kind: 'file',
    bytes: 4,
    mtimeNs: 1_700_000_000_000_000_000n,
    mode: 0o644,
    hubRev: 3,
    localHashState: 'hashed',
    blockSize: BLOCK,
    blocks: new Uint8Array(32).fill(1),
    ...changes,
  });
  const found = database.files.get(ROOT, relPath);
  if (found === undefined) throw new Error('not stored');
  return found;
}

function kinds(): string[] {
  return database.pendingOps.list().map((op) => `${op.kind}:${PATH.parse(op.payload).relPath}`);
}

describe('PushQueue with metadata operations', () => {
  it('queues a metadata push that reads its values when it is sent', () => {
    const file = record('a.sh', { mode: 0o755, metaDirty: true });
    queue.submit([{ kind: 'meta', record: file }]);
    expect(kinds()).toEqual(['meta:a.sh']);
    expect(database.pendingOps.list()[0]?.payload).toEqual({ relPath: 'a.sh' });
  });

  it('keeps one metadata push per path and leaves a waiting content push to carry the metadata', () => {
    const file = record('a.sh', { metaDirty: true });
    queue.submit([{ kind: 'push', record: file }]);
    queue.submit([{ kind: 'meta', record: file }]);
    expect(kinds()).toEqual(['push:a.sh']);
    const other = record('b.sh', { metaDirty: true });
    queue.submit([{ kind: 'meta', record: other }]);
    queue.submit([{ kind: 'meta', record: other }]);
    expect(kinds()).toEqual(['push:a.sh', 'meta:b.sh']);
  });

  it('lets a content push replace a waiting metadata push of the same path', () => {
    const file = record('a.sh', { metaDirty: true });
    queue.submit([{ kind: 'meta', record: file }]);
    queue.submit([{ kind: 'push', record: file }]);
    expect(kinds()).toEqual(['push:a.sh']);
  });

  it('queues a link after the tombstone that removes what it replaces', () => {
    const link = record('l', {
      kind: 'link',
      bytes: 0,
      blockSize: null,
      blocks: null,
      linkTarget: 'x',
      hubRev: null,
    });
    queue.submit([
      { kind: 'link', record: link },
      { kind: 'tombstone', relPath: 'l', baseRev: 4 },
    ]);
    expect(kinds()).toEqual(['tombstone:l', 'link:l']);
  });

  it('drops queued metadata and link operations of a deleted folder', () => {
    queue.submit([{ kind: 'meta', record: record('dir/a.sh', { metaDirty: true }) }]);
    queue.submit([{ kind: 'tombstone', relPath: 'dir', baseRev: 2 }]);
    expect(kinds()).toEqual(['tombstone:dir']);
  });

  it('sends the first name of a hard link group before the others', () => {
    const second = record('b.txt', { linkKey: '1:9', hubRev: null });
    const first = record('a.txt', { linkKey: '1:9', hubRev: null });
    queue.submit([
      { kind: 'push', record: second },
      { kind: 'push', record: first },
    ]);
    expect(kinds()).toEqual(['push:a.txt', 'push:b.txt']);
  });

  it('keeps the metadata push of a moved file after the move', () => {
    const moved = record('new.sh', { metaDirty: true });
    queue.submit([
      { kind: 'move', from: 'old.sh', to: 'new.sh', baseRev: 3 },
      { kind: 'meta', record: moved },
    ]);
    expect(database.pendingOps.list().map((op) => op.kind)).toEqual(['move', 'meta']);
    expect(inputOf(moved).relPath).toBe('new.sh');
  });
});
