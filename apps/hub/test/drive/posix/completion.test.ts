import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commitRestore, commitTrash } from '../../../src/drive/trash-purge';
import {
  create,
  linkRequest,
  mkdir,
  mknodRequest,
  moving,
  openPosixRig,
  save,
  symlinkRequest,
  type PosixRig,
} from './posix-rig';

let rig: PosixRig;

beforeEach(async () => {
  rig = await openPosixRig(true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rig.close();
});

const KEY = new Uint8Array(16);

const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);

function itemAt(
  relPath: string,
): NonNullable<ReturnType<typeof rig.opened.store.driveItems.byPath>> {
  const item = rig.opened.store.driveItems.byPath(rig.mine.id, relPath, null);
  if (item === undefined) throw new Error(`${relPath} is not indexed`);
  return item;
}

function owner(): { actorProfileId: string; via: 'mount'; deviceId: string } {
  return { actorProfileId: rig.ownerId, via: 'mount', deviceId: rig.node };
}

describe('extended attribute changes reach the feed', () => {
  it('writes a feed row for every name when an attribute is set and when it is removed', async () => {
    const file = await rig.posix.create(rig.scope, create('a', rig.rootIno));
    await rig.posix.link(rig.scope, linkRequest(file.ino, rig.rootIno, 'b'));
    const { driveFeed } = rig.opened.store;
    const before = driveFeed.latestSeq();
    await rig.posix.setxattr(
      rig.scope,
      { ino: file.ino, name: 'user.tag', flags: 0, opKey: KEY },
      bytes(1),
    );
    const afterSet = driveFeed.since(before, 50).rows;
    expect(afterSet.map((row) => row.op)).toEqual(['update', 'update']);
    expect(new Set(afterSet.map((row) => row.itemId))).toEqual(
      new Set([itemAt('a').id, itemAt('b').id]),
    );
    const mark = driveFeed.latestSeq();
    await rig.posix.removexattr(rig.scope, { ino: file.ino, name: 'user.tag', opKey: KEY });
    expect(driveFeed.since(mark, 50).rows.map((row) => row.op)).toEqual(['update', 'update']);
  });

  it('writes nothing when the attribute is refused', async () => {
    const file = await rig.posix.create(rig.scope, create('a', rig.rootIno));
    const mark = rig.opened.store.driveFeed.latestSeq();
    await expect(
      rig.posix.removexattr(rig.scope, { ino: file.ino, name: 'user.none', opKey: KEY }),
    ).rejects.toMatchObject({ code: 'ENODATA' });
    expect(rig.opened.store.driveFeed.latestSeq()).toBe(mark);
  });
});

describe('hard links and their blocks', () => {
  it('gives the new name the blocks of the source', async () => {
    const file = await rig.posix.create(rig.scope, create('a', rig.rootIno));
    const source = await save(rig, rig.mine, 'a', 'content');
    const { driveBlocks } = rig.opened.store;
    driveBlocks.put({
      itemId: source.id,
      rev: source.rev,
      blockSize: 4096,
      hashes: new Uint8Array(32).fill(7),
    });
    await rig.posix.link(rig.scope, linkRequest(file.ino, rig.rootIno, 'b'));
    const second = itemAt('b');
    expect(driveBlocks.find(second.id, second.rev)).toMatchObject({
      blockSize: 4096,
      hashes: new Uint8Array(32).fill(7),
    });
  });

  it('refreshes bytes, revision and blocks on every name when the content is saved', async () => {
    const file = await rig.posix.create(rig.scope, create('a', rig.rootIno));
    await rig.posix.link(rig.scope, linkRequest(file.ino, rig.rootIno, 'b'));
    await rig.posix.link(rig.scope, linkRequest(file.ino, rig.rootIno, 'c'));
    const first = await save(rig, rig.mine, 'a', 'twelve bytes!');
    for (const name of ['a', 'b', 'c']) {
      expect(itemAt(name)).toMatchObject({ bytes: 13 });
    }
    const revs = new Set(['a', 'b', 'c'].map((name) => itemAt(name).rev));
    expect(revs.size).toBe(1);
    expect(itemAt('a').rev).toBe(first.rev);
  });
});

