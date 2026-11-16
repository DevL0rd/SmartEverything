import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { save } from '../posix/posix-rig';
import { ListingCache } from '../../../src/drive/mount/listing-cache';
import { attachTo, openMountRig, until, type Attached, type MountRig } from './mount-rig';

let rig: MountRig;
let writer: Attached;
let reader: Attached;

beforeEach(async () => {
  rig = await openMountRig(120);
  writer = await attachTo(
    rig,
    { nodeId: rig.posix.node, profileId: rig.posix.ownerId },
    rig.posix.shared.id,
  );
  reader = await attachTo(
    rig,
    { nodeId: rig.posix.memberNode, profileId: rig.posix.memberId },
    rig.posix.shared.id,
  );
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rig.close();
});

function names(page: { entries: readonly (readonly [string, ...unknown[]])[] }): string[] {
  return page.entries.map(([name]) => name);
}

describe('listing cache', () => {
  it('serves a repeated listing from memory', async () => {
    await save(rig.posix, rig.posix.shared, 'a.txt', 'a');
    const read = vi.spyOn(rig.mount.services.posix, 'readdir');
    const first = await writer.client.call('READDIR', { ino: writer.root, cursor: 0 });
    const second = await writer.client.call('READDIR', { ino: writer.root, cursor: 0 });
    expect(read).toHaveBeenCalledTimes(1);
    expect(names(second)).toEqual(names(first));
    expect(names(second)).toContain('a.txt');
  });

  it('drops the cached listing before the push of another session is sent', async () => {
    await writer.client.call('READDIR', { ino: writer.root, cursor: 0 });
    expect(rig.mount.services.listings.size).toBe(1);
    const sizes: number[] = [];
    const pump = vi.spyOn(rig.mount.services.push, 'pump').mockImplementation(() => {
      sizes.push(rig.mount.services.listings.size);
    });
    await reader.client.created(reader.root, 'theirs.txt');
    await until(() => sizes.length > 0, 'a push pass');
    expect(sizes[0]).toBe(0);
    pump.mockRestore();
    const page = await writer.client.call('READDIR', { ino: writer.root, cursor: 0 });
    expect(names(page)).toContain('theirs.txt');
  });

  it('shows a change made outside the mount on the next listing', async () => {
    await writer.client.call('READDIR', { ino: writer.root, cursor: 0 });
    await save(rig.posix, rig.posix.shared, 'late.txt', 'l');
    const page = await writer.client.call('READDIR', { ino: writer.root, cursor: 0 });
    expect(names(page)).toContain('late.txt');
  });
});

describe('listing cache expiry', () => {
  const page = { entries: [], next: null };

  function ask(cache: ListingCache, load: () => Promise<typeof page>): Promise<unknown> {
    return cache.page(rig.posix.scope, { ino: 1, cursor: 0 }, load);
  }

  it('drops an unused entry after the configured seconds and keeps a used one', async () => {
    vi.useFakeTimers();
    try {
      const cache = new ListingCache(10, () => 1);
      const load = vi.fn(() => Promise.resolve(page));
      await ask(cache, load);
      await vi.advanceTimersByTimeAsync(6000);
      await ask(cache, load);
      await vi.advanceTimersByTimeAsync(6000);
      expect(cache.size).toBe(1);
      await vi.advanceTimersByTimeAsync(5000);
      expect(cache.size).toBe(0);
      expect(load).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not cache at zero seconds and clears when set to zero', async () => {
    const cache = new ListingCache(0, () => 1);
    const load = vi.fn(() => Promise.resolve(page));
    await ask(cache, load);
    await ask(cache, load);
    expect(load).toHaveBeenCalledTimes(2);
    cache.setSeconds(5);
    await ask(cache, load);
    expect(cache.size).toBe(1);
    cache.setSeconds(0);
    expect(cache.size).toBe(0);
  });

  it('treats an entry as stale when the root moved on', async () => {
    let seq = 1;
    const cache = new ListingCache(60, () => seq);
    const load = vi.fn(() => Promise.resolve(page));
    await ask(cache, load);
    seq = 2;
    await ask(cache, load);
    expect(load).toHaveBeenCalledTimes(2);
    cache.clear();
  });
});
