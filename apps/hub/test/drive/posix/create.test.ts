import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fileDraft, folderDraft, identityOf, isoOf } from '../../../src/drive/changes';
import type { FileStamp } from '../../../src/drive/intents';
import {
  create,
  diskLink,
  diskMode,
  diskNames,
  diskText,
  linkRequest,
  mkdir,
  mknodRequest,
  openPosixRig,
  putOnDisk,
  refusal,
  symlinkRequest,
  type PosixRig,
} from './posix-rig';

let rig: PosixRig;

beforeEach(async () => {
  rig = await openPosixRig(true);
});

afterEach(async () => {
  await rig.close();
});

describe('mkdir', () => {
  it('makes a folder with the given mode and owner and mirrors the mode onto the disk', async () => {
    const entry = await rig.posix.mkdir(rig.scope, {
      ...mkdir('docs', rig.rootIno, 0o750),
      uid: 1000,
      gid: 100,
    });
    expect(entry.attr).toMatchObject({ type: 2, mode: 0o750, uid: 1000, gid: 100, nlink: 2 });
    expect(await diskMode(rig.mine, 'docs')).toBe(0o750);
    const item = rig.opened.store.driveItems.byPath(rig.mine.id, 'docs', null);
    expect(item?.kind).toBe('folder');
    expect(rig.opened.store.driveFeed.latestSeqInRoot(rig.mine.id)).toBeGreaterThan(0);
  });

  it('keeps the Hub able to read a folder that denies the owner', async () => {
    await rig.posix.mkdir(rig.scope, mkdir('closed', rig.rootIno, 0o070));
    expect(await diskMode(rig.mine, 'closed')).toBe(0o770);
    const entry = await rig.posix.lookup(rig.scope, { parent: rig.rootIno, name: 'closed' });
    expect(entry.attr.mode).toBe(0o070);
  });

  it('moves the change time of the parent forward', async () => {
    const before = await rig.posix.getattr(rig.scope, rig.rootIno);
    await rig.posix.mkdir(rig.scope, mkdir('a', rig.rootIno));
    const after = await rig.posix.getattr(rig.scope, rig.rootIno);
    expect(after.ctimeNs).toBeGreaterThan(before.ctimeNs);
    expect(after.mtimeNs).toBeGreaterThan(before.mtimeNs);
    expect(after.nlink).toBe(before.nlink + 1);
  });

  it('refuses an existing name, a name on disk the index does not know, and a reserved name', async () => {
    await rig.posix.mkdir(rig.scope, mkdir('a', rig.rootIno));
    expect(await refusal(rig.posix.mkdir(rig.scope, mkdir('a', rig.rootIno)))).toBe('EEXIST');
    await putOnDisk(rig.mine, 'stray', 'x');
    expect(await refusal(rig.posix.mkdir(rig.scope, mkdir('stray', rig.rootIno)))).toBe('EEXIST');
    expect(await refusal(rig.posix.mkdir(rig.scope, mkdir('.se-orphans', rig.rootIno)))).toBe(
      'EPERM',
    );
    expect(await refusal(rig.posix.mkdir(rig.scope, mkdir('.smarteverything', rig.rootIno)))).toBe(
      'EPERM',
    );
  });

  it('refuses a parent that is a file or a bad name', async () => {
    const file = await rig.posix.create(rig.scope, create('f', rig.rootIno), new Uint8Array());
    expect(await refusal(rig.posix.mkdir(rig.scope, mkdir('x', file.ino)))).toBe('ENOTDIR');
    expect(await refusal(rig.posix.mkdir(rig.scope, mkdir('é'.repeat(128), rig.rootIno)))).toBe(
      'ENAMETOOLONG',
    );
    expect(await refusal(rig.posix.mkdir(rig.scope, mkdir('a\ud800', rig.rootIno)))).toBe('EILSEQ');
  });

  it('refuses a person who may only view', async () => {
    const scope = await rig.granted('view');
    expect(await refusal(rig.posix.mkdir(scope, mkdir('x', scope.rootInode)))).toBe('EACCES');
  });

  it('lets a person with edit access make a folder inside the granted folder only', async () => {
    const scope = await rig.granted('edit');
    const made = await rig.posix.mkdir(scope, mkdir('x', scope.rootInode));
    expect(rig.opened.store.driveItems.byPath(rig.mine.id, 'docs/x', null)?.id).toBeDefined();
    expect(made.attr.type).toBe(2);
    expect(await refusal(rig.posix.mkdir(scope, mkdir('y', rig.rootIno)))).toBe('ESTALE');
  });
});

