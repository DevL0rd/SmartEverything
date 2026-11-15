import { randomUUID } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  blockSizeFor,
  type SyncHubMessage,
  type SyncIndexEntry,
  type SyncXattr,
} from '@smarteverything/domain/drive-sync';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  inputOf,
  openDriveSyncDatabase,
  type DriveSyncDatabase,
} from '../../src/drive-sync/db/index.js';
import { PlacementPuller, type PullContention } from '../../src/drive-sync/pull.js';
import type { ScanSkip } from '../../src/drive-sync/scan.js';
import { MemoryXattrs } from './meta-support.js';
import { FakeHubFiles, blockHashes, bytesOf, sha256Of } from './pull-support.js';

const log = new Logger('desktop.drive-sync');
const ROOT = randomUUID();
const INDEX_ID = randomUUID();

interface Rig {
  readonly puller: PlacementPuller;
  readonly hub: FakeHubFiles;
  readonly database: DriveSyncDatabase;
  readonly rootPath: string;
  readonly meta: MemoryXattrs;
  readonly contended: { readonly relPath: string; readonly reason: PullContention }[];
  readonly skipped: ScanSkip[];
  readonly failed: { readonly relPath: string | null; readonly message: string }[];
  dirtied: number;
}

let scratch = '';
let rig: Rig;

function open(platform: NodeJS.Platform): Rig {
  const database = openDriveSyncDatabase(join(scratch, 'client.sqlite'), log);
  const rootPath = join(scratch, 'library');
  const hub = new FakeHubFiles();
  const meta = new MemoryXattrs();
  const contended: Rig['contended'] = [];
  const skipped: ScanSkip[] = [];
  const failed: Rig['failed'] = [];
  const created: Rig = {
    hub,
    database,
    rootPath,
    meta,
    contended,
    skipped,
    failed,
    dirtied: 0,
    puller: new PlacementPuller({
      placementId: ROOT,
      driveId: ROOT,
      rootPath,
      platform,
      meta,
      tolerance: (): bigint => 0n,
      database,
      source: hub,
      wants: (): boolean => true,
      sink: {
        pulled: (): void => undefined,
        contended: (result): void => {
          contended.push(result);
        },
        deferred: (): void => undefined,
        skipped: (skips): void => {
          skipped.push(...skips);
        },
        dirtied: (): void => {
          created.dirtied += 1;
        },
        progress: (): void => undefined,
        blocked: (): void => undefined,
        failed: (failure): void => {
          failed.push(failure);
        },
      },
      log,
    }),
  };
  return created;
}

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'drive-sync-pull-meta-'));
  await mkdir(join(scratch, 'library'), { recursive: true });
  rig = open(process.platform);
});

afterEach(async () => {
  rig.database.close();
  await rm(scratch, { recursive: true, force: true });
});

const MTIME_NS = '1793527200000000000';
const TAG: SyncXattr = { name: 'user.tag', value: Buffer.from('blue').toString('base64') };

type FileEntry = Extract<SyncIndexEntry, { readonly kind: 'file' }>;
type LinkEntry = Extract<SyncIndexEntry, { readonly kind: 'link' }>;
type FolderEntry = Extract<SyncIndexEntry, { readonly kind: 'folder' }>;

function file(
  relPath: string,
  content: Buffer,
  rev: number,
  extra: Partial<Omit<FileEntry, 'kind'>> = {},
): FileEntry {
  const itemId = randomUUID();
  rig.hub.contents.set(itemId, content);
  return {
    itemId,
    relPath,
    kind: 'file',
    mtime: '2026-11-01T10:00:00.000Z',
    mtimeNs: MTIME_NS,
    rev,
    deleted: false,
    mode: 0o644,
    xattrs: [],
    inode: null,
    bytes: content.length,
    blockSize: blockSizeFor(content.length),
    blocksHash: sha256Of(blockHashes(content)),
    ...extra,
  };
}

function folder(relPath: string, rev: number, mode: number): FolderEntry {
  return {
    itemId: randomUUID(),
    relPath,
    kind: 'folder',
    mtime: '2026-11-01T10:00:00.000Z',
    mtimeNs: MTIME_NS,
    rev,
    deleted: false,
    mode,
    xattrs: [],
  };
}

function symlinkEntry(relPath: string, target: string, rev: number): LinkEntry {
  return {
    itemId: randomUUID(),
    relPath,
    kind: 'link',
    mtime: '2026-11-01T10:00:00.000Z',
    mtimeNs: MTIME_NS,
    rev,
    deleted: false,
    mode: 0o777,
    xattrs: [],
    inode: null,
    target,
  };
}

async function deliver(entries: readonly SyncIndexEntry[], seq = 3): Promise<void> {
  const message: SyncHubMessage = { type: 'index', indexId: INDEX_ID, seq, entries, last: true };
  rig.puller.receive(message);
  await rig.puller.settled();
}

