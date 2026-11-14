import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConflictResolver } from '../../src/drive-sync/conflicts.js';
import { openDriveSyncDatabase, type DriveSyncDatabase } from '../../src/drive-sync/db/index.js';
import type { PushIntent } from '../../src/drive-sync/push-intents.js';
import type { PushConflict } from '../../src/drive-sync/push.js';

const log = new Logger('desktop.drive-sync');
const ROOT = 'root-1';

let scratch = '';
let database: DriveSyncDatabase;
let resolver: ConflictResolver;
let reindexed = 0;
let submitted: (readonly PushIntent[])[] = [];

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'drive-sync-conflicts-'));
  database = openDriveSyncDatabase(join(scratch, 'client.sqlite'), log);
  reindexed = 0;
  submitted = [];
  resolver = new ConflictResolver({
    placementId: ROOT,
    rootPath: join(scratch, 'library'),
    platform: process.platform,
    database,
    reindex: (): void => {
      reindexed += 1;
    },
    submit: (intents): Promise<void> => {
      submitted.push(intents);
      return Promise.resolve();
    },
    log,
  });
});

afterEach(async () => {
  database.close();
  await rm(scratch, { recursive: true, force: true });
});

function disk(relPath: string): string {
  return join(scratch, 'library', ...relPath.split('/'));
}

async function localFile(relPath: string, content: string, hubRev: number | null): Promise<void> {
  await mkdir(dirname(disk(relPath)), { recursive: true });
  await writeFile(disk(relPath), content);
  const info = await stat(disk(relPath), { bigint: true });
  database.files.upsert({
    placementId: ROOT,
    relPath,
    kind: 'file',
    bytes: content.length,
    mtimeNs: info.mtimeNs,
    mode: 0o644,
    hubRev,
    localHashState: 'hashed',
    blockSize: 131072,
    blocks: Buffer.alloc(32, 1),
  });
}

function conflict(
  kind: PushConflict['kind'],
  relPath: string,
  reason: PushConflict['reason'],
  conflictPath: string | null = null,
): PushConflict {
  return { kind, relPath, reason, conflictPath, hubRev: 9 };
}

async function exists(relPath: string): Promise<boolean> {
  return stat(disk(relPath)).then(
    () => true,
    () => false,
  );
}

describe('pushes the hub turned into a conflict copy', () => {
  it('moves the local content to the copy path the hub created', async () => {
    await localFile('shared.txt', 'mine', 3);
    const result = await resolver.resolve(
      conflict('push', 'shared.txt', 'stale', 'shared (conflict).txt'),
    );
    expect(result).toMatchObject({ outcome: 'kept_copy', copyPath: 'shared (conflict).txt' });
    expect(await exists('shared.txt')).toBe(false);
    expect((await readFile(disk('shared (conflict).txt'))).toString()).toBe('mine');
    expect(database.files.get(ROOT, 'shared.txt')).toBeUndefined();
    expect(database.files.get(ROOT, 'shared (conflict).txt')).toMatchObject({ hubRev: null });
    expect(reindexed).toBe(1);
  });

  it('drops the local file when the copy is already indexed from the hub', async () => {
    await localFile('shared.txt', 'mine', 3);
    await localFile('shared (conflict).txt', 'mine', 11);
    const result = await resolver.resolve(
      conflict('push', 'shared.txt', 'stale', 'shared (conflict).txt'),
    );
    expect(result.outcome).toBe('kept_copy');
    expect(await exists('shared.txt')).toBe(false);
    expect(database.files.get(ROOT, 'shared (conflict).txt')).toMatchObject({ hubRev: 11 });
  });

  it('keeps nothing when the local file is already gone', async () => {
    await localFile('shared.txt', 'mine', 3);
    await rm(disk('shared.txt'));
    await resolver.resolve(conflict('push', 'shared.txt', 'stale', 'copy.txt'));
    expect(database.files.get(ROOT, 'shared.txt')).toBeUndefined();
    expect(database.files.get(ROOT, 'copy.txt')).toBeUndefined();
  });
});

describe('pushes without a conflict copy', () => {
  it('lets the hub version win over an untouched local file', async () => {
    await localFile('a.txt', 'old', 3);
    const result = await resolver.resolve(conflict('push', 'a.txt', 'stale'));
    expect(result.outcome).toBe('hub_won');
    expect(await exists('a.txt')).toBe(false);
    expect(database.files.get(ROOT, 'a.txt')).toBeUndefined();
    expect(reindexed).toBe(1);
  });

  it('never deletes a local file edited after it was hashed', async () => {
    await localFile('a.txt', 'old', 3);
    await writeFile(disk('a.txt'), 'edited since');
    await utimes(disk('a.txt'), new Date(2030, 0, 1), new Date(2030, 0, 1));
    await resolver.resolve(conflict('push', 'a.txt', 'stale'));
    expect((await readFile(disk('a.txt'))).toString()).toBe('edited since');
    expect(database.files.get(ROOT, 'a.txt')).toBeDefined();
  });

  it('pushes the file again as new when the hub lost it', async () => {
    await localFile('a.txt', 'still here', 3);
    const result = await resolver.resolve(conflict('push', 'a.txt', 'missing'));
    expect(result.outcome).toBe('repushed');
    expect(database.files.get(ROOT, 'a.txt')?.hubRev).toBeNull();
    expect(submitted).toHaveLength(1);
    expect(submitted[0]?.map((intent) => intent.kind)).toEqual(['push']);
  });

  it('reports an unexplained refusal as unresolved and changes nothing', async () => {
    await localFile('a.txt', 'x', 3);
    const result = await resolver.resolve(conflict('push', 'a.txt', 'exists'));
    expect(result.outcome).toBe('unresolved');
    expect(database.files.get(ROOT, 'a.txt')?.hubRev).toBe(3);
    expect(submitted).toEqual([]);
  });
});

describe('moves and tombstones', () => {
  it('pushes every file under a refused move again as new', async () => {
    await localFile('dir/a.txt', 'a', 2);
    await localFile('dir/sub/b.txt', 'b', 2);
    await localFile('other.txt', 'o', 2);
    const result = await resolver.resolve(conflict('move', 'dir', 'stale'));
    expect(result.outcome).toBe('repushed');
    expect(database.files.get(ROOT, 'dir/a.txt')?.hubRev).toBeNull();
    expect(database.files.get(ROOT, 'dir/sub/b.txt')?.hubRev).toBeNull();
    expect(database.files.get(ROOT, 'other.txt')?.hubRev).toBe(2);
    expect(submitted[0]).toHaveLength(2);
    expect(reindexed).toBe(1);
  });

  it('restores the hub version when a delete lost to a newer edit', async () => {
    const result = await resolver.resolve(conflict('tombstone', 'edited.txt', 'stale'));
    expect(result.outcome).toBe('restored');
    expect(reindexed).toBe(1);
  });

  it('accepts a delete of something the hub no longer has', async () => {
    const result = await resolver.resolve(conflict('tombstone', 'gone.txt', 'missing'));
    expect(result.outcome).toBe('already_gone');
    expect(reindexed).toBe(0);
  });
});
