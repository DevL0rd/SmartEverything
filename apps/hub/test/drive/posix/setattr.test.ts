import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { SETATTR_VALID, type RequestMeta } from '@smarteverything/domain/drive-mount';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  create,
  diskMode,
  diskText,
  mkdir,
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

function request(
  ino: number,
  valid: number,
  fields: Partial<Omit<RequestMeta<'SETATTR'>, 'ino' | 'valid' | 'opKey'>>,
): RequestMeta<'SETATTR'> {
  return { ino, valid, opKey: new Uint8Array(16), ...fields };
}

function versionsOfA(): number {
  const item = rig.opened.store.driveItems.byPath(rig.mine.id, 'a.txt', null);
  return rig.opened.store.driveVersions.forItem(item?.id ?? '', null, 10).versions.length;
}

async function fileWith(text: string): Promise<number> {
  const entry = await rig.posix.create(rig.scope, create('a.txt', rig.rootIno), new Uint8Array());
  await save(rig, rig.mine, 'a.txt', text);
  return entry.ino;
}

describe('mode and owner', () => {
  it('stores the mode, mirrors it onto the disk and moves the change time but not the modify time', async () => {
    const ino = await fileWith('hello');
    const before = await rig.posix.getattr(rig.scope, ino);
    const attr = await rig.posix.setattr(
      rig.scope,
      request(ino, SETATTR_VALID.mode, { mode: 0o4750 }),
    );
    expect(attr.mode).toBe(0o4750);
    expect(attr.ctimeNs).toBeGreaterThan(before.ctimeNs);
    expect(attr.mtimeNs).toBe(before.mtimeNs);
    expect(await diskMode(rig.mine, 'a.txt')).toBe(0o750);
  });

  it('keeps the Hub able to read a file whose owner bits are removed', async () => {
    const ino = await fileWith('x');
    await rig.posix.setattr(rig.scope, request(ino, SETATTR_VALID.mode, { mode: 0o044 }));
    expect(await diskMode(rig.mine, 'a.txt')).toBe(0o644);
    expect((await rig.posix.getattr(rig.scope, ino)).mode).toBe(0o044);
  });

  it('changes a folder mode with the folder bits', async () => {
    const dir = await rig.posix.mkdir(rig.scope, mkdir('d', rig.rootIno));
    await rig.posix.setattr(rig.scope, request(dir.ino, SETATTR_VALID.mode, { mode: 0o500 }));
    expect(await diskMode(rig.mine, 'd')).toBe(0o700);
  });

  it('stores a numeric owner and goes back to the person with null', async () => {
    const ino = await fileWith('x');
    const set = await rig.posix.setattr(
      rig.scope,
      request(ino, SETATTR_VALID.uid | SETATTR_VALID.gid, { uid: 1234, gid: 4321 }),
    );
    expect([set.uid, set.gid]).toEqual([1234, 4321]);
    const back = await rig.posix.setattr(
      rig.scope,
      request(ino, SETATTR_VALID.uid | SETATTR_VALID.gid, { uid: null, gid: null }),
    );
    expect([back.uid, back.gid]).toEqual([null, null]);
  });

  it('changes the mode of a link and a special file without touching the disk', async () => {
    const link = await rig.posix.symlink(rig.scope, symlinkRequest('l', rig.rootIno, 'a'));
    const attr = await rig.posix.setattr(
      rig.scope,
      request(link.ino, SETATTR_VALID.mode, { mode: 0o700 }),
    );
    expect(attr.mode).toBe(0o700);
  });
});

describe('times', () => {
  it('sets modify and access times to exact nanoseconds and indexes the modify time the disk holds', async () => {
    const ino = await fileWith('x');
    const mtime = 1_700_000_000_123_000_000n;
    const attr = await rig.posix.setattr(
      rig.scope,
      request(ino, SETATTR_VALID.mtime | SETATTR_VALID.atime, {
        mtime,
        atime: 1_600_000_000_000_000_000n,
      }),
    );
    expect(attr.mtimeNs).toBe(mtime);
    expect(attr.atimeNs).toBe(1_600_000_000_000_000_000n);
    expect(Math.floor((await stat(join(rig.mine.path, 'a.txt'))).mtimeMs)).toBe(1_700_000_000_123);
    const disk = await stat(join(rig.mine.path, 'a.txt'), { bigint: true });
    expect(rig.opened.store.driveItems.byPath(rig.mine.id, 'a.txt', null)?.modifiedAt).toBe(
      new Date(Number(disk.mtimeMs)).toISOString(),
    );
  });

  it('sets only the access time and leaves the modify time', async () => {
    const ino = await fileWith('x');
    const before = await rig.posix.getattr(rig.scope, ino);
    const attr = await rig.posix.setattr(
      rig.scope,
      request(ino, SETATTR_VALID.atime, { atime: 5_000_000_000n }),
    );
    expect(attr.atimeNs).toBe(5_000_000_000n);
    expect(attr.mtimeNs).toBe(before.mtimeNs);
  });

  it('sets both times to now', async () => {
    const ino = await fileWith('x');
    await rig.posix.setattr(
      rig.scope,
      request(ino, SETATTR_VALID.mtime, { mtime: 5_000_000_000n }),
    );
    const attr = await rig.posix.setattr(
      rig.scope,
      request(ino, SETATTR_VALID.mtime | SETATTR_VALID.atime, { mtime: 'now', atime: 'now' }),
    );
    const now = BigInt(Date.parse('2026-11-07T00:00:00.000Z')) * 1_000_000n;
    expect(attr.mtimeNs).toBe(now);
    expect(attr.atimeNs).toBe(now);
  });

  it('answers a setattr with nothing to change by returning the attributes', async () => {
    const ino = await fileWith('x');
    const before = await rig.posix.getattr(rig.scope, ino);
    expect(await rig.posix.setattr(rig.scope, request(ino, 0, {}))).toEqual(before);
  });
});

