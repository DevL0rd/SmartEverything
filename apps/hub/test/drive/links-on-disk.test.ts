import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DriveItem } from '@smarteverything/domain';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { scanHandler, type ScanEnvironment } from '../../src/drive/jobs';
import { DrivePathError, ORPHAN_DIRECTORY, resolveInRoot } from '../../src/drive/paths';
import { DriveInodesRepository, type DriveInode } from '../../src/store/repositories/drive-inodes';
import { testLogger } from '../support/logs';
import { bundleWorker, driveRoot, NOW, openDriveFixture, type DriveFixture } from './drive-fixture';

const ROOT = '0d000000-0000-4000-8000-000000000031';

let bundleFolder = '';
let workerScript = '';
let tree = '';
let outside = '';
let fixture: DriveFixture;
let inodes: DriveInodesRepository;

beforeAll(async () => {
  bundleFolder = mkdtempSync(join(tmpdir(), 'links-bundle-'));
  workerScript = join(bundleFolder, 'scanner-worker.mjs');
  await bundleWorker('scanner-worker.ts', workerScript);
});

afterAll(() => {
  rmSync(bundleFolder, { recursive: true, force: true });
});

beforeEach(() => {
  tree = mkdtempSync(join(tmpdir(), 'links-tree-'));
  outside = mkdtempSync(join(tmpdir(), 'links-outside-'));
  fixture = openDriveFixture();
  fixture.addDrive(driveRoot(ROOT), tree);
  inodes = new DriveInodesRepository(fixture.context);
});

