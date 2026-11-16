import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachTo, opKey, openMountRig, type Attached, type MountRig } from './mount-rig';

const WRITTEN_NS = 1_763_100_000_123_456_789n;

let rig: MountRig;
let mine: Attached;

beforeEach(async () => {
  rig = await openMountRig(80);
  mine = await attachTo(
    rig,
    { nodeId: rig.posix.node, profileId: rig.posix.ownerId },
    rig.posix.mine.id,
  );
});

afterEach(async () => {
  await rig.close();
});

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

const decode = (bytes: Uint8Array | null): string =>
  new TextDecoder().decode(bytes ?? new Uint8Array());

async function filled(name: string, content: string): Promise<number> {
  const entry = await mine.client.created(mine.root, name);
  await mine.client.call(
    'PUT',
    {
      ino: entry.ino,
      baseRev: entry.attr.rev,
      size: content.length,
      mtimeNs: WRITTEN_NS,
      fsync: false,
      opKey: opKey(),
    },
    text(content),
  );
  return entry.ino;
}

async function orphans(): Promise<string[]> {
  return readdir(join(rig.posix.mine.path, '.se-orphans')).catch(() => []);
}

describe('open files', () => {
  it('reads ranges, stops at the end and seeks data and holes', async () => {
    const ino = await filled('data.txt', '0123456789');
    const { handle } = await mine.client.call('OPEN', { ino });
    const middle = await mine.client.request('READ', { handle, offset: 2, length: 4 }).sent;
    expect(decode(middle.payload)).toBe('2345');
    const tail = await mine.client.request('READ', { handle, offset: 8, length: 100 }).sent;
    expect(decode(tail.payload)).toBe('89');
    const beyond = await mine.client.request('READ', { handle, offset: 50, length: 4 }).sent;
    expect(beyond.payload).toHaveLength(0);
    expect((await mine.client.call('SEEK', { handle, offset: 3, whence: 3 })).offset).toBe(3);
    expect((await mine.client.call('SEEK', { handle, offset: 3, whence: 4 })).offset).toBe(10);
    await expect(mine.client.call('SEEK', { handle, offset: 10, whence: 3 })).rejects.toMatchObject(
      { code: 'EINVAL' },
    );
    await mine.client.call('RELEASE', { handle });
    await expect(
      mine.client.request('READ', { handle, offset: 0, length: 1 }).sent,
    ).rejects.toMatchObject({
      code: 'ESTALE',
    });
  });

  it('refuses a folder and reads the new content after the file is replaced', async () => {
    await expect(mine.client.call('OPEN', { ino: mine.root })).rejects.toMatchObject({
      code: 'EISDIR',
    });
    const ino = await filled('swap.txt', 'old');
    const { handle } = await mine.client.call('OPEN', { ino });
    const before = await mine.client.request('READ', { handle, offset: 0, length: 10 }).sent;
    expect(decode(before.payload)).toBe('old');
    const attr = await mine.client.call('GETATTR', { ino });
    await mine.client.call(
      'PUT',
      { ino, baseRev: attr.attr.rev, size: 5, mtimeNs: WRITTEN_NS, fsync: false, opKey: opKey() },
      text('newer'),
    );
    const after = await mine.client.request('READ', { handle, offset: 0, length: 10 }).sent;
    expect(decode(after.payload)).toBe('newer');
  });

  it('keeps an unlinked open file readable and frees it at release', async () => {
    const ino = await filled('temp.txt', 'still here');
    const { handle } = await mine.client.call('OPEN', { ino });
    await mine.client.call('UNLINK', { parent: mine.root, name: 'temp.txt', ino, opKey: opKey() });
    expect(await orphans()).toEqual([String(ino)]);
    const read = await mine.client.request('READ', { handle, offset: 0, length: 20 }).sent;
    expect(decode(read.payload)).toBe('still here');
    await mine.client.call('RELEASE', { handle });
    expect(await orphans()).toEqual([]);
    expect(rig.posix.opened.store.driveInodes.find(ino)).toBeUndefined();
  });

  it('frees the held files of a session whose lease ran out', async () => {
    const ino = await filled('held.txt', 'held');
    await mine.client.call('OPEN', { ino });
    await mine.client.call('UNLINK', { parent: mine.root, name: 'held.txt', ino, opKey: opKey() });
    expect(await orphans()).toEqual([String(ino)]);
    mine.client.close();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await orphans()).toEqual([]);
  });

  it('keeps the file of a still held inode when another handle closes', async () => {
    const ino = await filled('two.txt', 'two');
    const first = await mine.client.call('OPEN', { ino });
    const second = await mine.client.call('OPEN', { ino });
    await mine.client.call('UNLINK', { parent: mine.root, name: 'two.txt', ino, opKey: opKey() });
    await mine.client.call('RELEASE', { handle: first.handle });
    expect(await orphans()).toEqual([String(ino)]);
    await mine.client.call('RELEASE', { handle: second.handle });
    expect(await orphans()).toEqual([]);
  });
});
