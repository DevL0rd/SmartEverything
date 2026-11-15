import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TMP_DIRECTORY } from '../../../src/drive/intents';
import { attachTo, openMountRig, opKey, type Attached, type MountRig } from './mount-rig';

const WRITTEN_NS = 1_763_100_000_123_456_789n;

let rig: MountRig;
let mine: Attached;

beforeEach(async () => {
  rig = await openMountRig(90_000, true);
  mine = await attachTo(
    rig,
    { nodeId: rig.posix.node, profileId: rig.posix.ownerId },
    rig.posix.mine.id,
  );
});

afterEach(async () => {
  await rig.close();
});

function patterned(size: number): Buffer {
  const bytes = Buffer.alloc(size);
  for (let at = 0; at < size; at += 1) bytes[at] = (at * 31 + (at >> 8)) & 0xff;
  return bytes;
}

async function put(name: string, content: Uint8Array): Promise<number> {
  const entry = await mine.client.call('CREATE', {
    parent: mine.root,
    name,
    mode: 0o644,
    uid: null,
    gid: null,
    exclusive: true,
    opKey: opKey(),
  });
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
    content,
  );
  return entry.ino;
}

async function begin(ino: number): Promise<number> {
  const rev = (await mine.client.call('GETATTR', { ino })).attr.rev;
  return (await mine.client.call('BEGIN', { ino, baseRev: rev, opKey: opKey() })).commit;
}

async function finish(commit: number, size: number): Promise<void> {
  await mine.client.call('END', {
    commit,
    size,
    mtimeNs: WRITTEN_NS,
    fsync: false,
    opKey: opKey(),
  });
}

async function onDisk(name: string): Promise<Buffer> {
  return readFile(join(rig.posix.mine.path, name));
}

describe('server-side copy', () => {
  it('copies a whole file into an empty commit and the stored hash matches the bytes', async () => {
    const content = patterned(700_017);
    const source = await put('whole-from.bin', content);
    const target = await put('whole-to.bin', Buffer.alloc(0));
    const { handle } = await mine.client.call('OPEN', { ino: source });
    const commit = await begin(target);
    const copied = await mine.client.call('COPY', {
      srcHandle: handle,
      srcOffset: 0,
      commit,
      dstOffset: 0,
      length: content.length,
    });
    expect(copied.copied).toBe(content.length);
    await finish(commit, content.length);
    expect(await onDisk('whole-to.bin')).toEqual(content);
    const item = rig.posix.opened.store.driveItems.find(
      rig.posix.opened.store.driveInodes.names(target)[0] ?? '',
      null,
    );
    expect(item !== undefined && 'sha256' in item ? item.sha256 : undefined).toBe(
      createHash('sha256').update(content).digest('hex'),
    );
    await mine.client.call('RELEASE', { handle });
  });

  it('takes the reflink path exactly when the disk can reflink, and clones only whole files', async () => {
    const content = patterned(1024 * 1024);
    const source = await put('path-from.bin', content);
    const target = await put('path-to.bin', Buffer.alloc(0));
    const partial = await put('path-partial.bin', Buffer.alloc(0));
    const capable = await rig.mount.services.copy.reflinkCapable(rig.posix.mine.id);
    const clone = vi.spyOn(rig.mount.services.staging, 'clone');
    const { handle } = await mine.client.call('OPEN', { ino: source });
    const whole = await begin(target);
    await mine.client.call('COPY', {
      srcHandle: handle,
      srcOffset: 0,
      commit: whole,
      dstOffset: 0,
      length: content.length,
    });
    await finish(whole, content.length);
    expect(clone).toHaveBeenCalledTimes(capable ? 1 : 0);
    const some = await begin(partial);
    await mine.client.call('COPY', {
      srcHandle: handle,
      srcOffset: 100,
      commit: some,
      dstOffset: 0,
      length: 5000,
    });
    await finish(some, 5000);
    expect(clone).toHaveBeenCalledTimes(capable ? 1 : 0);
    expect(await onDisk('path-partial.bin')).toEqual(content.subarray(100, 5100));
    await mine.client.call('RELEASE', { handle });
  });

  it('keeps bytes already received in the commit when the copy does not cover the file', async () => {
    const content = patterned(200_000);
    const source = await put('keep-from.bin', content);
    const target = await put('keep-to.bin', Buffer.alloc(300_000, 7));
    const { handle } = await mine.client.call('OPEN', { ino: source });
    const commit = await begin(target);
    await mine.client.call('WRITE', { commit, offset: 250_000 }, Buffer.alloc(10, 9));
    await mine.client.call('COPY', {
      srcHandle: handle,
      srcOffset: 0,
      commit,
      dstOffset: 0,
      length: content.length,
    });
    await finish(commit, 300_000);
    const expected = Buffer.alloc(300_000, 7);
    content.copy(expected, 0);
    Buffer.alloc(10, 9).copy(expected, 250_000);
    expect(await onDisk('keep-to.bin')).toEqual(expected);
    await mine.client.call('RELEASE', { handle });
  });

  it('probes each root once and leaves no probe files behind', async () => {
    const root = rig.posix.mine.id;
    const first = rig.mount.services.copy.reflinkCapable(root);
    expect(rig.mount.services.copy.reflinkCapable(root)).toBe(first);
    await first;
    const leftover = (await readdir(join(rig.posix.mine.path, TMP_DIRECTORY))).filter((name) =>
      name.startsWith('reflink-probe-'),
    );
    expect(leftover).toEqual([]);
  });
});
