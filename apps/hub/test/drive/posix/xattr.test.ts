import { XATTR_FLAGS } from '@smarteverything/domain/drive-mount';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  create,
  mkdir,
  mknodRequest,
  openPosixRig,
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

const KEY: Uint8Array<ArrayBuffer> = new Uint8Array(16);

function set(
  ino: number,
  name: string,
  flags: 0 | 1 | 2 = 0,
): { ino: number; name: string; flags: 0 | 1 | 2; opKey: Uint8Array<ArrayBuffer> } {
  return { ino, name, flags, opKey: KEY };
}

const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);

describe('extended attributes', () => {
  it('stores, reads, lists and removes a value and moves the change time', async () => {
    const file = await rig.posix.create(rig.scope, create('a', rig.rootIno));
    const before = await rig.posix.getattr(rig.scope, file.ino);
    await rig.posix.setxattr(rig.scope, set(file.ino, 'user.note'), bytes(1, 2, 3));
    await rig.posix.setxattr(rig.scope, set(file.ino, 'security.tag'), bytes(9));
    expect(await rig.posix.getxattr(rig.scope, { ino: file.ino, name: 'user.note' })).toEqual(
      bytes(1, 2, 3),
    );
    expect(await rig.posix.listxattr(rig.scope, file.ino)).toEqual({
      names: ['security.tag', 'user.note'],
    });
    expect((await rig.posix.getattr(rig.scope, file.ino)).ctimeNs).toBeGreaterThan(before.ctimeNs);
    await rig.posix.removexattr(rig.scope, { ino: file.ino, name: 'user.note', opKey: KEY });
    expect(await rig.posix.listxattr(rig.scope, file.ino)).toEqual({ names: ['security.tag'] });
  });

  it('keeps them on folders and answers the create and replace flags', async () => {
    const dir = await rig.posix.mkdir(rig.scope, mkdir('d', rig.rootIno));
    await rig.posix.setxattr(rig.scope, set(dir.ino, 'user.a', XATTR_FLAGS.create), bytes(1));
    expect(
      await refusal(
        rig.posix.setxattr(rig.scope, set(dir.ino, 'user.a', XATTR_FLAGS.create), bytes(2)),
      ),
    ).toBe('EEXIST');
    expect(
      await refusal(
        rig.posix.setxattr(rig.scope, set(dir.ino, 'user.b', XATTR_FLAGS.replace), bytes(2)),
      ),
    ).toBe('ENODATA');
    await rig.posix.setxattr(rig.scope, set(dir.ino, 'user.a', XATTR_FLAGS.replace), bytes(3));
    expect(await rig.posix.getxattr(rig.scope, { ino: dir.ino, name: 'user.a' })).toEqual(bytes(3));
  });

  it('answers ENODATA for a missing value on read and remove', async () => {
    const file = await rig.posix.create(rig.scope, create('a', rig.rootIno));
    expect(await refusal(rig.posix.getxattr(rig.scope, { ino: file.ino, name: 'user.none' }))).toBe(
      'ENODATA',
    );
    expect(
      await refusal(
        rig.posix.removexattr(rig.scope, { ino: file.ino, name: 'user.none', opKey: KEY }),
      ),
    ).toBe('ENODATA');
  });

  it('does not support ACL or other namespaces so the kernel uses the mode bits', async () => {
    const file = await rig.posix.create(rig.scope, create('a', rig.rootIno));
    expect(
      await refusal(
        rig.posix.setxattr(rig.scope, set(file.ino, 'system.posix_acl_access'), bytes(1)),
      ),
    ).toBe('EOPNOTSUPP');
    expect(
      await refusal(
        rig.posix.getxattr(rig.scope, { ino: file.ino, name: 'system.posix_acl_default' }),
      ),
    ).toBe('EOPNOTSUPP');
    expect(
      await refusal(rig.posix.setxattr(rig.scope, set(file.ino, 'nonamespace'), bytes(1))),
    ).toBe('EOPNOTSUPP');
  });

  it('answers ERANGE for an empty name or prefix only, E2BIG for a value over 65536 bytes', async () => {
    const file = await rig.posix.create(rig.scope, create('a', rig.rootIno));
    expect(await refusal(rig.posix.setxattr(rig.scope, set(file.ino, 'user.'), bytes(1)))).toBe(
      'ERANGE',
    );
    expect(
      await refusal(rig.posix.setxattr(rig.scope, set(file.ino, 'user.a'), new Uint8Array(65_537))),
    ).toBe('E2BIG');
    await rig.posix.setxattr(rig.scope, set(file.ino, 'user.a'), new Uint8Array(65_536));
    expect((await rig.posix.getxattr(rig.scope, { ino: file.ino, name: 'user.a' })).length).toBe(
      65_536,
    );
  });

  it('answers ENOSPC when the names of one file would pass 65536 bytes', async () => {
    const file = await rig.posix.create(rig.scope, create('a', rig.rootIno));
    const long = (index: number): string =>
      `user.${String(index).padStart(3, '0')}${'x'.repeat(247)}`;
    for (let index = 0; index < 256; index += 1) {
      await rig.posix.setxattr(rig.scope, set(file.ino, long(index)), bytes(1));
    }
    expect(await refusal(rig.posix.setxattr(rig.scope, set(file.ino, long(256)), bytes(1)))).toBe(
      'ENOSPC',
    );
  });

  it('keeps user attributes off links and special files like Linux does', async () => {
    const link = await rig.posix.symlink(rig.scope, symlinkRequest('l', rig.rootIno, 't'));
    const fifo = await rig.posix.mknod(rig.scope, mknodRequest('p', rig.rootIno, 4));
    for (const entry of [link, fifo]) {
      expect(await refusal(rig.posix.setxattr(rig.scope, set(entry.ino, 'user.a'), bytes(1)))).toBe(
        'EPERM',
      );
      expect(
        await refusal(
          rig.posix.removexattr(rig.scope, { ino: entry.ino, name: 'user.a', opKey: KEY }),
        ),
      ).toBe('EPERM');
      expect(await refusal(rig.posix.getxattr(rig.scope, { ino: entry.ino, name: 'user.a' }))).toBe(
        'ENODATA',
      );
    }
    await rig.posix.setxattr(rig.scope, set(link.ino, 'trusted.a'), bytes(1));
    expect(await rig.posix.listxattr(rig.scope, link.ino)).toEqual({ names: ['trusted.a'] });
  });

  it('refuses a view-only person to change them and lets them read', async () => {
    const scope = await rig.granted('view');
    const note = await rig.posix.lookup(scope, { parent: scope.rootInode, name: 'note.txt' });
    expect(await refusal(rig.posix.setxattr(scope, set(note.ino, 'user.a'), bytes(1)))).toBe(
      'EACCES',
    );
    expect(
      await refusal(rig.posix.removexattr(scope, { ino: note.ino, name: 'user.a', opKey: KEY })),
    ).toBe('EACCES');
    expect(await rig.posix.listxattr(scope, note.ino)).toEqual({ names: [] });
  });
});
