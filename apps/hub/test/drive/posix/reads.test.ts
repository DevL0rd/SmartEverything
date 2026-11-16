import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { READDIR_PAGE } from '../../../src/drive/posix/reads';
import { PosixScope } from '../../../src/drive/posix/env';
import { create, mkdir, openPosixRig, refusal, type PosixRig } from './posix-rig';

let rig: PosixRig;

beforeEach(async () => {
  rig = await openPosixRig(true);
});

afterEach(async () => {
  await rig.close();
});

describe('attach', () => {
  it('returns the root inode with its attributes and the change sequence', async () => {
    const attached = await rig.posix.attach(
      { profileId: rig.ownerId, nodeId: rig.node },
      rig.scope.placementId,
    );
    expect(attached.ino).toBe(rig.rootIno);
    expect(attached.root).toBe(rig.mine.id);
    expect(attached.attr).toMatchObject({ ino: rig.rootIno, type: 2, mode: 0o755, nlink: 2 });
    expect(attached.seq).toBeGreaterThanOrEqual(0);
  });

  it('refuses a placement of another computer, an unknown one and a drive the person cannot see', async () => {
    const caller = { profileId: rig.ownerId, nodeId: rig.memberNode };
    expect(await refusal(rig.posix.attach(caller, rig.scope.placementId))).toBe('EACCES');
    expect(
      await refusal(
        rig.posix.attach(
          { profileId: rig.ownerId, nodeId: rig.node },
          '0a000000-0000-4000-8000-0000000000ff',
        ),
      ),
    ).toBe('EACCES');
    const hidden = await rig
      .attach(rig.memberNode, rig.ownerId, rig.theirs)
      .catch((cause: unknown) => cause);
    expect(hidden).toBeInstanceOf(Error);
  });

  it('mounts a folder so its inode is the mount root', async () => {
    const docs = await rig.posix.mkdir(rig.scope, mkdir('docs', rig.rootIno));
    const item = rig.opened.store.driveItems.byPath(rig.mine.id, 'docs', null);
    const scope = await rig.attach(rig.node, rig.ownerId, rig.mine, item?.id);
    expect(scope.rootInode).toBe(docs.ino);
    const inside = await rig.posix.create(scope, create('a.txt', docs.ino), new Uint8Array());
    expect(rig.opened.store.driveItems.byPath(rig.mine.id, 'docs/a.txt', null)).toBeDefined();
    expect((await rig.posix.lookup(scope, { parent: docs.ino, name: 'a.txt' })).ino).toBe(
      inside.ino,
    );
  });
});

describe('lookup and getattr', () => {
  it('finds a name, answers ENOENT for a missing one and ENOTDIR under a file', async () => {
    const file = await rig.posix.create(rig.scope, create('a.txt', rig.rootIno, { mode: 0o640 }), new Uint8Array());
    const found = await rig.posix.lookup(rig.scope, { parent: rig.rootIno, name: 'a.txt' });
    expect(found.ino).toBe(file.ino);
    expect(found.attr).toMatchObject({ mode: 0o640, nlink: 1, type: 1, uid: null, gid: null });
    expect(await refusal(rig.posix.lookup(rig.scope, { parent: rig.rootIno, name: 'b.txt' }))).toBe(
      'ENOENT',
    );
    expect(await refusal(rig.posix.lookup(rig.scope, { parent: file.ino, name: 'x' }))).toBe(
      'ENOTDIR',
    );
  });

  it('refuses bad names: too long in bytes, invalid UTF-8, dot entries', async () => {
    const lookup = (name: string): Promise<unknown> =>
      rig.posix.lookup(rig.scope, { parent: rig.rootIno, name });
    expect(await refusal(lookup('é'.repeat(128)))).toBe('ENAMETOOLONG');
    expect(await refusal(lookup('a\ud800'))).toBe('EILSEQ');
    expect(await refusal(lookup('..'))).toBe('EINVAL');
    expect(await refusal(lookup('a/b'))).toBe('EINVAL');
  });

  it('answers ESTALE for an inode that does not exist or belongs to another drive', async () => {
    const other = await rig.posix.create(
      rig.memberScope,
      create('m.txt', rig.memberScope.rootInode), new Uint8Array(),
    );
    expect(await refusal(rig.posix.getattr(rig.scope, 99_999))).toBe('ESTALE');
    expect(await refusal(rig.posix.getattr(rig.scope, other.ino))).toBe('ESTALE');
  });

  it('never shows the reserved drive folders', async () => {
    expect(
      await refusal(rig.posix.lookup(rig.scope, { parent: rig.rootIno, name: '.smarteverything' })),
    ).toBe('ENOENT');
    expect(
      await refusal(rig.posix.lookup(rig.scope, { parent: rig.rootIno, name: '.se-orphans' })),
    ).toBe('ENOENT');
  });

  it('counts the folders inside a folder in its link count', async () => {
    const parent = await rig.posix.mkdir(rig.scope, mkdir('p', rig.rootIno));
    await rig.posix.mkdir(rig.scope, mkdir('c1', parent.ino));
    await rig.posix.mkdir(rig.scope, mkdir('c2', parent.ino));
    await rig.posix.create(rig.scope, create('f', parent.ino), new Uint8Array());
    expect((await rig.posix.getattr(rig.scope, parent.ino)).nlink).toBe(4);
    expect((await rig.posix.getattr(rig.scope, rig.rootIno)).nlink).toBe(3);
  });

  it('gives the item revision and etag', async () => {
    const file = await rig.posix.create(rig.scope, create('a.txt', rig.rootIno), new Uint8Array());
    const item = rig.opened.store.driveItems.byPath(rig.mine.id, 'a.txt', null);
    expect(file.attr.rev).toBe(item?.rev);
    expect(file.attr.etag).toBe(item?.etag);
  });
});

