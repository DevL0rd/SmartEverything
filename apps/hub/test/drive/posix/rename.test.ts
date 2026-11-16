import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { RENAME_FLAGS, XATTR_FLAGS } from '@smarteverything/domain/drive-mount';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  create,
  diskIno,
  diskMode,
  diskNames,
  diskText,
  linkRequest,
  mkdir,
  mknodRequest,
  moving,
  openPosixRig,
  refusal,
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

function versionsOf(relPath: string): number {
  const item = rig.opened.store.driveItems.byPath(rig.mine.id, relPath, null);
  return rig.opened.store.driveVersions.forItem(item?.id ?? '', null, 10).versions.length;
}

async function named(name: string, text: string): Promise<number> {
  await save(rig, rig.mine, name, text);
  return (await rig.posix.lookup(rig.scope, { parent: rig.rootIno, name })).ino;
}

describe('rename to a free name', () => {
  it('renames a file, keeping its inode, and updates the change time', async () => {
    const ino = await named('a', 'text');
    const before = await rig.posix.getattr(rig.scope, ino);
    await rig.posix.rename(rig.scope, moving([rig.rootIno, 'a'], [rig.rootIno, 'b']));
    expect((await rig.posix.lookup(rig.scope, { parent: rig.rootIno, name: 'b' })).ino).toBe(ino);
    expect(await refusal(rig.posix.lookup(rig.scope, { parent: rig.rootIno, name: 'a' }))).toBe(
      'ENOENT',
    );
    expect(await diskText(rig.mine, 'b')).toBe('text');
    expect((await rig.posix.getattr(rig.scope, ino)).ctimeNs).toBeGreaterThan(before.ctimeNs);
  });

  it('moves a folder with everything in it to another folder', async () => {
    const dir = await rig.posix.mkdir(rig.scope, mkdir('d', rig.rootIno));
    const inner = await rig.posix.mkdir(rig.scope, mkdir('inner', dir.ino));
    const deep = await rig.posix.create(rig.scope, create('deep.txt', inner.ino), new Uint8Array());
    const target = await rig.posix.mkdir(rig.scope, mkdir('t', rig.rootIno));
    await rig.posix.rename(rig.scope, moving([rig.rootIno, 'd'], [target.ino, 'moved']));
    expect(
      rig.opened.store.driveItems.byPath(rig.mine.id, 't/moved/inner/deep.txt', null),
    ).toBeDefined();
    expect(rig.opened.store.driveItems.byPath(rig.mine.id, 'd', null)).toBeUndefined();
    expect(await diskNames(rig.mine, 't/moved/inner')).toEqual(['deep.txt']);
    expect((await rig.posix.getattr(rig.scope, deep.ino)).type).toBe(1);
    expect((await rig.posix.getattr(rig.scope, target.ino)).nlink).toBe(3);
    expect((await rig.posix.getattr(rig.scope, rig.rootIno)).nlink).toBe(3);
  });

  it('moves a link and a special file in the index only where there is no disk object', async () => {
    await rig.posix.symlink(rig.scope, symlinkRequest('l', rig.rootIno, 'x'));
    await rig.posix.mknod(rig.scope, mknodRequest('p', rig.rootIno, 4));
    await rig.posix.rename(rig.scope, moving([rig.rootIno, 'l'], [rig.rootIno, 'l2']));
    await rig.posix.rename(rig.scope, moving([rig.rootIno, 'p'], [rig.rootIno, 'p2']));
    expect(await diskNames(rig.mine)).toEqual(['l2']);
    expect(rig.opened.store.driveItems.byPath(rig.mine.id, 'p2', null)?.kind).toBe('special');
  });

  it('does nothing when the new name is another name of the same inode or the same name', async () => {
    const ino = await named('a', 'x');
    await rig.posix.link(rig.scope, linkRequest(ino, rig.rootIno, 'b'));
    await rig.posix.rename(rig.scope, moving([rig.rootIno, 'a'], [rig.rootIno, 'b']));
    await rig.posix.rename(rig.scope, moving([rig.rootIno, 'a'], [rig.rootIno, 'a']));
    expect(await diskNames(rig.mine)).toEqual(['a', 'b']);
  });

  it('refuses NOREPLACE over an existing name and allows it onto a free one', async () => {
    await named('a', '1');
    await named('b', '2');
    const flags = RENAME_FLAGS.noReplace;
    expect(
      await refusal(
        rig.posix.rename(rig.scope, moving([rig.rootIno, 'a'], [rig.rootIno, 'b'], flags)),
      ),
    ).toBe('EEXIST');
    await rig.posix.rename(rig.scope, moving([rig.rootIno, 'a'], [rig.rootIno, 'c'], flags));
    expect(await diskNames(rig.mine)).toEqual(['b', 'c']);
  });
});

