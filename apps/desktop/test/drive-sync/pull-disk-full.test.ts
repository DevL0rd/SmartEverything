import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '@smarteverything/logging';
import type * as fsPromises from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDriveSyncDatabase, type DriveSyncDatabase } from '../../src/drive-sync/db/index.js';
import { RootPuller } from '../../src/drive-sync/pull.js';
import { FakeHubFiles, bytesOf, fileEntry } from './pull-support.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fsPromises>();
  return {
    ...actual,
    open: async (path: string, flags: string): Promise<fsPromises.FileHandle> => {
      const handle = await actual.open(path, flags);
      if (!path.includes('.sync-tmp')) return handle;
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

let scratch = '';
let database: DriveSyncDatabase;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'drive-sync-pull-full-'));
  await mkdir(join(scratch, 'library'), { recursive: true });
  database = openDriveSyncDatabase(join(scratch, 'client.sqlite'), log);
});

afterEach(async () => {
  database.close();
  await rm(scratch, { recursive: true, force: true });
});

describe('pulling onto a full disk', () => {
  it('reports the blocked reason, halts and does not advance the cursor', async () => {
    const hub = new FakeHubFiles();
    const itemId = randomUUID();
    const content = bytesOf(2, 'f');
    hub.contents.set(itemId, content);
    const blocked: { relPath: string; reason: 'disk_full' }[] = [];
    const failed: unknown[] = [];
    const puller = new RootPuller({
      rootId: ROOT,
      rootPath: join(scratch, 'library'),
      platform: process.platform,
      database,
      source: hub,
      wants: (): boolean => true,
      sink: {
        pulled: (): void => undefined,
        contended: (): void => undefined,
        deferred: (): void => undefined,
        progress: (): void => undefined,
        blocked: (result): void => {
          blocked.push(result);
        },
        failed: (failure): void => {
          failed.push(failure);
        },
      },
      log,
    });
    puller.receive({
      type: 'index',
      indexId: randomUUID(),
      seq: 3,
      entries: [fileEntry(itemId, 'photo.raw', content, 1)],
      last: true,
    });
    await puller.settled();
    expect(blocked).toEqual([{ relPath: 'photo.raw', reason: 'disk_full' }]);
    expect(failed).toEqual([]);
    expect(database.cursors.get(ROOT)).toBeUndefined();
    await expect(stat(join(scratch, 'library', 'photo.raw'))).rejects.toThrow();
  });
});