async function stagedLeft(directory: string): Promise<readonly string[]> {
  try {
    return await readdir(directory);
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return [];
    throw cause;
  }
}

describe('create', () => {
  it('makes an empty file with the given mode and owner', async () => {
    const entry = await rig.posix.create(
      rig.scope,
      {
        ...create('a.txt', rig.rootIno, { mode: 0o4755 }),
        uid: 5,
        gid: 6,
      },
      new Uint8Array(),
    );
    expect(entry.attr).toMatchObject({ type: 1, mode: 0o4755, uid: 5, gid: 6, size: 0, nlink: 1 });
    expect(await diskText(rig.mine, 'a.txt')).toBe('');
    expect(await diskMode(rig.mine, 'a.txt')).toBe(0o755);
    expect(rig.opened.store.driveItems.byPath(rig.mine.id, 'a.txt', null)?.kind).toBe('document');
  });

  it('refuses an existing name and keeps the first file', async () => {
    const first = await rig.posix.create(rig.scope, create('a', rig.rootIno), new Uint8Array());
    expect(
      await refusal(rig.posix.create(rig.scope, create('a', rig.rootIno), new Uint8Array())),
    ).toBe('EEXIST');
    expect((await rig.posix.lookup(rig.scope, { parent: rig.rootIno, name: 'a' })).ino).toBe(
      first.ino,
    );
  });

  it('creates the file with its leased inode number, content and times in one step', async () => {
    const request = { ...create('made.txt', rig.rootIno), mtimeNs: 1_763_200_000_123_456_789n };
    const entry = await rig.posix.create(rig.scope, request, new TextEncoder().encode('hello'));
    expect(entry.ino).toBe(request.ino);
    expect(entry.attr).toMatchObject({ size: 5, mtimeNs: 1_763_200_000_123_456_789n });
    expect(await diskText(rig.mine, 'made.txt')).toBe('hello');
    expect(
      await refusal(
        rig.posix.create(
          rig.scope,
          { ...create('other.txt', rig.rootIno), ino: request.ino },
          new Uint8Array(),
        ),
      ),
    ).toBe('EEXIST');
  });

  it('refuses a folder or a link in the way, and a file the index does not know', async () => {
    await rig.posix.mkdir(rig.scope, mkdir('d', rig.rootIno));
    await rig.posix.symlink(rig.scope, symlinkRequest('l', rig.rootIno, 'x'));
    expect(
      await refusal(rig.posix.create(rig.scope, create('d', rig.rootIno), new Uint8Array())),
    ).toBe('EEXIST');
    expect(
      await refusal(rig.posix.create(rig.scope, create('l', rig.rootIno), new Uint8Array())),
    ).toBe('EEXIST');
    await putOnDisk(rig.mine, 'stray', 'x');
    expect(
      await refusal(rig.posix.create(rig.scope, create('stray', rig.rootIno), new Uint8Array())),
    ).toBe('EEXIST');
    expect(await stagedLeft(join(rig.mine.path, '.smarteverything', 'tmp'))).toEqual([]);
  });

  it('refuses a reserved name, a view-only person and a parent that is a file', async () => {
    expect(
      await refusal(
        rig.posix.create(rig.scope, create('.se-orphans', rig.rootIno), new Uint8Array()),
      ),
    ).toBe('EPERM');
    const scope = await rig.granted('view');
    expect(
      await refusal(rig.posix.create(scope, create('x', scope.rootInode), new Uint8Array())),
    ).toBe('EACCES');
    const file = await rig.posix.create(rig.scope, create('f', rig.rootIno), new Uint8Array());
    expect(
      await refusal(rig.posix.create(rig.scope, create('x', file.ino), new Uint8Array())),
    ).toBe('ENOTDIR');
  });
});