describe('readdir', () => {
  function seed(count: number): void {
    const { store } = rig.opened;
    for (let index = 0; index < count; index += 1) {
      const name = `n${String(index).padStart(5, '0')}`;
      store.driveItems.write({
        item: {
          id: `0b000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
          rootId: rig.mine.id,
          parentId: null,
          relPath: name,
          name,
          kind: 'folder',
          childCount: 0,
          bytes: 0,
          modifiedAt: '2026-11-07T00:00:00.000Z',
          addedAt: '2026-11-07T00:00:00.000Z',
          starred: false,
          shared: false,
          outside: false,
          addedByProfileId: null,
          remoteId: null,
          remoteRev: null,
        },
        identity: { dev: '1', ino: String(index + 1) },
      });
    }
  }

  it('lists a folder in name order with full attributes', async () => {
    const dir = await rig.posix.mkdir(rig.scope, mkdir('d', rig.rootIno));
    await rig.posix.create(rig.scope, create('b', dir.ino), new Uint8Array());
    await rig.posix.create(rig.scope, create('a', dir.ino), new Uint8Array());
    await rig.posix.symlink(rig.scope, {
      parent: dir.ino,
      name: 'c',
      target: 'a',
      uid: null,
      gid: null,
      opKey: new Uint8Array(16),
    });
    const page = await rig.posix.readdir(rig.scope, { ino: dir.ino, cursor: 0 });
    expect(page.next).toBeNull();
    expect(page.entries.map(([name, ino, attr]) => [name, attr.type, attr.ino === ino])).toEqual([
      ['a', 1, true],
      ['b', 1, true],
      ['c', 3, true],
    ]);
    expect(page.entries[2]?.[2].size).toBe(1);
  });

  it('answers ENOTDIR for a file and pages through more entries than one frame holds', async () => {
    const total = READDIR_PAGE * 2 + 5;
    seed(total);
    const names: string[] = [];
    let cursor = 0;
    for (;;) {
      const page = await rig.posix.readdir(rig.scope, { ino: rig.rootIno, cursor });
      names.push(...page.entries.map(([name]) => name));
      if (page.next === null) break;
      cursor = page.next;
    }
    expect(names).toHaveLength(total);
    expect(new Set(names).size).toBe(total);
    expect(names).toEqual([...names].sort());
    const file = await rig.posix.create(rig.scope, create('zz', rig.rootIno), new Uint8Array());
    expect(await refusal(rig.posix.readdir(rig.scope, { ino: file.ino, cursor: 0 }))).toBe(
      'ENOTDIR',
    );
  });

  it('resumes from a cursor in a fresh session that has no memory of the earlier pages', async () => {
    seed(READDIR_PAGE + 10);
    const first = await rig.posix.readdir(rig.scope, { ino: rig.rootIno, cursor: 0 });
    expect(first.next).toBe(READDIR_PAGE);
    const fresh = new PosixScope({ profileId: rig.ownerId, nodeId: rig.node }, 'p', {
      drive: rig.mine,
      baseId: null,
      rootInode: rig.rootIno,
    });
    const rest = await rig.posix.readdir(fresh, { ino: rig.rootIno, cursor: first.next ?? 0 });
    expect(rest.entries).toHaveLength(10);
    expect(rest.entries[0]?.[0]).toBe(`n${String(READDIR_PAGE).padStart(5, '0')}`);
    expect(rest.next).toBeNull();
  });

  it('refuses a cursor past the end', async () => {
    await rig.posix.create(rig.scope, create('only', rig.rootIno), new Uint8Array());
    expect(await refusal(rig.posix.readdir(rig.scope, { ino: rig.rootIno, cursor: 5 }))).toBe(
      'EINVAL',
    );
  });
});

describe('readlink', () => {
  it('returns the target of a link and refuses anything else', async () => {
    const link = await rig.posix.symlink(rig.scope, {
      parent: rig.rootIno,
      name: 'l',
      target: '../outside/file',
      uid: null,
      gid: null,
      opKey: new Uint8Array(16),
    });
    expect(await rig.posix.readlink(rig.scope, link.ino)).toBe('../outside/file');
    const file = await rig.posix.create(rig.scope, create('f', rig.rootIno), new Uint8Array());
    expect(await refusal(rig.posix.readlink(rig.scope, file.ino))).toBe('EINVAL');
  });
});

describe('access', () => {
  it('shows a granted folder as the whole mount and hides everything else', async () => {
    const scope = await rig.granted('view');
    const entries = await rig.posix.readdir(scope, { ino: scope.rootInode, cursor: 0 });
    expect(entries.entries.map(([name]) => name)).toEqual(['inner', 'note.txt']);
    const top = rig.opened.store.driveInodes.rootOf(rig.mine.id);
    expect(await refusal(rig.posix.getattr(scope, top.id))).toBe('ESTALE');
    const priv = await rig.posix.lookup(rig.scope, { parent: rig.rootIno, name: 'private.txt' });
    expect(await refusal(rig.posix.getattr(scope, priv.ino))).toBe('ENOENT');
  });

  it('lets a member of the home use the Shared Drive', async () => {
    const entry = await rig.posix.create(
      rig.sharedScope,
      create('shared.txt', rig.sharedScope.rootInode), new Uint8Array(),
    );
    expect((await rig.posix.getattr(rig.sharedScope, entry.ino)).size).toBe(0);
  });
});