async function update(entries: readonly SyncIndexEntry[], seq: number): Promise<void> {
  rig.puller.receive({ type: 'index_update', seq, entries });
  await rig.puller.settled();
}

function disk(relPath: string): string {
  return join(rig.rootPath, ...relPath.split('/'));
}

async function modeOf(relPath: string): Promise<number> {
  return Number((await lstat(disk(relPath), { bigint: true })).mode & 0o7777n);
}

describe('modes and times from the hub', () => {
  it('writes the hub mode, time and attributes onto a pulled file and records them', async () => {
    const entry = file('run.sh', bytesOf(1, 'r'), 2, { mode: 0o754, xattrs: [TAG] });
    await deliver([entry]);
    expect(await modeOf('run.sh')).toBe(0o754);
    expect(Math.abs((await stat(disk('run.sh'))).mtimeMs - 1793527200000)).toBeLessThan(2);
    expect(rig.meta.held.get(join(rig.rootPath, '.run.sh.sync-tmp'))).toEqual([TAG]);
    expect(rig.database.files.get(ROOT, 'run.sh')).toMatchObject({
      mode: 0o754,
      xattrs: [TAG],
      metaDirty: false,
      hubRev: 2,
    });
  });

  it('applies a mode the hub changed without fetching the content again', async () => {
    const first = file('run.sh', bytesOf(1, 'r'), 2, { mode: 0o644 });
    await deliver([first]);
    const fetched = rig.hub.fetched.length;
    await update([{ ...first, mode: 0o755 }], 4);
    expect(await modeOf('run.sh')).toBe(0o755);
    expect(rig.hub.fetched.length).toBe(fetched);
    expect(rig.database.files.get(ROOT, 'run.sh')?.mode).toBe(0o755);
  });

  it('keeps local metadata that is still waiting to be pushed and asks for a scan', async () => {
    const first = file('run.sh', bytesOf(1, 'r'), 2, { mode: 0o644 });
    await deliver([first]);
    const local = rig.database.files.get(ROOT, 'run.sh');
    if (local === undefined) throw new Error('missing');
    await chmod(disk('run.sh'), 0o700);
    rig.database.files.upsert(inputOf(local, { mode: 0o700, metaDirty: true }));
    await update([{ ...first, mode: 0o755 }], 4);
    expect(await modeOf('run.sh')).toBe(0o700);
    expect(rig.dirtied).toBe(1);
  });

  it('leaves a file edited on disk alone and reports it', async () => {
    const first = file('run.sh', bytesOf(1, 'r'), 2, { mode: 0o644 });
    await deliver([first]);
    await writeFile(disk('run.sh'), 'edited meanwhile');
    await update([{ ...first, mode: 0o755 }], 4);
    expect(rig.contended).toEqual([{ relPath: 'run.sh', reason: 'local_edit' }]);
    expect(await readFile(disk('run.sh'), 'utf8')).toBe('edited meanwhile');
  });

  it('removes attributes the hub no longer has and keeps foreign namespaces in the record', async () => {
    const foreign: SyncXattr = { name: 'security.label', value: 'eA==' };
    const first = file('a.txt', bytesOf(1, 'a'), 2, { xattrs: [TAG, foreign] });
    await deliver([first]);
    expect(rig.meta.held.get(join(rig.rootPath, '.a.txt.sync-tmp'))).toEqual([TAG]);
    rig.meta.held.set(disk('a.txt'), [TAG]);
    await update([{ ...first, xattrs: [foreign] }], 4);
    expect(rig.meta.held.get(disk('a.txt'))).toEqual([]);
    expect(rig.database.files.get(ROOT, 'a.txt')?.xattrs).toEqual([foreign]);
  });

  it('tolerates a disk that refuses attributes and still delivers the file', async () => {
    const entry = file('a.txt', bytesOf(1, 'a'), 2, { xattrs: [TAG] });
    rig.meta.refuse.add(join(rig.rootPath, '.a.txt.sync-tmp'));
    await deliver([entry]);
    expect(rig.failed).toEqual([]);
    expect(await readFile(disk('a.txt'))).toEqual(bytesOf(1, 'a'));
  });

  it('applies a folder mode after the files inside it', async () => {
    await deliver([folder('closed', 1, 0o555), file('closed/inner.txt', bytesOf(1, 'i'), 2)]);
    expect(await modeOf('closed')).toBe(0o555);
    expect(await readFile(disk('closed/inner.txt'))).toEqual(bytesOf(1, 'i'));
    await chmod(disk('closed'), 0o755);
  });
});

