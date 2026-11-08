import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { SyncIndexEntry } from '@smarteverything/domain/drive-sync';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDriveSyncDatabase, type DriveSyncDatabase } from '../../src/drive-sync/db/index.js';
import {
  Pins,
  Placeholders,
  Selection,
  isPlaceholder,
  wantsFrom,
} from '../../src/drive-sync/select.js';

const log = new Logger('desktop.drive-sync');
const ROOT = 'root-1';

let scratch = '';
let database: DriveSyncDatabase;
let placeholders: Placeholders;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'drive-sync-select-'));
  database = openDriveSyncDatabase(join(scratch, 'client.sqlite'), log);
  placeholders = new Placeholders({
    database,
    rootId: ROOT,
    rootPath: join(scratch, 'library'),
    platform: process.platform,
    log,
  });
});

afterEach(async () => {
  database.close();
  await rm(scratch, { recursive: true, force: true });
});

function entry(relPath: string, rev: number, bytes = 10, deleted = false): SyncIndexEntry {
  return {
    itemId: `item-${relPath}`,
    relPath,
    kind: 'file',
    mtime: '2026-11-01T10:00:00.000Z',
    rev,
    deleted,
    bytes,
    blockSize: 131072,
    blocksHash: 'ab'.repeat(32),
  };
}

function disk(relPath: string): string {
  return join(scratch, 'library', ...relPath.split('/'));
}

async function downloaded(relPath: string, content: string, hubRev = 4): Promise<void> {
  await mkdir(dirname(disk(relPath)), { recursive: true });
  await writeFile(disk(relPath), content);
  const info = await stat(disk(relPath), { bigint: true });
  database.files.upsert({
    rootId: ROOT,
    relPath,
    kind: 'file',
    bytes: content.length,
    mtimeNs: info.mtimeNs,
    mode: 0o644,
    hubRev,
    localHashState: 'hashed',
    blockSize: 131072,
    blocks: Buffer.alloc(32, 2),
  });
}

describe('selection', () => {
  it('wants everything when nothing is selected and only whole folders otherwise', () => {
    expect(wantsFrom([])('any/file.txt')).toBe(true);
    const wants = wantsFrom(['keep', 'deep/inner']);
    expect(wants('keep')).toBe(true);
    expect(wants('keep/a/b.txt')).toBe(true);
    expect(wants('keep2/a.txt')).toBe(false);
    expect(wants('deep/inner/x')).toBe(true);
    expect(wants('deep/other')).toBe(false);
  });

  it('persists and reloads the selected folders', () => {
    new Selection(database, ROOT).replace(['b', 'a', 'a']);
    const reloaded = new Selection(database, ROOT);
    expect(reloaded.paths).toEqual(['a', 'b']);
    expect(reloaded.wants('a/x')).toBe(true);
    expect(reloaded.wants('c/x')).toBe(false);
  });

  it('keeps pins separate from the selection and flags the files they cover', async () => {
    await downloaded('cache/a.txt', 'a');
    await downloaded('cacheX/b.txt', 'b');
    const pins = new Pins(database, ROOT);
    pins.set('cache', true);
    expect(pins.paths).toEqual(['cache']);
    expect(database.files.get(ROOT, 'cache/a.txt')?.pinned).toBe(true);
    expect(database.files.get(ROOT, 'cacheX/b.txt')?.pinned).toBe(false);
    expect(database.selections.list(ROOT)).toEqual([]);
    pins.set('cache', false);
    expect(database.files.get(ROOT, 'cache/a.txt')?.pinned).toBe(false);
  });
});

describe('placeholders', () => {
  it('records metadata only for unwanted files and follows hub deletes', () => {
    const wants = wantsFrom(['keep']);
    placeholders.mirror([entry('keep/k.txt', 1), entry('skip/s.txt', 2, 7)], wants);
    expect(database.files.get(ROOT, 'keep/k.txt')).toBeUndefined();
    const stored = database.files.get(ROOT, 'skip/s.txt');
    expect(isPlaceholder(stored)).toBe(true);
    expect(stored).toMatchObject({ bytes: 7, hubRev: 2 });
    placeholders.mirror([entry('skip/s.txt', 3, 9)], wants);
    expect(database.files.get(ROOT, 'skip/s.txt')).toMatchObject({ bytes: 9, hubRev: 3 });
    placeholders.mirror([entry('skip/s.txt', 4, 9, true)], wants);
    expect(database.files.get(ROOT, 'skip/s.txt')).toBeUndefined();
  });

  it('never replaces downloaded content with a placeholder', async () => {
    await downloaded('skip/s.txt', 'real');
    placeholders.mirror([entry('skip/s.txt', 9)], wantsFrom(['keep']));
    expect(database.files.get(ROOT, 'skip/s.txt')).toMatchObject({
      localHashState: 'hashed',
      hubRev: 4,
    });
  });

  it('evicts unwanted content from disk and keeps the metadata', async () => {
    await downloaded('skip/s.txt', 'bye');
    await downloaded('keep/k.txt', 'stay');
    const kept = await placeholders.evict(wantsFrom(['keep']));
    expect(kept).toEqual([]);
    await expect(stat(disk('skip/s.txt'))).rejects.toThrow();
    await expect(stat(disk('keep/k.txt'))).resolves.toBeDefined();
    const stored = database.files.get(ROOT, 'skip/s.txt');
    expect(isPlaceholder(stored)).toBe(true);
    expect(stored).toMatchObject({ bytes: 3, hubRev: 4 });
  });

  it('keeps a file edited since it was synced and reports it', async () => {
    await downloaded('skip/s.txt', 'bye');
    await writeFile(disk('skip/s.txt'), 'edited locally');
    await utimes(disk('skip/s.txt'), new Date(2030, 0, 1), new Date(2030, 0, 1));
    const kept = await placeholders.evict(wantsFrom(['keep']));
    expect(kept).toEqual(['skip/s.txt']);
    await expect(stat(disk('skip/s.txt'))).resolves.toBeDefined();
    expect(isPlaceholder(database.files.get(ROOT, 'skip/s.txt'))).toBe(false);
  });

  it('keeps a file whose change is still waiting to be pushed', async () => {
    await downloaded('skip/s.txt', 'bye');
    database.pendingOps.enqueue({
      opId: 'op-1',
      kind: 'tombstone',
      payload: { relPath: 'skip/s.txt', baseRev: 4 },
    });
    expect(await placeholders.evict(wantsFrom(['keep']))).toEqual(['skip/s.txt']);
  });

  it('counts and releases the placeholders a wider selection covers', () => {
    const narrow = wantsFrom(['keep']);
    placeholders.mirror(
      [entry('skip/a.txt', 1, 5), entry('skip/b.txt', 1, 6), entry('o.txt', 1, 4)],
      narrow,
    );
    const wider = wantsFrom(['keep', 'skip']);
    expect(placeholders.downloadBytes(wider)).toBe(11);
    expect(placeholders.release(wider)).toBe(2);
    expect(database.files.get(ROOT, 'skip/a.txt')).toBeUndefined();
    expect(isPlaceholder(database.files.get(ROOT, 'o.txt'))).toBe(true);
  });

  it('forgets placeholders the hub no longer lists', () => {
    placeholders.mirror([entry('skip/a.txt', 1), entry('skip/b.txt', 1)], wantsFrom(['keep']));
    placeholders.forget(new Set(['skip/a.txt']));
    expect(database.files.get(ROOT, 'skip/a.txt')).toBeDefined();
    expect(database.files.get(ROOT, 'skip/b.txt')).toBeUndefined();
  });
});
