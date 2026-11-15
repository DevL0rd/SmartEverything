import { randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  blockSizeFor,
  type SyncHubMessage,
  type SyncIndexEntry,
} from '@smarteverything/domain/drive-sync';
import { Logger } from '@smarteverything/logging';
import type * as fsPromises from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDriveSyncDatabase, type DriveSyncDatabase } from '../../src/drive-sync/db/index.js';
import { PlacementPuller } from '../../src/drive-sync/pull.js';
import { MemoryXattrs } from './meta-support.js';
import { FakeHubFiles, blockHashes, bytesOf, sha256Of } from './pull-support.js';

const linkCall = vi.hoisted((): { failWith: string | null } => ({ failWith: null }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof fsPromises>();
  return {
    ...original,
    link: async (from: string, to: string): Promise<void> => {
      if (linkCall.failWith !== null) {
        throw Object.assign(new Error(linkCall.failWith), { code: linkCall.failWith });
      }
      await original.link(from, to);
    },
  };
});

const log = new Logger('desktop.drive-sync');
const ROOT = randomUUID();
const INDEX_ID = randomUUID();
const MTIME_NS = '1793527200000000000';
const INODE = 7;

let scratch = '';
let database: DriveSyncDatabase;
let hub: FakeHubFiles;
let puller: PlacementPuller;
let failed: { readonly relPath: string | null; readonly message: string }[] = [];

beforeEach(async () => {
  linkCall.failWith = null;
  failed = [];
  scratch = await mkdtemp(join(tmpdir(), 'drive-sync-pull-hardlink-'));
  await mkdir(join(scratch, 'library'), { recursive: true });
  database = openDriveSyncDatabase(join(scratch, 'client.sqlite'), log);
  hub = new FakeHubFiles();
  puller = new PlacementPuller({
    placementId: ROOT,
    driveId: ROOT,
    rootPath: join(scratch, 'library'),
    platform: process.platform,
    meta: new MemoryXattrs(),
    tolerance: (): bigint => 0n,
    database,
    source: hub,
    wants: (): boolean => true,
    sink: {
      pulled: (): void => undefined,
      contended: (): void => undefined,
      deferred: (): void => undefined,
      skipped: (): void => undefined,
      dirtied: (): void => undefined,
      progress: (): void => undefined,
      blocked: (): void => undefined,
      failed: (failure): void => {
        failed.push(failure);
      },
    },
    log,
  });
});

afterEach(async () => {
  database.close();
  await rm(scratch, { recursive: true, force: true });
});

function named(relPath: string, content: Buffer): SyncIndexEntry {
  const itemId = randomUUID();
  hub.contents.set(itemId, content);
  return {
    itemId,
    relPath,
    kind: 'file',
    mtime: '2026-11-01T10:00:00.000Z',
    mtimeNs: MTIME_NS,
    rev: 2,
    deleted: false,
    mode: 0o644,
    xattrs: [],
    inode: INODE,
    bytes: content.length,
    blockSize: blockSizeFor(content.length),
    blocksHash: sha256Of(blockHashes(content)),
  };
}

async function deliverBoth(): Promise<void> {
  const content = bytesOf(1, 'h');
  const message: SyncHubMessage = {
    type: 'index',
    indexId: INDEX_ID,
    seq: 3,
    entries: [named('first.txt', content), named('second.txt', content)],
    last: true,
  };
  puller.receive(message);
  await puller.settled();
}

function disk(relPath: string): string {
  return join(scratch, 'library', relPath);
}

describe('hard links from the hub', () => {
  it('makes the second name a hard link of the first', async () => {
    await deliverBoth();
    expect((await lstat(disk('second.txt'))).nlink).toBe(2);
    expect(failed).toEqual([]);
  });

  for (const code of ['EXDEV', 'EMLINK']) {
    it(`falls back to a separate copy when the link is refused with ${code}`, async () => {
      linkCall.failWith = code;
      await deliverBoth();
      expect(failed).toEqual([]);
      expect((await lstat(disk('second.txt'))).nlink).toBe(1);
      expect(await readFile(disk('second.txt'))).toEqual(bytesOf(1, 'h'));
      expect(await readFile(disk('first.txt'))).toEqual(bytesOf(1, 'h'));
      expect(database.files.get(ROOT, 'second.txt')).toMatchObject({
        kind: 'file',
        localHashState: 'hashed',
        hubRev: 2,
      });
    });
  }
});