describe('symlinks from the hub', () => {
  it('creates a symlink and records its target', async () => {
    await deliver([symlinkEntry('alias', 'a/b/c', 3)]);
    expect(await readlink(disk('alias'))).toBe('a/b/c');
    expect(rig.database.files.get(ROOT, 'alias')).toMatchObject({
      kind: 'link',
      linkTarget: 'a/b/c',
      hubRev: 3,
      blocks: null,
    });
  });

  it('replaces a symlink whose target changed on the hub', async () => {
    const first = symlinkEntry('alias', 'one', 3);
    await deliver([first]);
    await update([{ ...first, rev: 4, target: 'two' }], 5);
    expect(await readlink(disk('alias'))).toBe('two');
  });

  it('keeps a symlink that was retargeted locally and not pushed yet', async () => {
    const first = symlinkEntry('alias', 'one', 3);
    await deliver([first]);
    await rm(disk('alias'));
    await symlink('mine', disk('alias'));
    const local = rig.database.files.get(ROOT, 'alias');
    if (local === undefined) throw new Error('missing');
    rig.database.files.upsert(inputOf(local, { linkTarget: 'mine', metaDirty: true }));
    await update([{ ...first, rev: 4, target: 'two' }], 5);
    expect(rig.contended).toEqual([{ relPath: 'alias', reason: 'local_edit' }]);
    expect(await readlink(disk('alias'))).toBe('mine');
  });

  it('removes a symlink the hub deleted', async () => {
    const first = symlinkEntry('alias', 'one', 3);
    await deliver([first]);
    await update([{ ...first, rev: 4, deleted: true }], 5);
    await expect(lstat(disk('alias'))).rejects.toThrow();
    expect(rig.database.files.get(ROOT, 'alias')).toBeUndefined();
  });

  it('refuses to overwrite a different file that already sits at the symlink path', async () => {
    await writeFile(disk('alias'), 'mine');
    await deliver([symlinkEntry('alias', 'one', 3)]);
    expect(rig.contended).toEqual([{ relPath: 'alias', reason: 'new_on_both' }]);
    expect(await readFile(disk('alias'), 'utf8')).toBe('mine');
  });

  it('lists symlinks as not created on Windows', async () => {
    rig.database.close();
    await rm(join(scratch, 'client.sqlite'));
    rig = open('win32');
    await deliver([symlinkEntry('alias', 'one', 3), file('plain.txt', bytesOf(1, 'p'), 2)]);
    expect(rig.skipped).toEqual([{ relPath: 'alias', reason: 'link_unsupported' }]);
    await expect(lstat(disk('alias'))).rejects.toThrow();
    expect(rig.database.files.get(ROOT, 'alias')).toBeUndefined();
    expect(await readFile(disk('plain.txt'))).toEqual(bytesOf(1, 'p'));
  });

  it('keeps the hub mode in the record on Windows where it cannot be applied', async () => {
    rig.database.close();
    await rm(join(scratch, 'client.sqlite'));
    rig = open('win32');
    await deliver([file('run.sh', bytesOf(1, 'r'), 2, { mode: 0o755 })]);
    expect(rig.database.files.get(ROOT, 'run.sh')?.mode).toBe(0o755);
    expect(await modeOf('run.sh')).not.toBe(0o755);
  });
});

describe('hard links from the hub', () => {
  it('links the second name of one hub inode to the first instead of fetching it again', async () => {
    const content = bytesOf(2, 'h');
    const first = file('a.txt', content, 2, { inode: 77 });
    const second = file('b.txt', content, 2, { inode: 77 });
    await deliver([first, second]);
    const one = await stat(disk('a.txt'));
    const two = await stat(disk('b.txt'));
    expect(two.ino).toBe(one.ino);
    expect(one.nlink).toBe(2);
    const fetchedBlocks = rig.hub.fetched.length;
    expect(fetchedBlocks).toBe(2);
    expect(rig.database.files.get(ROOT, 'b.txt')).toMatchObject({ hubInode: 77 });
    expect(rig.database.files.get(ROOT, 'a.txt')?.linkKey).toBe(
      rig.database.files.get(ROOT, 'b.txt')?.linkKey,
    );
    expect(rig.database.files.get(ROOT, 'a.txt')?.linkKey).not.toBeNull();
  });

  it('adds a name to a file that is already on disk when the hub links it later', async () => {
    const content = bytesOf(1, 'h');
    const first = file('a.txt', content, 2, { inode: 5 });
    await deliver([first]);
    const second = file('b.txt', content, 3, { inode: 5 });
    await update([{ ...second, rev: 2 }], 6);
    expect((await stat(disk('b.txt'))).ino).toBe((await stat(disk('a.txt'))).ino);
  });

  it('keeps separate files for different hub inodes with equal content', async () => {
    const content = bytesOf(1, 'h');
    await deliver([
      file('a.txt', content, 2, { inode: 1 }),
      file('b.txt', content, 2, { inode: 2 }),
    ]);
    expect((await stat(disk('b.txt'))).ino).not.toBe((await stat(disk('a.txt'))).ino);
  });
});