describe.each([
  { history: true, kept: 1 },
  { history: false, kept: 0 },
])('saving over a file by rename, history $history', ({ history, kept }) => {
  beforeEach(() => {
    rig.opened.store.driveRoots.update(rig.mine.id, { versions: history });
  });

  it('replaces the file when a temp file is renamed over it and keeps the old bytes only with history', async () => {
    const original = await named('doc.txt', 'first');
    const temp = await named('doc.txt.tmp', 'second');
    const originalItem = rig.opened.store.driveItems.byPath(rig.mine.id, 'doc.txt', null);
    await rig.posix.rename(
      rig.scope,
      moving([rig.rootIno, 'doc.txt.tmp'], [rig.rootIno, 'doc.txt']),
    );
    const now = await rig.posix.lookup(rig.scope, { parent: rig.rootIno, name: 'doc.txt' });
    expect(now.ino).toBe(original);
    expect(now.attr.size).toBe(6);
    expect(await diskText(rig.mine, 'doc.txt')).toBe('second');
    expect((await readdir(rig.mine.path)).filter((name) => !name.startsWith('.'))).toEqual([
      'doc.txt',
    ]);
    expect(rig.opened.store.driveItems.byPath(rig.mine.id, 'doc.txt.tmp', null)).toBeUndefined();
    expect(rig.opened.store.driveItems.byPath(rig.mine.id, 'doc.txt', null)?.id).toBe(
      originalItem?.id,
    );
    expect(rig.opened.store.driveInodes.find(temp)).toBeUndefined();
    expect(versionsOf('doc.txt')).toBe(kept);
    expect(await refusal(rig.posix.getattr(rig.scope, temp))).toBe('ESTALE');
  });

  it('replaces the file when it is saved in place', async () => {
    const ino = await named('doc.txt', 'first');
    await save(rig, rig.mine, 'doc.txt', 'second');
    expect(await diskText(rig.mine, 'doc.txt')).toBe('second');
    expect((await rig.posix.getattr(rig.scope, ino)).size).toBe(6);
    expect(versionsOf('doc.txt')).toBeGreaterThanOrEqual(kept);
  });
});