describe('special files and links in the trash', () => {
  it('trashes a special file and restores it with the same inode, kind and mode', async () => {
    const fifo = await rig.posix.mknod(rig.scope, mknodRequest('p', rig.rootIno, 4));
    const item = itemAt('p');
    await rig.posix.setxattr(
      rig.scope,
      { ino: fifo.ino, name: 'security.tag', flags: 0, opKey: KEY },
      bytes(5),
    );
    const root = rig.opened.store.driveRoots.byId(rig.mine.id);
    await commitTrash(rig.env.change, root, item.id, owner());
    expect(rig.opened.store.driveItems.byPath(rig.mine.id, 'p', null)).toBeUndefined();
    expect(rig.opened.store.driveTrash.find(item.id)).toBeDefined();
    const restored = await commitRestore(rig.env.change, root, item.id, owner());
    expect(restored.item).toMatchObject({ kind: 'special', relPath: 'p' });
    const looked = await rig.posix.lookup(rig.scope, { parent: rig.rootIno, name: 'p' });
    expect(looked.ino).toBe(fifo.ino);
    expect(looked.attr.type).toBe(fifo.attr.type);
    expect(await rig.posix.getxattr(rig.scope, { ino: fifo.ino, name: 'security.tag' })).toEqual(
      bytes(5),
    );
    expect(rig.opened.store.driveTrash.find(item.id)).toBeUndefined();
  });

  it('restores a special file under a new name when the old name is taken', async () => {
    await rig.posix.mknod(rig.scope, mknodRequest('p', rig.rootIno, 4));
    const item = itemAt('p');
    const root = rig.opened.store.driveRoots.byId(rig.mine.id);
    await commitTrash(rig.env.change, root, item.id, owner());
    await rig.posix.mknod(rig.scope, mknodRequest('p', rig.rootIno, 5));
    const restored = await commitRestore(rig.env.change, root, item.id, owner());
    expect(restored.item.relPath).toBe('p (restored)');
    expect(restored.item.kind).toBe('special');
  });

  it('trashes and restores a symlink as a symlink with its target', async () => {
    const link = await rig.posix.symlink(rig.scope, symlinkRequest('l', rig.rootIno, 'where/to'));
    const item = itemAt('l');
    await rig.posix.unlink(rig.scope, { parent: rig.rootIno, name: 'l', opKey: KEY });
    const root = rig.opened.store.driveRoots.byId(rig.mine.id);
    const restored = await commitRestore(rig.env.change, root, item.id, owner());
    expect(restored.item).toMatchObject({ kind: 'link', linkTarget: 'where/to' });
    expect((await rig.posix.lookup(rig.scope, { parent: rig.rootIno, name: 'l' })).ino).toBe(
      link.ino,
    );
    expect(await rig.posix.readlink(rig.scope, link.ino)).toBe('where/to');
  });
});

describe('restoring a trashed folder', () => {
  it('gives the folder its own inode, mode and attributes back', async () => {
    const dir = await rig.posix.mkdir(rig.scope, mkdir('d', rig.rootIno, 0o700));
    await rig.posix.create(rig.scope, create('inner', dir.ino));
    await rig.posix.setxattr(
      rig.scope,
      { ino: dir.ino, name: 'user.tag', flags: 0, opKey: KEY },
      bytes(2),
    );
    const item = itemAt('d');
    await rig.posix.unlink(rig.scope, { parent: dir.ino, name: 'inner', opKey: KEY });
    await rig.posix.rmdir(rig.scope, { parent: rig.rootIno, name: 'd', opKey: KEY });
    const root = rig.opened.store.driveRoots.byId(rig.mine.id);
    const restored = await commitRestore(rig.env.change, root, item.id, owner());
    expect(restored.item.kind).toBe('folder');
    const looked = await rig.posix.lookup(rig.scope, { parent: rig.rootIno, name: 'd' });
    expect(looked.ino).toBe(dir.ino);
    expect(looked.attr.mode & 0o7777).toBe(0o700);
    expect(await rig.posix.getxattr(rig.scope, { ino: dir.ino, name: 'user.tag' })).toEqual(
      bytes(2),
    );
  });
});

describe('renaming over a link or special file', () => {
  it('replaces a special file in one step', async () => {
    const file = await rig.posix.create(rig.scope, create('a', rig.rootIno));
    await save(rig, rig.mine, 'a', 'kept');
    await rig.posix.mknod(rig.scope, mknodRequest('p', rig.rootIno, 4));
    const target = itemAt('p');
    await rig.posix.rename(rig.scope, moving([rig.rootIno, 'a'], [rig.rootIno, 'p']));
    expect((await rig.posix.lookup(rig.scope, { parent: rig.rootIno, name: 'p' })).ino).toBe(
      file.ino,
    );
    expect(itemAt('p').kind).not.toBe('special');
    expect(rig.opened.store.driveItems.find(target.id, null)).toBeUndefined();
    expect(await readFile(join(rig.mine.path, 'p'), 'utf8')).toBe('kept');
  });

  it('replaces a symlink in one step', async () => {
    const file = await rig.posix.create(rig.scope, create('a', rig.rootIno));
    await save(rig, rig.mine, 'a', 'kept');
    await rig.posix.symlink(rig.scope, symlinkRequest('l', rig.rootIno, 'elsewhere'));
    const target = itemAt('l');
    await rig.posix.rename(rig.scope, moving([rig.rootIno, 'a'], [rig.rootIno, 'l']));
    expect((await rig.posix.lookup(rig.scope, { parent: rig.rootIno, name: 'l' })).ino).toBe(
      file.ino,
    );
    expect(rig.opened.store.driveTrash.find(target.id)).toBeDefined();
    expect(await readFile(join(rig.mine.path, 'l'), 'utf8')).toBe('kept');
  });

  it('leaves the target untouched when the move fails after the target was set aside', async () => {
    await rig.posix.create(rig.scope, create('a', rig.rootIno));
    await save(rig, rig.mine, 'a', 'source');
    await rig.posix.symlink(rig.scope, symlinkRequest('l', rig.rootIno, 'elsewhere'));
    const target = itemAt('l');
    vi.spyOn(rig.env.change.files, 'link').mockRejectedValueOnce(new Error('disk refused'));
    await expect(
      rig.posix.rename(rig.scope, moving([rig.rootIno, 'a'], [rig.rootIno, 'l'])),
    ).rejects.toBeDefined();
    expect(itemAt('l').id).toBe(target.id);
    expect(itemAt('l').kind).toBe('link');
    expect(rig.opened.store.driveTrash.find(target.id)).toBeUndefined();
    expect(await readFile(join(rig.mine.path, 'a'), 'utf8')).toBe('source');
    expect(
      await rig.posix.readlink(
        rig.scope,
        (await rig.posix.lookup(rig.scope, { parent: rig.rootIno, name: 'l' })).ino,
      ),
    ).toBe('elsewhere');
  });
});