describe('mknod', () => {
  it('records a fifo, a socket and devices without making anything on disk', async () => {
    const fifo = await rig.posix.mknod(rig.scope, mknodRequest('p', rig.rootIno, 4));
    const socket = await rig.posix.mknod(rig.scope, mknodRequest('s', rig.rootIno, 5));
    const char = await rig.posix.mknod(rig.scope, mknodRequest('c', rig.rootIno, 6, 259));
    const block = await rig.posix.mknod(rig.scope, mknodRequest('b', rig.rootIno, 7, 8));
    expect([fifo.attr.type, socket.attr.type, char.attr.type, block.attr.type]).toEqual([
      4, 5, 6, 7,
    ]);
    expect([fifo.attr.rdev, char.attr.rdev, block.attr.rdev]).toEqual([0, 259, 8]);
    expect(await diskNames(rig.mine)).toEqual([]);
    const item = rig.opened.store.driveItems.byPath(rig.mine.id, 'c', null);
    expect(item?.kind).toBe('special');
  });

  it('refuses an existing name', async () => {
    await rig.posix.mknod(rig.scope, mknodRequest('p', rig.rootIno, 4));
    expect(await refusal(rig.posix.mknod(rig.scope, mknodRequest('p', rig.rootIno, 4)))).toBe(
      'EEXIST',
    );
  });
});

describe('symlink', () => {
  it('makes a real link on the disk and never follows it', async () => {
    const entry = await rig.posix.symlink(rig.scope, {
      ...symlinkRequest('l', rig.rootIno, '/etc/passwd'),
      uid: 3,
      gid: 4,
    });
    expect(entry.attr).toMatchObject({ type: 3, mode: 0o777, uid: 3, gid: 4, size: 11 });
    expect(await diskLink(rig.mine, 'l')).toBe('/etc/passwd');
    expect((await lstat(join(rig.mine.path, 'l'))).isSymbolicLink()).toBe(true);
    const item = rig.opened.store.driveItems.byPath(rig.mine.id, 'l', null);
    expect(item).toMatchObject({ kind: 'link', linkTarget: '/etc/passwd' });
    expect(await refusal(rig.posix.mkdir(rig.scope, mkdir('x', entry.ino)))).toBe('ENOTDIR');
  });

  it('refuses an existing name and a name on disk the index does not know', async () => {
    await rig.posix.symlink(rig.scope, symlinkRequest('l', rig.rootIno, 'a'));
    expect(await refusal(rig.posix.symlink(rig.scope, symlinkRequest('l', rig.rootIno, 'a')))).toBe(
      'EEXIST',
    );
    await putOnDisk(rig.mine, 'stray', 'x');
    expect(
      await refusal(rig.posix.symlink(rig.scope, symlinkRequest('stray', rig.rootIno, 'a'))),
    ).toBe('EEXIST');
  });
});

describe('tmpfile', () => {
  it('makes an unnamed file that is given a name later', async () => {
    const entry = await rig.posix.tmpfile(rig.scope, {
      parent: rig.rootIno,
      mode: 0o600,
      uid: null,
      gid: null,
      opKey: new Uint8Array(16),
    });
    expect(entry.attr).toMatchObject({ nlink: 0, size: 0, mode: 0o600 });
    expect(rig.opened.store.driveInodes.byId(entry.ino).orphan).toBe(true);
    expect(await diskNames(rig.mine)).toEqual([]);
    const linked = await rig.posix.link(rig.scope, linkRequest(entry.ino, rig.rootIno, 'kept'));
    expect(linked.nlink).toBe(1);
    expect(await diskText(rig.mine, 'kept')).toBe('');
    expect(rig.opened.store.driveInodes.byId(entry.ino).orphan).toBe(false);
    expect((await rig.posix.lookup(rig.scope, { parent: rig.rootIno, name: 'kept' })).ino).toBe(
      entry.ino,
    );
  });

  it('refuses a view-only person and a parent that is a file', async () => {
    const scope = await rig.granted('view');
    const request = {
      parent: scope.rootInode,
      mode: 0o600,
      uid: null,
      gid: null,
      opKey: new Uint8Array(16),
    };
    expect(await refusal(rig.posix.tmpfile(scope, request))).toBe('EACCES');
    const file = await rig.posix.create(rig.scope, create('f', rig.rootIno), new Uint8Array());
    expect(await refusal(rig.posix.tmpfile(rig.scope, { ...request, parent: file.ino }))).toBe(
      'ENOTDIR',
    );
  });
});