describe('rename over an existing name', () => {
  it('gives the target the mode, owner, extended attributes and access time of the source', async () => {
    await named('target', 'old');
    const source = await named('source', 'new');
    await rig.posix.setattr(rig.scope, {
      ino: source,
      valid: 2 | 4 | 1,
      mode: 0o600,
      uid: 7,
      gid: 8,
      opKey: new Uint8Array(16),
    });
    await rig.posix.setxattr(
      rig.scope,
      { ino: source, name: 'user.k', flags: XATTR_FLAGS.create, opKey: new Uint8Array(16) },
      new Uint8Array([1]),
    );
    const targetEntry = await rig.posix.lookup(rig.scope, { parent: rig.rootIno, name: 'target' });
    await rig.posix.setxattr(
      rig.scope,
      { ino: targetEntry.ino, name: 'user.old', flags: 0, opKey: new Uint8Array(16) },
      new Uint8Array([2]),
    );
    await rig.posix.rename(rig.scope, moving([rig.rootIno, 'source'], [rig.rootIno, 'target']));
    const after = await rig.posix.lookup(rig.scope, { parent: rig.rootIno, name: 'target' });
    expect(after.attr).toMatchObject({ mode: 0o600, uid: 7, gid: 8, size: 3 });
    expect(await rig.posix.listxattr(rig.scope, after.ino)).toEqual({ names: ['user.k'] });
    expect(await diskMode(rig.mine, 'target')).toBe(0o600);
  });

  it('keeps the other name of a target that has two names with its old content', async () => {
    const target = await named('target', 'old');
    await rig.posix.link(rig.scope, linkRequest(target, rig.rootIno, 'other'));
    await named('source', 'new');
    await rig.posix.rename(rig.scope, moving([rig.rootIno, 'source'], [rig.rootIno, 'target']));
    expect(await diskText(rig.mine, 'target')).toBe('new');
    expect(await diskText(rig.mine, 'other')).toBe('old');
    expect((await rig.posix.getattr(rig.scope, target)).nlink).toBe(1);
  });

  it('moves one name of a two-name source over a target and keeps the other name', async () => {
    const source = await named('source', 'new');
    await rig.posix.link(rig.scope, linkRequest(source, rig.rootIno, 'twin'));
    await named('target', 'old');
    await rig.posix.rename(rig.scope, moving([rig.rootIno, 'source'], [rig.rootIno, 'target']));
    expect((await rig.posix.lookup(rig.scope, { parent: rig.rootIno, name: 'target' })).ino).toBe(
      source,
    );
    expect(await diskIno(rig.mine, 'target')).toBe(await diskIno(rig.mine, 'twin'));
    expect((await rig.posix.getattr(rig.scope, source)).nlink).toBe(2);
  });

  it('replaces a link or a special file and lets a link replace a file', async () => {
    await named('file', 'x');
    await rig.posix.symlink(rig.scope, symlinkRequest('link', rig.rootIno, 't'));
    await rig.posix.mknod(rig.scope, mknodRequest('fifo', rig.rootIno, 4));
    await rig.posix.rename(rig.scope, moving([rig.rootIno, 'file'], [rig.rootIno, 'link']));
    expect(await diskText(rig.mine, 'link')).toBe('x');
    await rig.posix.rename(rig.scope, moving([rig.rootIno, 'link'], [rig.rootIno, 'fifo']));
    expect(await diskText(rig.mine, 'fifo')).toBe('x');
    expect(rig.opened.store.driveItems.byPath(rig.mine.id, 'fifo', null)?.kind).toBe('other');
    await rig.posix.symlink(rig.scope, symlinkRequest('l2', rig.rootIno, 'zz'));
    await rig.posix.rename(rig.scope, moving([rig.rootIno, 'l2'], [rig.rootIno, 'fifo']));
    expect(rig.opened.store.driveItems.byPath(rig.mine.id, 'fifo', null)?.kind).toBe('link');
  });

  it('replaces an empty folder with a folder and refuses a folder that has content', async () => {
    const from = await rig.posix.mkdir(rig.scope, mkdir('from', rig.rootIno));
    await rig.posix.create(rig.scope, create('x', from.ino), new Uint8Array());
    await rig.posix.mkdir(rig.scope, mkdir('empty', rig.rootIno));
    const full = await rig.posix.mkdir(rig.scope, mkdir('full', rig.rootIno));
    await rig.posix.create(rig.scope, create('y', full.ino), new Uint8Array());
    expect(
      await refusal(
        rig.posix.rename(rig.scope, moving([rig.rootIno, 'from'], [rig.rootIno, 'full'])),
      ),
    ).toBe('ENOTEMPTY');
    await rig.posix.rename(rig.scope, moving([rig.rootIno, 'from'], [rig.rootIno, 'empty']));
    expect(await diskNames(rig.mine, 'empty')).toEqual(['x']);
  });

  it('refuses a folder over a file and a file over a folder', async () => {
    await rig.posix.mkdir(rig.scope, mkdir('d', rig.rootIno));
    await named('f', 'x');
    expect(
      await refusal(rig.posix.rename(rig.scope, moving([rig.rootIno, 'd'], [rig.rootIno, 'f']))),
    ).toBe('ENOTDIR');
    expect(
      await refusal(rig.posix.rename(rig.scope, moving([rig.rootIno, 'f'], [rig.rootIno, 'd']))),
    ).toBe('EISDIR');
  });
});

describe('rename errors', () => {
  it('refuses a missing source, a folder into itself, a reserved name and bad names', async () => {
    const dir = await rig.posix.mkdir(rig.scope, mkdir('d', rig.rootIno));
    const sub = await rig.posix.mkdir(rig.scope, mkdir('sub', dir.ino));
    await named('f', 'x');
    expect(
      await refusal(rig.posix.rename(rig.scope, moving([rig.rootIno, 'zz'], [rig.rootIno, 'y']))),
    ).toBe('ENOENT');
    expect(
      await refusal(rig.posix.rename(rig.scope, moving([rig.rootIno, 'd'], [dir.ino, 'x']))),
    ).toBe('EINVAL');
    expect(
      await refusal(rig.posix.rename(rig.scope, moving([rig.rootIno, 'd'], [sub.ino, 'x']))),
    ).toBe('EINVAL');
    expect(
      await refusal(
        rig.posix.rename(rig.scope, moving([rig.rootIno, 'f'], [rig.rootIno, '.se-orphans'])),
      ),
    ).toBe('EPERM');
    expect(
      await refusal(
        rig.posix.rename(rig.scope, moving([rig.rootIno, 'f'], [rig.rootIno, 'é'.repeat(128)])),
      ),
    ).toBe('ENAMETOOLONG');
    expect(
      await refusal(rig.posix.rename(rig.scope, moving([rig.rootIno, 'f'], [sub.ino + 1000, 'x']))),
    ).toBe('ESTALE');
    expect(
      await refusal(
        rig.posix.rename(
          rig.scope,
          moving([rig.rootIno, 'f'], [rig.rootIno, 'x'], RENAME_FLAGS.whiteout),
        ),
      ),
    ).toBe('EINVAL');
    expect(
      await refusal(
        rig.posix.rename(
          rig.scope,
          moving(
            [rig.rootIno, 'f'],
            [rig.rootIno, 'x'],
            RENAME_FLAGS.exchange | RENAME_FLAGS.noReplace,
          ),
        ),
      ),
    ).toBe('EINVAL');
  });

  it('refuses a destination parent that is a file and a view-only person', async () => {
    const file = await rig.posix.create(rig.scope, create('f', rig.rootIno), new Uint8Array());
    await named('g', 'x');
    expect(
      await refusal(rig.posix.rename(rig.scope, moving([rig.rootIno, 'g'], [file.ino, 'x']))),
    ).toBe('ENOTDIR');
    const scope = await rig.granted('view');
    expect(
      await refusal(
        rig.posix.rename(scope, moving([scope.rootInode, 'note.txt'], [scope.rootInode, 'n2'])),
      ),
    ).toBe('EACCES');
  });
});

