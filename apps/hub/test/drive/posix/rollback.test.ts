import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  create,
  diskNames,
  diskText,
  linkRequest,
  moving,
  openPosixRig,
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
  vi.restoreAllMocks();
  await rig.close();
});

function failNextWrite(): void {
  vi.spyOn(rig.opened.store.driveItems, 'write').mockImplementationOnce(() => {
    throw new Error('the index refused the row');
  });
}

describe('a failure in the index after the disk changed', () => {
  it('removes the new link name from the disk', async () => {
    const file = await rig.posix.create(rig.scope, create('a', rig.rootIno), new Uint8Array());
    failNextWrite();
    await expect(
      rig.posix.link(rig.scope, linkRequest(file.ino, rig.rootIno, 'b')),
    ).rejects.toThrow('the index refused the row');
    expect(await diskNames(rig.mine)).toEqual(['a']);
    expect((await rig.posix.getattr(rig.scope, file.ino)).nlink).toBe(1);
  });

  it('removes the new symbolic link from the disk', async () => {
    failNextWrite();
    await expect(
      rig.posix.symlink(rig.scope, symlinkRequest('l', rig.rootIno, 't')),
    ).rejects.toThrow('the index refused the row');
    expect(await diskNames(rig.mine)).toEqual([]);
  });

  it('puts a moved file back where it was', async () => {
    await save(rig, rig.mine, 'a', 'text');
    failNextWrite();
    await expect(
      rig.posix.rename(rig.scope, moving([rig.rootIno, 'a'], [rig.rootIno, 'b'])),
    ).rejects.toThrow('the index refused the row');
    expect(await diskText(rig.mine, 'a')).toBe('text');
    expect(await diskNames(rig.mine)).toEqual(['a']);
  });

  it('puts a held file back under its name when the index cannot record the unlink', async () => {
    const file = await rig.posix.create(rig.scope, create('a', rig.rootIno), new Uint8Array());
    await save(rig, rig.mine, 'a', 'open');
    rig.held.add(file.ino);
    vi.spyOn(rig.opened.store.driveInodes, 'setOrphan').mockImplementationOnce(() => {
      throw new Error('the index refused the orphan');
    });
    await expect(rig.posix.unlink(rig.scope, await removal(rig, rig.scope, 'a', rig.rootIno))).rejects.toThrow(
      'the index refused the orphan',
    );
    expect(await diskText(rig.mine, 'a')).toBe('open');
    expect((await rig.posix.getattr(rig.scope, file.ino)).nlink).toBe(1);
  });
});