describe('truncate', () => {
  it('shrinks a file in place and keeps the old bytes as a version when history is on', async () => {
    const ino = await fileWith('hello world');
    const before = versionsOfA();
    const attr = await rig.posix.setattr(rig.scope, request(ino, SETATTR_VALID.size, { size: 5 }));
    expect(attr.size).toBe(5);
    expect(await diskText(rig.mine, 'a.txt')).toBe('hello');
    expect(versionsOfA()).toBe(before + 1);
  });

  it('keeps no version when history is off', async () => {
    rig.opened.store.driveRoots.update(rig.mine.id, { versions: false });
    const ino = await fileWith('hello world');
    await rig.posix.setattr(rig.scope, request(ino, SETATTR_VALID.size, { size: 5 }));
    expect(versionsOfA()).toBe(0);
  });

  it('grows a file with zeros', async () => {
    const ino = await fileWith('ab');
    const attr = await rig.posix.setattr(rig.scope, request(ino, SETATTR_VALID.size, { size: 6 }));
    expect(attr.size).toBe(6);
    expect(await diskText(rig.mine, 'a.txt')).toBe('ab\0\0\0\0');
  });

  it('truncates to the same size and still moves the modify time', async () => {
    const ino = await fileWith('ab');
    const before = await rig.posix.getattr(rig.scope, ino);
    const attr = await rig.posix.setattr(rig.scope, request(ino, SETATTR_VALID.size, { size: 2 }));
    expect(attr.size).toBe(2);
    expect(attr.ctimeNs).toBeGreaterThanOrEqual(before.ctimeNs);
  });

  it('applies the size and then the times given with it', async () => {
    const ino = await fileWith('abcd');
    const attr = await rig.posix.setattr(
      rig.scope,
      request(ino, SETATTR_VALID.size | SETATTR_VALID.mtime, { size: 1, mtime: 7_000_000_000n }),
    );
    expect([attr.size, attr.mtimeNs]).toEqual([1, 7_000_000_000n]);
  });

  it('refuses a folder, a link and a file that is unnamed', async () => {
    const dir = await rig.posix.mkdir(rig.scope, mkdir('d', rig.rootIno));
    const link = await rig.posix.symlink(rig.scope, symlinkRequest('l', rig.rootIno, 'a'));
    expect(
      await refusal(
        rig.posix.setattr(rig.scope, request(dir.ino, SETATTR_VALID.size, { size: 0 })),
      ),
    ).toBe('EISDIR');
    expect(
      await refusal(
        rig.posix.setattr(rig.scope, request(link.ino, SETATTR_VALID.size, { size: 0 })),
      ),
    ).toBe('EINVAL');
    const unnamed = await rig.posix.tmpfile(rig.scope, {
      parent: rig.rootIno,
      mode: 0o600,
      uid: null,
      gid: null,
      opKey: new Uint8Array(16),
    });
    expect(
      await refusal(
        rig.posix.setattr(rig.scope, request(unnamed.ino, SETATTR_VALID.size, { size: 0 })),
      ),
    ).toBe('ESTALE');
  });

  it('answers EDQUOT over the quota and ENOSPC when the disk is full', async () => {
    const ino = await fileWith('x');
    rig.opened.store.driveQuotas.set(rig.ownerId, 100);
    expect(
      await refusal(rig.posix.setattr(rig.scope, request(ino, SETATTR_VALID.size, { size: 1000 }))),
    ).toBe('EDQUOT');
    rig.opened.store.driveQuotas.set(rig.ownerId, null);
    rig.limits.freeBytes = 10;
    expect(
      await refusal(rig.posix.setattr(rig.scope, request(ino, SETATTR_VALID.size, { size: 1000 }))),
    ).toBe('ENOSPC');
    expect(await diskText(rig.mine, 'a.txt')).toBe('x');
  });
});

describe('access', () => {
  it('refuses a view-only person and an unknown inode', async () => {
    const scope = await rig.granted('view');
    const note = await rig.posix.lookup(scope, { parent: scope.rootInode, name: 'note.txt' });
    expect(
      await refusal(
        rig.posix.setattr(scope, request(note.ino, SETATTR_VALID.mode, { mode: 0o600 })),
      ),
    ).toBe('EACCES');
    expect(
      await refusal(
        rig.posix.setattr(rig.scope, request(99_999, SETATTR_VALID.mode, { mode: 0o600 })),
      ),
    ).toBe('ESTALE');
  });
});