describe('rename across a mount', () => {
  it('answers EXDEV for a destination folder of another drive or outside the mount', async () => {
    await named('f', 'x');
    const foreign = await rig.posix.mkdir(rig.memberScope, mkdir('m', rig.memberScope.rootInode));
    expect(
      await refusal(rig.posix.rename(rig.scope, moving([rig.rootIno, 'f'], [foreign.ino, 'f']))),
    ).toBe('EXDEV');
    const scope = await rig.granted('edit');
    expect(
      await refusal(
        rig.posix.rename(scope, moving([scope.rootInode, 'note.txt'], [rig.rootIno, 'n'])),
      ),
    ).toBe('EXDEV');
    expect(await diskNames(rig.mine, 'docs')).toEqual(['inner', 'note.txt']);
  });
});

describe('exchange', () => {
  it('swaps two files so each name shows the other inode and content', async () => {
    const a = await named('a', 'aaa');
    const b = await named('b', 'bb');
    await rig.posix.rename(
      rig.scope,
      moving([rig.rootIno, 'a'], [rig.rootIno, 'b'], RENAME_FLAGS.exchange),
    );
    expect((await rig.posix.lookup(rig.scope, { parent: rig.rootIno, name: 'a' })).ino).toBe(b);
    expect((await rig.posix.lookup(rig.scope, { parent: rig.rootIno, name: 'b' })).ino).toBe(a);
    expect(await diskText(rig.mine, 'a')).toBe('bb');
    expect(await diskText(rig.mine, 'b')).toBe('aaa');
    expect((await rig.posix.getattr(rig.scope, a)).size).toBe(3);
    expect(rig.opened.store.driveIntents.all()).toEqual([]);
  });

  it('swaps a folder and a file across folders and rewrites the paths inside the folder', async () => {
    const dir = await rig.posix.mkdir(rig.scope, mkdir('d', rig.rootIno));
    await rig.posix.create(rig.scope, create('in.txt', dir.ino), new Uint8Array());
    const other = await rig.posix.mkdir(rig.scope, mkdir('o', rig.rootIno));
    await rig.posix.create(rig.scope, create('f', other.ino), new Uint8Array());
    await rig.posix.rename(
      rig.scope,
      moving([rig.rootIno, 'd'], [other.ino, 'f'], RENAME_FLAGS.exchange),
    );
    expect(rig.opened.store.driveItems.byPath(rig.mine.id, 'o/f/in.txt', null)).toBeDefined();
    expect(rig.opened.store.driveItems.byPath(rig.mine.id, 'd', null)?.kind).toBe('document');
    expect(await diskNames(rig.mine, 'o/f')).toEqual(['in.txt']);
    expect((await readdir(join(rig.mine.path, 'o'))).sort()).toEqual(['f']);
  });

  it('refuses a missing target and folders inside each other', async () => {
    const dir = await rig.posix.mkdir(rig.scope, mkdir('d', rig.rootIno));
    const sub = await rig.posix.mkdir(rig.scope, mkdir('sub', dir.ino));
    expect(
      await refusal(
        rig.posix.rename(
          rig.scope,
          moving([rig.rootIno, 'd'], [rig.rootIno, 'none'], RENAME_FLAGS.exchange),
        ),
      ),
    ).toBe('ENOENT');
    expect(
      await refusal(
        rig.posix.rename(
          rig.scope,
          moving([dir.ino, 'sub'], [rig.rootIno, 'd'], RENAME_FLAGS.exchange),
        ),
      ),
    ).toBe('EINVAL');
    expect(
      await refusal(
        rig.posix.rename(
          rig.scope,
          moving([rig.rootIno, 'd'], [sub.ino, 'x'], RENAME_FLAGS.exchange),
        ),
      ),
    ).toBe('EINVAL');
  });
});
