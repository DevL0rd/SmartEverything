import { access, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  create,
  diskIno,
  diskNames,
  diskText,
  linkRequest,
  mkdir,
  mknodRequest,
  openPosixRig,
  refusal,
  removal,
  save,
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

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

describe('link', () => {
  it('gives a file a second name on the same inode and the same disk file', async () => {
    const first = await rig.posix.create(rig.scope, create('a', rig.rootIno), new Uint8Array());
    await save(rig, rig.mine, 'a', 'content');
    const before = await rig.posix.getattr(rig.scope, first.ino);
    const attr = await rig.posix.link(rig.scope, linkRequest(first.ino, rig.rootIno, 'b'));
    expect(attr).toMatchObject({ ino: first.ino, nlink: 2 });
    expect(attr.ctimeNs).toBeGreaterThan(before.ctimeNs);
    expect((await rig.posix.lookup(rig.scope, { parent: rig.rootIno, name: 'b' })).ino).toBe(
      first.ino,
    );
    expect(await diskIno(rig.mine, 'a')).toBe(await diskIno(rig.mine, 'b'));
    expect(await diskText(rig.mine, 'b')).toBe('content');
  });

  it('keeps both names on one disk file when the content is saved again', async () => {
    const first = await rig.posix.create(rig.scope, create('a', rig.rootIno), new Uint8Array());
    await rig.posix.link(rig.scope, linkRequest(first.ino, rig.rootIno, 'b'));
    await save(rig, rig.mine, 'a', 'second');
    expect(await diskText(rig.mine, 'b')).toBe('second');
    expect(await diskIno(rig.mine, 'a')).toBe(await diskIno(rig.mine, 'b'));
    expect((await rig.posix.getattr(rig.scope, first.ino)).nlink).toBe(2);
  });

  it('links a symbolic link and a special file', async () => {
    const link = await rig.posix.symlink(rig.scope, symlinkRequest('l', rig.rootIno, 't'));
    const fifo = await rig.posix.mknod(rig.scope, mknodRequest('p', rig.rootIno, 4));
    expect((await rig.posix.link(rig.scope, linkRequest(link.ino, rig.rootIno, 'l2'))).nlink).toBe(
      2,
    );
    expect((await rig.posix.link(rig.scope, linkRequest(fifo.ino, rig.rootIno, 'p2'))).nlink).toBe(
      2,
    );
    expect(await diskNames(rig.mine)).toEqual(['l', 'l2']);
  });

  it('refuses a folder, an existing name, a reserved name and a view-only person', async () => {
    const dir = await rig.posix.mkdir(rig.scope, mkdir('d', rig.rootIno));
    const file = await rig.posix.create(rig.scope, create('a', rig.rootIno), new Uint8Array());
    expect(await refusal(rig.posix.link(rig.scope, linkRequest(dir.ino, rig.rootIno, 'd2')))).toBe(
      'EPERM',
    );
    expect(await refusal(rig.posix.link(rig.scope, linkRequest(file.ino, rig.rootIno, 'd')))).toBe(
      'EEXIST',
    );
    expect(
      await refusal(rig.posix.link(rig.scope, linkRequest(file.ino, rig.rootIno, '.se-orphans'))),
    ).toBe('EPERM');
    expect(await refusal(rig.posix.link(rig.scope, linkRequest(file.ino, file.ino, 'x')))).toBe(
      'ENOTDIR',
    );
    expect(await refusal(rig.posix.link(rig.scope, linkRequest(99_999, rig.rootIno, 'x')))).toBe(
      'ESTALE',
    );
    const scope = await rig.granted('view');
    const note = await rig.posix.lookup(scope, { parent: scope.rootInode, name: 'note.txt' });
    expect(await refusal(rig.posix.link(scope, linkRequest(note.ino, scope.rootInode, 'n2')))).toBe(
      'EACCES',
    );
  });

  it('answers EXDEV for a file of another drive or outside the mount and makes nothing', async () => {
    await rig.posix.create(rig.scope, create('a', rig.rootIno), new Uint8Array());
    const other = await rig.posix.create(
      rig.memberScope,
      create('m', rig.memberScope.rootInode),
      new Uint8Array(),
    );
    expect(await refusal(rig.posix.link(rig.scope, linkRequest(other.ino, rig.rootIno, 'x')))).toBe(
      'EXDEV',
    );
    const scope = await rig.granted('edit');
    const outside = await rig.posix.lookup(rig.scope, { parent: rig.rootIno, name: 'private.txt' });
    expect(
      await refusal(rig.posix.link(scope, linkRequest(outside.ino, scope.rootInode, 'x'))),
    ).toBe('EXDEV');
    expect(await diskNames(rig.mine)).toEqual(['a', 'docs', 'private.txt']);
    expect(await diskNames(rig.theirs)).toEqual(['m']);
  });
});

describe('unlink', () => {
  it('drops one name and keeps the other with its content', async () => {
    const first = await rig.posix.create(rig.scope, create('a', rig.rootIno), new Uint8Array());
    await save(rig, rig.mine, 'a', 'keep');
    await rig.posix.link(rig.scope, linkRequest(first.ino, rig.rootIno, 'b'));
    const before = await rig.posix.getattr(rig.scope, first.ino);
    await rig.posix.unlink(rig.scope, await removal(rig, rig.scope, 'a', rig.rootIno));
    const after = await rig.posix.getattr(rig.scope, first.ino);
    expect(after.nlink).toBe(1);
    expect(after.ctimeNs).toBeGreaterThan(before.ctimeNs);
    expect(await diskText(rig.mine, 'b')).toBe('keep');
    expect(await exists(join(rig.mine.path, 'a'))).toBe(false);
    expect(await refusal(rig.posix.lookup(rig.scope, { parent: rig.rootIno, name: 'a' }))).toBe(
      'ENOENT',
    );
  });

  it('puts the last name in the trash and moves the folder times', async () => {
    await rig.posix.create(rig.scope, create('a', rig.rootIno), new Uint8Array());
    const before = await rig.posix.getattr(rig.scope, rig.rootIno);
    await rig.posix.unlink(rig.scope, await removal(rig, rig.scope, 'a', rig.rootIno));
    expect(await diskNames(rig.mine)).toEqual([]);
    expect(rig.opened.store.driveTrash.inRoot(rig.mine.id, null, 10).entries).toHaveLength(1);
    expect((await rig.posix.getattr(rig.scope, rig.rootIno)).mtimeNs).toBeGreaterThan(
      before.mtimeNs,
    );
  });

  it('removes a link, and a special file together with its inode', async () => {
    await rig.posix.symlink(rig.scope, symlinkRequest('l', rig.rootIno, 't'));
    const fifo = await rig.posix.mknod(rig.scope, mknodRequest('p', rig.rootIno, 4));
    await rig.posix.unlink(rig.scope, await removal(rig, rig.scope, 'l', rig.rootIno));
    await rig.posix.unlink(rig.scope, await removal(rig, rig.scope, 'p', rig.rootIno));
    expect(await diskNames(rig.mine)).toEqual([]);
    expect(rig.opened.store.driveInodes.find(fifo.ino)).toBeUndefined();
    expect(rig.opened.store.driveItems.byPath(rig.mine.id, 'p', null)).toBeUndefined();
  });

  it('refuses a folder, a missing name and a view-only person', async () => {
    await rig.posix.mkdir(rig.scope, mkdir('d', rig.rootIno));
    expect(
      await refusal(rig.posix.unlink(rig.scope, await removal(rig, rig.scope, 'd', rig.rootIno))),
    ).toBe('EISDIR');
    expect(
      await refusal(rig.posix.unlink(rig.scope, await removal(rig, rig.scope, 'zz', rig.rootIno))),
    ).toBe('ENOENT');
    const scope = await rig.granted('view');
    expect(
      await refusal(
        rig.posix.unlink(scope, await removal(rig, scope, 'note.txt', scope.rootInode)),
      ),
    ).toBe('EACCES');
  });

  it('keeps a file that is still open under an unnamed inode and drops it at the last release', async () => {
    const entry = await rig.posix.create(rig.scope, create('a', rig.rootIno), new Uint8Array());
    await save(rig, rig.mine, 'a', 'open');
    rig.held.add(entry.ino);
    await rig.posix.unlink(rig.scope, await removal(rig, rig.scope, 'a', rig.rootIno));
    expect(rig.opened.store.driveTrash.inRoot(rig.mine.id, null, 10).entries).toHaveLength(0);
    expect(await diskText(rig.mine, `.se-orphans/${String(entry.ino)}`)).toBe('open');
    const attr = await rig.posix.getattr(rig.scope, entry.ino);
    expect(attr).toMatchObject({ nlink: 0, size: 4 });
    expect(await rig.posix.releaseOrphan(rig.mine.id, entry.ino)).toBe(false);
    rig.held.delete(entry.ino);
    expect(await rig.posix.releaseOrphan(rig.mine.id, entry.ino)).toBe(true);
    expect(await readdir(join(rig.mine.path, '.se-orphans'))).toEqual([]);
    expect(rig.opened.store.driveInodes.find(entry.ino)).toBeUndefined();
    expect(await refusal(rig.posix.getattr(rig.scope, entry.ino))).toBe('ESTALE');
  });

  it('does not release an inode that has a name', async () => {
    const entry = await rig.posix.create(rig.scope, create('a', rig.rootIno), new Uint8Array());
    expect(await rig.posix.releaseOrphan(rig.mine.id, entry.ino)).toBe(false);
    expect(await rig.posix.releaseOrphan(rig.mine.id, 99_999)).toBe(false);
  });
});

describe('rmdir', () => {
  it('removes an empty folder and lowers the link count of its parent', async () => {
    await rig.posix.mkdir(rig.scope, mkdir('d', rig.rootIno));
    const before = await rig.posix.getattr(rig.scope, rig.rootIno);
    await rig.posix.rmdir(rig.scope, await removal(rig, rig.scope, 'd', rig.rootIno));
    expect(await diskNames(rig.mine)).toEqual([]);
    expect((await rig.posix.getattr(rig.scope, rig.rootIno)).nlink).toBe(before.nlink - 1);
    expect(rig.opened.store.driveTrash.inRoot(rig.mine.id, null, 10).entries).toHaveLength(1);
  });

  it('refuses a folder with something in it, a file, a missing name and a view-only person', async () => {
    const dir = await rig.posix.mkdir(rig.scope, mkdir('d', rig.rootIno));
    await rig.posix.create(rig.scope, create('inside', dir.ino), new Uint8Array());
    await rig.posix.create(rig.scope, create('f', rig.rootIno), new Uint8Array());
    expect(
      await refusal(rig.posix.rmdir(rig.scope, await removal(rig, rig.scope, 'd', rig.rootIno))),
    ).toBe('ENOTEMPTY');
    expect(
      await refusal(rig.posix.rmdir(rig.scope, await removal(rig, rig.scope, 'f', rig.rootIno))),
    ).toBe('ENOTDIR');
    expect(
      await refusal(rig.posix.rmdir(rig.scope, await removal(rig, rig.scope, 'zz', rig.rootIno))),
    ).toBe('ENOENT');
    const scope = await rig.granted('view');
    expect(
      await refusal(rig.posix.rmdir(scope, await removal(rig, scope, 'inner', scope.rootInode))),
    ).toBe('EACCES');
    expect(await diskNames(rig.mine, 'd')).toEqual(['inside']);
  });
});

describe('many files removed at once', () => {
  it('moves them to the trash together with one disk sync and one write to the index', async () => {
    const names = Array.from({ length: 10 }, (_, index) => `r${String(index)}.txt`);
    for (const name of names) {
      await rig.posix.create(rig.scope, create(name, rig.rootIno), new TextEncoder().encode(name));
    }
    const removals = await Promise.all(
      names.map((name) => removal(rig, rig.scope, name, rig.rootIno)),
    );
    const { files } = rig.env.change;
    const synced: (readonly string[])[] = [];
    const sync = files.syncFilesystems.bind(files);
    Object.assign(files, {
      syncFilesystems: async (paths: readonly string[]): Promise<void> => {
        synced.push(paths);
        await sync(paths);
      },
    });
    await Promise.all(removals.map((request) => rig.posix.unlink(rig.scope, request)));
    expect(await diskNames(rig.mine)).toEqual([]);
    expect(rig.opened.store.driveTrash.inRoot(rig.mine.id, null, 100).entries).toHaveLength(
      names.length,
    );
    expect(synced.length).toBeGreaterThan(0);
    expect(synced.length).toBeLessThan(names.length);
  });
});
