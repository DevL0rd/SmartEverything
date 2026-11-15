import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FILESYSTEM_BLOCK_BYTES } from '../../../src/drive/posix/statfs';
import { RELATIME_WINDOW_NS } from '../../../src/drive/posix/times';
import {
  create,
  mkdir,
  mknodRequest,
  openPosixRig,
  refusal,
  save,
  type PosixRig,
} from './posix-rig';

let rig: PosixRig;

beforeEach(async () => {
  rig = await openPosixRig(true);
});

afterEach(async () => {
  await rig.close();
});

describe('statfs', () => {
  it('reports blocks, free space, inodes and the name length of the drive', async () => {
    const reply = await rig.posix.statfs(rig.scope, rig.rootIno);
    expect(reply.bsize).toBe(FILESYSTEM_BLOCK_BYTES);
    expect(reply.namelen).toBe(255);
    expect(reply.free).toBe(Math.floor(1_000_000_000_000 / FILESYSTEM_BLOCK_BYTES));
    expect(reply.avail).toBe(reply.free);
    expect(reply.blocks).toBeGreaterThanOrEqual(reply.free);
    expect(reply.ffree).toBe(900);
    expect(reply.files).toBeGreaterThanOrEqual(900);
  });

  it('shrinks the free space to what is left of the quota', async () => {
    rig.opened.store.driveQuotas.set(rig.ownerId, 40_960);
    const reply = await rig.posix.statfs(rig.scope, rig.rootIno);
    expect(reply.free).toBe(10);
  });

  it('refuses an inode of another drive', async () => {
    expect(await refusal(rig.posix.statfs(rig.scope, 99_999))).toBe('ESTALE');
  });
});

describe('open target', () => {
  it('names the live file with its size, revision and etag', async () => {
    await rig.posix.mkdir(rig.scope, mkdir('d', rig.rootIno));
    const dir = await rig.posix.lookup(rig.scope, { parent: rig.rootIno, name: 'd' });
    await save(rig, rig.mine, 'd/a.txt', 'hello');
    const entry = await rig.posix.lookup(rig.scope, { parent: dir.ino, name: 'a.txt' });
    const target = await rig.posix.openTarget(rig.scope, entry.ino, true);
    expect(target).toMatchObject({
      inodeId: entry.ino,
      relPath: 'd/a.txt',
      size: 5,
      rev: entry.attr.rev,
      etag: entry.attr.etag,
    });
  });

  it('names the hidden file of an unnamed inode', async () => {
    const entry = await rig.posix.tmpfile(rig.scope, {
      parent: rig.rootIno,
      mode: 0o600,
      uid: null,
      gid: null,
      opKey: new Uint8Array(16),
    });
    expect((await rig.posix.openTarget(rig.scope, entry.ino, true)).relPath).toBe(
      `.se-orphans/${String(entry.ino)}`,
    );
  });

  it('refuses a folder, a special file and a writer who may only view', async () => {
    const dir = await rig.posix.mkdir(rig.scope, mkdir('d', rig.rootIno));
    const fifo = await rig.posix.mknod(rig.scope, mknodRequest('p', rig.rootIno, 4));
    expect(await refusal(rig.posix.openTarget(rig.scope, dir.ino, false))).toBe('EISDIR');
    expect(await refusal(rig.posix.openTarget(rig.scope, fifo.ino, false))).toBe('EINVAL');
    const scope = await rig.granted('view');
    const note = await rig.posix.lookup(scope, { parent: scope.rootInode, name: 'note.txt' });
    expect((await rig.posix.openTarget(scope, note.ino, false)).inodeId).toBe(note.ino);
    expect(await refusal(rig.posix.openTarget(scope, note.ino, true))).toBe('EACCES');
  });
});

describe('access time on read', () => {
  const access = async (ino: number, strict: boolean): Promise<bigint> =>
    (await rig.posix.access(rig.scope, { ino, strict })).atimeNs;

  it('updates under relatime when the access time is not newer than the modify or change time and not otherwise', async () => {
    const entry = await rig.posix.create(rig.scope, create('a', rig.rootIno));
    rig.clock.current = new Date(Date.now() + 10_000);
    const first = await access(entry.ino, false);
    const attr = await rig.posix.getattr(rig.scope, entry.ino);
    expect(first).toBeGreaterThan(attr.mtimeNs);
    expect(first).toBeGreaterThan(attr.ctimeNs);
    rig.clock.current = new Date(rig.clock.current.getTime() + 1000);
    expect(await access(entry.ino, false)).toBe(first);
  });

  it('updates again under relatime when the access time is a day old', async () => {
    const entry = await rig.posix.create(rig.scope, create('a', rig.rootIno));
    const first = Date.now() + 10_000;
    const day = Number(RELATIME_WINDOW_NS / 1_000_000n);
    rig.clock.current = new Date(first);
    const noted = await access(entry.ino, false);
    rig.clock.current = new Date(first + day - 1);
    expect(await access(entry.ino, false)).toBe(noted);
    rig.clock.current = new Date(first + day);
    expect(await access(entry.ino, false)).toBeGreaterThan(noted);
  });

  it('updates on every access under strictatime', async () => {
    const entry = await rig.posix.create(rig.scope, create('a', rig.rootIno));
    rig.clock.current = new Date(Date.now() + 10_000);
    const first = await access(entry.ino, true);
    rig.clock.current = new Date(rig.clock.current.getTime() + 1000);
    expect(await access(entry.ino, true)).toBeGreaterThan(first);
  });
});