afterEach(() => {
  fixture.database.close();
  rmSync(tree, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

function environment(): ScanEnvironment {
  return {
    store: {
      driveRoots: fixture.roots,
      driveItems: fixture.items,
      driveInodes: inodes,
      feed: fixture.feed,
      write: (work) => fixture.context.write(work),
      now: () => new Date(NOW),
    },
    availability: () => Promise.resolve('online'),
    mounted: (): boolean => false,
    workerScript,
    log: testLogger(),
  };
}

async function scan(): Promise<void> {
  await scanHandler(environment())({ kind: 'scan', rootId: ROOT }, new AbortController().signal);
}

function put(path: string, text = 'x'): void {
  const full = join(tree, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, text);
}

function item(relPath: string): DriveItem | undefined {
  return fixture.items.byPath(ROOT, relPath, null);
}

function inodeOf(relPath: string): DriveInode {
  const found = item(relPath);
  if (found === undefined) throw new Error(`no item at ${relPath}`);
  const inode = inodes.ofItem(found.id);
  if (inode === undefined) throw new Error(`no inode for ${relPath}`);
  return inode;
}

function paths(): string[] {
  return fixture.database
    .prepare('select rel_path from drive_items where root_id = ? order by rel_path')
    .all(ROOT)
    .map((row) => String(row['rel_path']));
}

describe('symlinks on the disk', () => {
  it('records a link that points outside the drive as a link item and never follows it', async () => {
    writeFileSync(join(outside, 'secret.txt'), 'secret');
    mkdirSync(join(outside, 'folder'));
    writeFileSync(join(outside, 'folder', 'inner.txt'), 'inner');
    symlinkSync(join(outside, 'secret.txt'), join(tree, 'secret-link'));
    symlinkSync(join(outside, 'folder'), join(tree, 'folder-link'));
    await scan();
    expect(paths()).toEqual(['folder-link', 'secret-link']);
    expect(item('secret-link')).toMatchObject({
      kind: 'link',
      linkTarget: join(outside, 'secret.txt'),
    });
    expect(item('folder-link')).toMatchObject({
      kind: 'link',
      linkTarget: join(outside, 'folder'),
    });
    expect(inodeOf('secret-link')).toMatchObject({ type: 'symlink' });
  });

  it('records a dangling link and a link that stays inside the drive', async () => {
    put('real.txt');
    symlinkSync('real.txt', join(tree, 'inside-link'));
    symlinkSync('nowhere', join(tree, 'dangling-link'));
    await scan();
    expect(item('inside-link')).toMatchObject({ kind: 'link', linkTarget: 'real.txt' });
    expect(item('dangling-link')).toMatchObject({ kind: 'link', linkTarget: 'nowhere' });
  });

  it('keeps a link unchanged on a rescan and follows its target change', async () => {
    symlinkSync('first', join(tree, 'link'));
    await scan();
    const before = item('link');
    await scan();
    expect(item('link')?.rev).toBe(before?.rev);
    unlinkSync(join(tree, 'link'));
    symlinkSync('second', join(tree, 'link'));
    await scan();
    expect(item('link')).toMatchObject({ kind: 'link', linkTarget: 'second', id: before?.id });
  });

  it('replaces a file with a link as a new item of the new kind', async () => {
    put('thing');
    await scan();
    const before = item('thing');
    unlinkSync(join(tree, 'thing'));
    symlinkSync('elsewhere', join(tree, 'thing'));
    await scan();
    expect(item('thing')).toMatchObject({ kind: 'link' });
    expect(item('thing')?.id).not.toBe(before?.id);
    expect(inodes.find(inodeOf('thing').id)).toBeDefined();
  });

  it('refuses to resolve a path through a link that stays inside the drive', async () => {
    mkdirSync(join(tree, 'real'));
    put('real/file.txt');
    symlinkSync('real', join(tree, 'alias'));
    const failure = await resolveInRoot(tree, 'alias/file.txt').catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(DrivePathError);
    expect(failure).toMatchObject({ failure: 'escape' });
    const leaf = await resolveInRoot(tree, 'alias').catch((cause: unknown) => cause);
    expect(leaf).toMatchObject({ failure: 'escape' });
  });
});

describe('special files on the disk', () => {
  it('records a fifo and a socket and keeps them when the disk object goes away', async () => {
    execFileSync('mkfifo', [join(tree, 'pipe')]);
    const server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(join(tree, 'sock'), resolve);
    });
    try {
      await scan();
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    }
    expect(item('pipe')).toMatchObject({ kind: 'special' });
    expect(item('sock')).toMatchObject({ kind: 'special' });
    expect(inodeOf('pipe')).toMatchObject({ type: 'fifo' });
    expect(inodeOf('sock')).toMatchObject({ type: 'socket' });
    rmSync(join(tree, 'pipe'), { force: true });
    rmSync(join(tree, 'sock'), { force: true });
    await scan();
    expect(item('pipe')).toMatchObject({ kind: 'special' });
    expect(item('sock')).toMatchObject({ kind: 'special' });
  });

  it('never sweeps a metadata-only special item that has no disk object', async () => {
    execFileSync('mkfifo', [join(tree, 'pipe')]);
    await scan();
    const special = item('pipe');
    rmSync(join(tree, 'pipe'));
    put('other.txt');
    await scan();
    await scan();
    expect(item('pipe')?.id).toBe(special?.id);
    expect(paths()).toEqual(['other.txt', 'pipe']);
  });
});

describe('modes on the disk', () => {
  it('lets the disk win when its mode differs from the stored mode', async () => {
    put('script.sh');
    chmodSync(join(tree, 'script.sh'), 0o644);
    await scan();
    expect(inodeOf('script.sh').mode).toBe(0o644);
    chmodSync(join(tree, 'script.sh'), 0o755);
    await scan();
    expect(inodeOf('script.sh').mode).toBe(0o755);
    chmodSync(join(tree, 'script.sh'), 0o600);
    await scan();
    expect(inodeOf('script.sh').mode).toBe(0o600);
  });

  it('does not see drift in the owner bits the hub forces on the disk', async () => {
    put('read-only.txt');
    chmodSync(join(tree, 'read-only.txt'), 0o444);
    await scan();
    expect(inodeOf('read-only.txt').mode).toBe(0o444);
    const before = item('read-only.txt');
    chmodSync(join(tree, 'read-only.txt'), 0o644);
    await scan();
    expect(inodeOf('read-only.txt').mode).toBe(0o444);
    expect(item('read-only.txt')?.rev).toBe(before?.rev);
  });

  it('keeps a sticky bit that lives only in the stored mode', async () => {
    mkdirSync(join(tree, 'shared'));
    chmodSync(join(tree, 'shared'), 0o777);
    await scan();
    inodes.setAttributes(inodeOf('shared').id, { mode: 0o1777 });
    await scan();
    await scan();
    expect(inodeOf('shared').mode).toBe(0o1777);
  });

  it('picks up the executable bit of an already indexed file on the next scan', async () => {
    put('tool');
    await scan();
    const before = item('tool');
    chmodSync(join(tree, 'tool'), 0o755);
    await scan();
    expect(inodeOf('tool').mode).toBe(0o755);
    expect(item('tool')?.id).toBe(before?.id);
  });

  it('records the folder mode and keeps a stable rev when nothing changes', async () => {
    mkdirSync(join(tree, 'dir'));
    chmodSync(join(tree, 'dir'), 0o700);
    await scan();
    expect(inodeOf('dir').mode).toBe(0o700);
    const before = item('dir');
    await scan();
    expect(item('dir')?.rev).toBe(before?.rev);
  });
});

describe('hard links on the disk', () => {
  it('keeps the names of one disk file as one inode', async () => {
    put('a.txt', 'shared');
    linkSync(join(tree, 'a.txt'), join(tree, 'b.txt'));
    await scan();
    expect(inodeOf('a.txt').id).toBe(inodeOf('b.txt').id);
    expect(inodes.linkCount(inodeOf('a.txt').id)).toBe(2);
    expect(item('a.txt')?.id).not.toBe(item('b.txt')?.id);
  });

  it('adds a later hard link to the inode of its sibling', async () => {
    put('a.txt', 'shared');
    await scan();
    linkSync(join(tree, 'a.txt'), join(tree, 'b.txt'));
    await scan();
    expect(inodeOf('a.txt').id).toBe(inodeOf('b.txt').id);
    const before = item('a.txt');
    await scan();
    expect(item('a.txt')?.rev).toBe(before?.rev);
  });

  it('drops one name and keeps the inode of the other', async () => {
    put('a.txt', 'shared');
    linkSync(join(tree, 'a.txt'), join(tree, 'b.txt'));
    await scan();
    const kept = inodeOf('b.txt').id;
    unlinkSync(join(tree, 'a.txt'));
    await scan();
    expect(paths()).toEqual(['b.txt']);
    expect(inodeOf('b.txt').id).toBe(kept);
    expect(inodes.linkCount(kept)).toBe(1);
  });

  it('keeps the item and its inode when a linked name is renamed', async () => {
    put('a.txt', 'shared');
    linkSync(join(tree, 'a.txt'), join(tree, 'b.txt'));
    await scan();
    const renamed = item('b.txt');
    const shared = inodeOf('b.txt').id;
    renameSync(join(tree, 'b.txt'), join(tree, 'c.txt'));
    await scan();
    expect(paths()).toEqual(['a.txt', 'c.txt']);
    expect(item('c.txt')?.id).toBe(renamed?.id);
    expect(inodeOf('c.txt').id).toBe(shared);
    expect(inodeOf('a.txt').id).toBe(shared);
  });

  it('gives a name replaced by an unrelated file its own inode', async () => {
    put('a.txt', 'shared');
    linkSync(join(tree, 'a.txt'), join(tree, 'b.txt'));
    await scan();
    const shared = inodeOf('b.txt').id;
    unlinkSync(join(tree, 'b.txt'));
    put('b.txt', 'unrelated and longer');
    await scan();
    expect(inodeOf('b.txt').id).not.toBe(shared);
    expect(inodeOf('a.txt').id).toBe(shared);
    expect(readFileSync(join(tree, 'a.txt'), 'utf8')).toBe('shared');
  });
});

describe('the orphan folder', () => {
  it('is not part of the drive', async () => {
    put(`${ORPHAN_DIRECTORY}/12`, 'held');
    put('a.txt');
    await scan();
    expect(paths()).toEqual(['a.txt']);
  });
});
