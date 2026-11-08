import { describe, expect, it, vi } from 'vitest';
import type { DriveItemLink } from '@smarteverything/domain';
import { DriveLinkCache, LINK_RENEW_LEAD_MS, type ReadLinks } from './links';

const ITEM = 'a1b2c3d4-0000-4000-8000-000000000011';
const OTHER = 'a1b2c3d4-0000-4000-8000-000000000012';
const START = Date.parse('2026-11-07T10:00:00.000Z');
const TEN_MINUTES = 10 * 60_000;

function link(itemId: string, rev: number, issuedAt: number, thumb: boolean): DriveItemLink {
  const expiresAt = new Date(issuedAt + TEN_MINUTES).toISOString();
  return {
    itemId,
    rev,
    file: { url: `/media/f-${itemId}-${String(rev)}-${String(issuedAt)}`, expiresAt },
    thumb: thumb
      ? { url: `/media/t-${itemId}-${String(rev)}-${String(issuedAt)}`, expiresAt }
      : null,
    preview: null,
  };
}

function cacheOf(): {
  readonly cache: DriveLinkCache;
  readonly read: ReturnType<typeof vi.fn<ReadLinks>>;
  readonly advance: (ms: number) => void;
  readonly switchRoute: () => void;
} {
  let now = START;
  let generation = 1;
  const read = vi.fn<ReadLinks>((ids) =>
    Promise.resolve(ids.map((id) => link(id, 1, now, id === ITEM))),
  );
  return {
    cache: new DriveLinkCache(
      read,
      () => now,
      () => generation,
    ),
    read,
    advance: (ms: number): void => {
      now += ms;
    },
    switchRoute: (): void => {
      generation += 1;
    },
  };
}

describe('drive link cache', () => {
  it('asks once for links requested together and serves repeats from the cache', async () => {
    const { cache, read } = cacheOf();
    const [file, thumb, other] = await Promise.all([
      cache.resolve(ITEM, 1, 'file'),
      cache.resolve(ITEM, 1, 'thumb'),
      cache.resolve(OTHER, 1, 'file'),
    ]);
    expect(read).toHaveBeenCalledExactlyOnceWith([ITEM, OTHER]);
    expect(file).toContain('/media/f-');
    expect(thumb).toContain('/media/t-');
    expect(other).toContain(OTHER);
    await cache.resolve(ITEM, 1, 'file');
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('answers null for a size the item does not have', async () => {
    const { cache } = cacheOf();
    expect(await cache.resolve(OTHER, 1, 'thumb')).toBeNull();
  });

  it('keeps a link until shortly before it expires, then asks for a new one when read', async () => {
    const { cache, read, advance } = cacheOf();
    const first = await cache.resolve(ITEM, 1, 'file');
    advance(TEN_MINUTES - LINK_RENEW_LEAD_MS - 1);
    expect(await cache.resolve(ITEM, 1, 'file')).toBe(first);
    expect(read).toHaveBeenCalledTimes(1);
    advance(1);
    const renewed = await cache.resolve(ITEM, 1, 'file');
    expect(renewed).not.toBe(first);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('keys links by revision so a changed file never shows its old link', async () => {
    const { cache, read } = cacheOf();
    await cache.resolve(ITEM, 1, 'file');
    expect(await cache.resolve(ITEM, 2, 'file')).toBeNull();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('asks again after the route changes instead of serving a link made for the old route', async () => {
    const { cache, read, switchRoute } = cacheOf();
    await cache.resolve(ITEM, 1, 'file');
    switchRoute();
    expect(await cache.resolve(ITEM, 1, 'file')).toContain('/media/f-');
    expect(read).toHaveBeenCalledTimes(2);
    await cache.resolve(ITEM, 1, 'file');
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('does not serve a link fetched under a route that changed while it was in flight', async () => {
    const { cache, read, switchRoute } = cacheOf();
    read.mockImplementationOnce((ids) => {
      switchRoute();
      return Promise.resolve(ids.map((id) => link(id, 1, START, false)));
    });
    expect(await cache.resolve(ITEM, 1, 'file')).toBeNull();
  });

  it('shares one request between concurrent callers of the same item', async () => {
    const { cache, read } = cacheOf();
    await Promise.all([cache.resolve(ITEM, 1, 'file'), cache.resolve(ITEM, 1, 'file')]);
    expect(read).toHaveBeenCalledExactlyOnceWith([ITEM]);
  });

  it('forgets its links when cleared', async () => {
    const { cache, read } = cacheOf();
    await cache.resolve(ITEM, 1, 'file');
    cache.clear();
    await cache.resolve(ITEM, 1, 'file');
    expect(read).toHaveBeenCalledTimes(2);
  });
});
