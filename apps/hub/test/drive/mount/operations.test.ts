import type { RequestMetaInput } from '@smarteverything/domain/drive-mount';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { attachTo, openMountRig, opKey, type Attached, type MountRig } from './mount-rig';

let rig: MountRig;
let mine: Attached;

beforeEach(async () => {
  rig = await openMountRig();
  mine = await attachTo(
    rig,
    { nodeId: rig.posix.node, profileId: rig.posix.ownerId },
    rig.posix.mine.id,
  );
});

afterEach(async () => {
  await rig.close();
});

const MADE_NS = 1_763_100_000_000_000_000n;

async function mkdirMeta(
  name: string,
  parent = mine.root,
  key = opKey(),
): Promise<RequestMetaInput<'MKDIR'>> {
  const ino = await mine.client.ino();
  return { parent, name, ino, mode: 0o755, uid: null, gid: null, mtimeNs: MADE_NS, opKey: key };
}

async function createMeta(
  name: string,
  parent = mine.root,
  key = opKey(),
): Promise<RequestMetaInput<'CREATE'>> {
  const ino = await mine.client.ino();
  return {
    parent,
    name,
    ino,
    mode: 0o644,
    uid: null,
    gid: null,
    mtimeNs: MADE_NS,
    fsync: false,
    opKey: key,
  };
}

const EMPTY = new Uint8Array();

