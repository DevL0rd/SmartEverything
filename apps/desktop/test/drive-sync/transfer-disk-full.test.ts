import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '@smarteverything/logging';
import type * as fsPromises from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDriveSyncDatabase, type DriveSyncDatabase } from '../../src/drive-sync/db/index.js';
import { DiskFullError, downloadFile, itemKeyOf } from '../../src/drive-sync/transfer.js';
import { FakeHubFiles, bytesOf, remoteOf } from './pull-support.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fsPromises>();
  return {
    ...actual,
    open: async (path: string, flags: string): Promise<fsPromises.FileHandle> => {
      const handle = await actual.open(path, flags);
      if (!path.endsWith('.full.sync-tmp')) return handle;
      return new Proxy(handle, {
        get(target, key): unknown {
          if (key === 'write') {
            return (): Promise<never> =>
              Promise.reject(Object.assign(new Error('no space'), { code: 'ENOSPC' }));
          }
          const value: unknown = Reflect.get(target, key);
          return typeof value === 'function'
            ? (...args: unknown[]): unknown => Reflect.apply(value, target, args)
            : value;
        },
      });
    },
  };
});

const log = new Logger('desktop.drive-sync');
const ROOT = randomUUID();
const TXN = `pull:${ROOT}`;

let scratch = '';
let database: DriveSyncDatabase;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'drive-sync-disk-full-'));
  database = openDriveSyncDatabase(join(scratch, 'client.sqlite'), log);
});

afterEach(async () => {
  database.close();
  await rm(scratch, { recursive: true, force: true });
});

describe('a full disk during a transfer', () => {
  it('reports disk full and keeps the transfer so it can resume', async () => {
    const hub = new FakeHubFiles();
    const itemId = randomUUID();
    const content = bytesOf(2, 'm');
    hub.contents.set(itemId, content);
    const remote = remoteOf(ROOT, itemId, content);
    await expect(
      downloadFile({
        relPath: 'big.bin',
        txn: TXN,
        remote,
        tempPath: join(scratch, '.big.full.sync-tmp'),
        database,
        source: hub,
        local: { read: () => Promise.resolve(null) },
        progress: () => undefined,
      }),
    ).rejects.toBeInstanceOf(DiskFullError);
    expect(database.transfers.get(TXN, itemKeyOf(remote))?.verified).toEqual([false, false]);
  });
});