describe('names and concurrency', () => {
  it('refuses a name that is not in Unicode normal form C', async () => {
    expect(
      await refusal(rig.posix.create(rig.scope, create('e\u0301', rig.rootIno), new Uint8Array())),
    ).toBe('EILSEQ');
    await rig.posix.create(rig.scope, create('\u00e9', rig.rootIno), new Uint8Array());
    expect(await diskNames(rig.mine)).toEqual(['\u00e9']);
  });

  it('lets only one of two creations of a name win', async () => {
    const results = await Promise.all([
      refusal(rig.posix.create(rig.scope, create('same', rig.rootIno), new Uint8Array())),
      refusal(rig.posix.create(rig.scope, create('same', rig.rootIno), new Uint8Array())),
      refusal(rig.posix.mkdir(rig.scope, mkdir('same', rig.rootIno))),
    ]);
    expect(results.filter((code) => code === 'no error')).toHaveLength(1);
    expect(results.filter((code) => code === 'EEXIST')).toHaveLength(2);
  });
});

describe('creation racing the scanner', () => {
  function scannerIndexes(name: string, folder: boolean): { readonly id: () => string | null } {
    const { files } = rig.env.change;
    const original = files.stamp.bind(files);
    let indexed: string | null = null;
    Object.assign(files, {
      stamp: async (path: string): Promise<FileStamp | null> => {
        const stamp = await original(path);
        if (stamp !== null && indexed === null && path.endsWith(`/${name}`)) {
          const added = {
            rootId: rig.mine.id,
            parentId: null,
            relPath: name,
            modifiedAt: isoOf(stamp.mtimeNs),
            addedAt: '2026-11-06T00:00:00.000Z',
            outside: true,
            addedByProfileId: null,
          };
          const item = rig.opened.store.driveItems.write({
            item: folder ? folderDraft(added, 0) : fileDraft(added, { bytes: 0, sha256: null }),
            identity: identityOf(stamp),
          }).item;
          indexed = item.id;
        }
        return stamp;
      },
    });
    return { id: () => indexed };
  }

  it('keeps the row the scanner indexed when a file is created at the same moment', async () => {
    const raced = scannerIndexes('raced.txt', false);
    const entry = await rig.posix.create(
      rig.scope,
      create('raced.txt', rig.rootIno),
      new Uint8Array(),
    );
    expect(raced.id()).not.toBeNull();
    const item = rig.opened.store.driveItems.byPath(rig.mine.id, 'raced.txt', null);
    expect(item?.id).toBe(raced.id());
    expect(entry.attr.type).toBe(1);
    expect(rig.opened.store.driveInodes.ofItem(item?.id ?? '')?.id).toBe(entry.ino);
  });

  it('keeps the row the scanner indexed when a folder is made at the same moment', async () => {
    const raced = scannerIndexes('racedir', true);
    const entry = await rig.posix.mkdir(rig.scope, mkdir('racedir', rig.rootIno));
    expect(raced.id()).not.toBeNull();
    expect(rig.opened.store.driveItems.byPath(rig.mine.id, 'racedir', null)?.id).toBe(raced.id());
    expect(entry.attr.type).toBe(2);
  });
});

describe('many files made at once', () => {
  it('lands them together with one sync of their folder and one write to the index', async () => {
    const { files } = rig.env.change;
    const synced: string[] = [];
    const sync = files.syncDirectory.bind(files);
    Object.assign(files, {
      syncDirectory: async (path: string): Promise<void> => {
        synced.push(path);
        await sync(path);
      },
    });
    const store = rig.opened.store;
    const write = store.write.bind(store);
    let writes = 0;
    Object.assign(store, {
      write: <T>(work: () => T): T => {
        writes += 1;
        return write(work);
      },
    });
    const names = Array.from({ length: 12 }, (_, index) => `f${String(index)}.txt`);
    const made = await Promise.all(
      names.map((name) =>
        rig.posix.create(rig.scope, create(name, rig.rootIno), new TextEncoder().encode(name)),
      ),
    );
    expect(new Set(made.map((entry) => entry.ino)).size).toBe(names.length);
    for (const name of names) expect(await diskText(rig.mine, name)).toBe(name);
    expect(synced.length).toBeLessThan(names.length);
    expect(writes).toBeLessThan(names.length * 2);
  });

  it('refuses the second of two files made with one name in one batch', async () => {
    const outcomes = await Promise.all([
      refusal(rig.posix.create(rig.scope, create('same.txt', rig.rootIno), new Uint8Array())),
      refusal(rig.posix.create(rig.scope, create('same.txt', rig.rootIno), new Uint8Array())),
    ]);
    expect(outcomes.sort()).toEqual(['EEXIST', 'no error']);
    expect(await diskNames(rig.mine, '')).toContain('same.txt');
  });
});