describe('namespace over the socket', () => {
  it('makes, finds and lists a folder and a file', async () => {
    const folder = await mine.client.call('MKDIR', await mkdirMeta('docs'));
    const file = await mine.client.call('CREATE', await createMeta('note.txt', folder.ino), EMPTY);
    const found = await mine.client.call('LOOKUP', { parent: folder.ino, name: 'note.txt' });
    expect(found.ino).toBe(file.ino);
    const page = await mine.client.call('READDIR', { ino: folder.ino, cursor: 0 });
    expect(page.entries.map(([name]) => name)).toEqual(['note.txt']);
    expect(page.next).toBeNull();
    await expect(
      mine.client.call('LOOKUP', { parent: folder.ino, name: 'absent' }),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('answers ENAMETOOLONG for a name past 255 bytes instead of rejecting the frame', async () => {
    const long = 'n'.repeat(256);
    await expect(
      mine.client.call('LOOKUP', { parent: mine.root, name: long }),
    ).rejects.toMatchObject({
      code: 'ENAMETOOLONG',
    });
    await expect(mine.client.call('MKDIR', await mkdirMeta(long))).rejects.toMatchObject({
      code: 'ENAMETOOLONG',
    });
    await expect(mine.client.call('CREATE', await createMeta(long), EMPTY)).rejects.toMatchObject({
      code: 'ENAMETOOLONG',
    });
  });

  it('changes modes, links, symbolic links and names', async () => {
    const file = await mine.client.call('CREATE', await createMeta('a.txt'), EMPTY);
    const changed = await mine.client.call('SETATTR', {
      ino: file.ino,
      valid: 1,
      mode: 0o600,
      opKey: opKey(),
    });
    expect(changed.attr.mode).toBe(0o600);
    const linked = await mine.client.call('LINK', {
      ino: file.ino,
      parent: mine.root,
      name: 'b.txt',
      opKey: opKey(),
    });
    expect(linked.attr.nlink).toBe(2);
    const link = await mine.client.call('SYMLINK', {
      ino: await mine.client.ino(),
      parent: mine.root,
      name: 's',
      target: 'a.txt',
      uid: null,
      gid: null,
      opKey: opKey(),
    });
    expect((await mine.client.call('READLINK', { ino: link.ino })).target).toBe('a.txt');
    await mine.client.call('RENAME', {
      parent: mine.root,
      name: 'b.txt',
      newParent: mine.root,
      newName: 'c.txt',
      flags: 0,
      opKey: opKey(),
    });
    expect(await readlink(join(rig.posix.mine.path, 's'))).toBe('a.txt');
    await mine.client.call('UNLINK', {
      parent: mine.root,
      name: 'c.txt',
      ino: file.ino,
      opKey: opKey(),
    });
    await expect(
      mine.client.call('LOOKUP', { parent: mine.root, name: 'c.txt' }),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('answers statfs and extended attributes', async () => {
    const file = await mine.client.call('CREATE', await createMeta('x.txt'), EMPTY);
    const space = await mine.client.call('STATFS', { ino: mine.root });
    expect(space.bsize).toBeGreaterThan(0);
    await mine.client.call(
      'SETXATTR',
      { ino: file.ino, name: 'user.tag', flags: 0, opKey: opKey() },
      new TextEncoder().encode('blue'),
    );
    const listed = await mine.client.call('LISTXATTR', { ino: file.ino });
    expect(listed.names).toEqual(['user.tag']);
    const read = await mine.client.request('GETXATTR', { ino: file.ino, name: 'user.tag' }).sent;
    expect(new TextDecoder().decode(read.payload ?? new Uint8Array())).toBe('blue');
    await mine.client.call('REMOVEXATTR', { ino: file.ino, name: 'user.tag', opKey: opKey() });
    await expect(
      mine.client.call('GETXATTR', { ino: file.ino, name: 'user.tag' }),
    ).rejects.toMatchObject({ code: 'ENODATA' });
  });

  it('refuses a person who may not see the drive', async () => {
    const stranger = await rig.connect(rig.posix.memberNode);
    await stranger.hello();
    const placement = rig.placementOf(
      rig.posix.memberNode,
      rig.posix.memberId,
      rig.posix.theirs.id,
    );
    await stranger.call('ATTACH', { placementId: placement });
    await expect(stranger.call('GETATTR', { ino: mine.root })).rejects.toMatchObject({
      code: 'ESTALE',
    });
  });

  it('refuses a mount of a drive this computer has no placement for', async () => {
    const client = await rig.connect(rig.posix.memberNode);
    await client.hello();
    const placement = rig.placementOf(rig.posix.node, rig.posix.ownerId, rig.posix.mine.id);
    await expect(client.call('ATTACH', { placementId: placement })).rejects.toMatchObject({
      code: 'EACCES',
    });
  });
});

describe('leased inode numbers', () => {
  it('creates with the leased number and refuses one leased to nobody', async () => {
    const meta = await createMeta('leased.txt');
    const made = await mine.client.call('CREATE', meta, new TextEncoder().encode('hi'));
    expect(made.ino).toBe(meta.ino);
    expect(made.attr.size).toBe(2);
    await expect(
      mine.client.call(
        'CREATE',
        { ...(await createMeta('stray.txt')), ino: meta.ino + 1_000_000 },
        EMPTY,
      ),
    ).rejects.toMatchObject({ code: 'EINVAL' });
  });

  it('removes a name only while it still names the inode the computer saw', async () => {
    const first = await mine.client.call('CREATE', await createMeta('swap.txt'), EMPTY);
    await expect(
      mine.client.call('UNLINK', {
        parent: mine.root,
        name: 'swap.txt',
        ino: first.ino + 1,
        opKey: opKey(),
      }),
    ).rejects.toMatchObject({ code: 'ESTALE' });
    await mine.client.call('UNLINK', {
      parent: mine.root,
      name: 'swap.txt',
      ino: first.ino,
      opKey: opKey(),
    });
  });
});

describe('removing a folder tree in one request', () => {
  async function tree(): Promise<{ folder: number; inodes: number[] }> {
    const folder = await mine.client.call('MKDIR', await mkdirMeta('tree'));
    const sub = await mine.client.call('MKDIR', await mkdirMeta('sub', folder.ino));
    const a = await mine.client.call('CREATE', await createMeta('a', sub.ino), EMPTY);
    const b = await mine.client.call('CREATE', await createMeta('b', folder.ino), EMPTY);
    return { folder: folder.ino, inodes: [sub.ino, a.ino, b.ino] };
  }

  it('trashes the folder once when the Hub holds exactly the removed items', async () => {
    const { folder, inodes } = await tree();
    const request = { parent: mine.root, name: 'tree', ino: folder, inodes, opKey: opKey() };
    await mine.client.call('RMTREE', request);
    await mine.client.call('RMTREE', request);
    const page = await mine.client.call('READDIR', { ino: mine.root, cursor: 0 });
    expect(page.entries.map(([name]) => name)).not.toContain('tree');
    const trashed = rig.posix.opened.store.driveTrash.inRoot(rig.posix.mine.id, null, 10);
    expect(trashed.entries.map((entry) => entry.name)).toEqual(['tree']);
  });

  it('refuses with ESTALE when the folder holds an item the computer did not remove', async () => {
    const { folder, inodes } = await tree();
    await expect(
      mine.client.call('RMTREE', {
        parent: mine.root,
        name: 'tree',
        ino: folder,
        inodes: inodes.slice(1),
        opKey: opKey(),
      }),
    ).rejects.toMatchObject({ code: 'ESTALE' });
    const page = await mine.client.call('READDIR', { ino: mine.root, cursor: 0 });
    expect(page.entries.map(([name]) => name)).toContain('tree');
  });
});

describe('resending an operation with the same key', () => {
  it('makes one folder and answers the same entry twice', async () => {
    const key = opKey();
    const first = await mine.client.call('MKDIR', await mkdirMeta('once', mine.root, key));
    const second = await mine.client.call('MKDIR', await mkdirMeta('once', mine.root, key));
    expect(second.ino).toBe(first.ino);
    const page = await mine.client.call('READDIR', { ino: mine.root, cursor: 0 });
    expect(page.entries.filter(([name]) => name === 'once')).toHaveLength(1);
  });

  it('answers a create, a symlink and a link again without a second effect', async () => {
    const createKey = opKey();
    const first = await mine.client.call(
      'CREATE',
      await createMeta('f', mine.root, createKey),
      EMPTY,
    );
    const again = await mine.client.call(
      'CREATE',
      await createMeta('f', mine.root, createKey),
      EMPTY,
    );
    expect(again.ino).toBe(first.ino);
    const linkKey = opKey();
    const link = { ino: first.ino, parent: mine.root, name: 'g', opKey: linkKey };
    const a = await mine.client.call('LINK', link);
    const b = await mine.client.call('LINK', link);
    expect(b.attr.nlink).toBe(a.attr.nlink);
    const symlinkKey = opKey();
    const symlink = {
      parent: mine.root,
      name: 'l',
      ino: await mine.client.ino(),
      target: 'f',
      uid: null,
      gid: null,
      opKey: symlinkKey,
    };
    const c = await mine.client.call('SYMLINK', symlink);
    const d = await mine.client.call('SYMLINK', symlink);
    expect(d.ino).toBe(c.ino);
  });

  it('answers an unlink, a rename and a rmdir again after they were done', async () => {
    const file = await mine.client.call('CREATE', await createMeta('r'), EMPTY);
    const rename = {
      parent: mine.root,
      name: 'r',
      newParent: mine.root,
      newName: 'r2',
      flags: 0,
      opKey: opKey(),
    };
    await mine.client.call('RENAME', rename);
    await mine.client.call('RENAME', rename);
    const unlink = { parent: mine.root, name: 'r2', ino: file.ino, opKey: opKey() };
    await mine.client.call('UNLINK', unlink);
    await mine.client.call('UNLINK', unlink);
    const folder = await mine.client.call('MKDIR', await mkdirMeta('d'));
    const rmdir = { parent: mine.root, name: 'd', ino: folder.ino, opKey: opKey() };
    await mine.client.call('RMDIR', rmdir);
    await mine.client.call('RMDIR', rmdir);
    expect(folder.ino).toBeGreaterThan(file.ino);
  });

  it('answers a setattr, an xattr write and an xattr removal again', async () => {
    const file = await mine.client.call('CREATE', await createMeta('s'), EMPTY);
    const setattr = { ino: file.ino, valid: 1, mode: 0o640, opKey: opKey() };
    await mine.client.call('SETATTR', setattr);
    expect((await mine.client.call('SETATTR', setattr)).attr.mode).toBe(0o640);
    const set = { ino: file.ino, name: 'user.k', flags: 1 as const, opKey: opKey() };
    await mine.client.call('SETXATTR', set, new Uint8Array([1]));
    await mine.client.call('SETXATTR', set, new Uint8Array([1]));
    const removal = { ino: file.ino, name: 'user.k', opKey: opKey() };
    await mine.client.call('REMOVEXATTR', removal);
    await mine.client.call('REMOVEXATTR', removal);
  });

  it('refuses the same key for another operation', async () => {
    const key = opKey();
    await mine.client.call('MKDIR', await mkdirMeta('k', mine.root, key));
    await expect(
      mine.client.call('CREATE', await createMeta('k2', mine.root, key), EMPTY),
    ).rejects.toMatchObject({
      code: 'EINVAL',
    });
  });

  it('rebuilds a lost reply from the claim committed with the operation', async () => {
    const lose = async (): Promise<void> => {
      await new Promise((resolve) => setImmediate(resolve));
      rig.posix.opened.store.database
        .prepare("update drive_sync_ops set result = json_set(result, '$.reply', json('null'))")
        .run();
    };
    const folderMeta = await mkdirMeta('lost');
    const folder = await mine.client.call('MKDIR', folderMeta);
    await lose();
    expect((await mine.client.call('MKDIR', folderMeta)).ino).toBe(folder.ino);
    const fileMeta = await createMeta('lost.txt', folder.ino);
    const file = await mine.client.call('CREATE', fileMeta, EMPTY);
    await lose();
    expect((await mine.client.call('CREATE', fileMeta, EMPTY)).ino).toBe(file.ino);
    const symlink = {
      parent: folder.ino,
      name: 'lost.lnk',
      ino: await mine.client.ino(),
      target: 'lost.txt',
      uid: null,
      gid: null,
      opKey: opKey(),
    };
    const made = await mine.client.call('SYMLINK', symlink);
    await lose();
    expect((await mine.client.call('SYMLINK', symlink)).ino).toBe(made.ino);
    const link = { ino: file.ino, parent: folder.ino, name: 'lost.2', opKey: opKey() };
    const linked = await mine.client.call('LINK', link);
    await lose();
    expect((await mine.client.call('LINK', link)).attr.nlink).toBe(linked.attr.nlink);
    const rename = {
      parent: folder.ino,
      name: 'lost.2',
      newParent: folder.ino,
      newName: 'lost.3',
      flags: 0,
      opKey: opKey(),
    };
    await mine.client.call('RENAME', rename);
    await lose();
    await mine.client.call('RENAME', rename);
    for (const name of ['lost.txt', 'lost.3', 'lost.lnk']) {
      const entry = await mine.client.call('LOOKUP', { parent: folder.ino, name });
      const unlink = { parent: folder.ino, name, ino: entry.ino, opKey: opKey() };
      await mine.client.call('UNLINK', unlink);
      await lose();
      await mine.client.call('UNLINK', unlink);
    }
    const rmdir = { parent: mine.root, name: 'lost', ino: folder.ino, opKey: opKey() };
    await mine.client.call('RMDIR', rmdir);
    await lose();
    await mine.client.call('RMDIR', rmdir);
    await expect(
      mine.client.call('LOOKUP', { parent: mine.root, name: 'lost' }),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('remembers the outcome for a later connection', async () => {
    const key = opKey();
    const first = await mine.client.call('MKDIR', await mkdirMeta('later', mine.root, key));
    const other = await attachTo(
      rig,
      { nodeId: rig.posix.node, profileId: rig.posix.ownerId },
      rig.posix.mine.id,
    );
    const second = await other.client.call('MKDIR', await mkdirMeta('later', mine.root, key));
    expect(second.ino).toBe(first.ino);
    expect((await stat(join(rig.posix.mine.path, 'later'))).isDirectory()).toBe(true);
  });

  it('answers a batch reposted by a restarted helper from the first run', async () => {
    const metas = await Promise.all(['case', 'case-2', 'case-3'].map((name) => mkdirMeta(name)));
    for (const meta of metas) void mine.client.call('MKDIR', meta).catch(() => null);
    mine.client.close();
    const other = await attachTo(
      rig,
      { nodeId: rig.posix.node, profileId: rig.posix.ownerId },
      rig.posix.mine.id,
    );
    const again = await Promise.all(metas.map((meta) => other.client.call('MKDIR', meta)));
    expect(again.map((entry) => entry.ino)).toEqual(metas.map((meta) => meta.ino));
  });

  it('refuses an inode already in use without calling it a name conflict', async () => {
    const first = await mkdirMeta('first');
    await mine.client.call('MKDIR', first);
    await expect(
      mine.client.call('MKDIR', { ...(await mkdirMeta('second')), ino: first.ino }),
    ).rejects.toMatchObject({ code: 'EINVAL' });
  });
});
