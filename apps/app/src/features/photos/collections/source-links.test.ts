import { describe, expect, it } from 'vitest';
import { DriveLinkCache } from '../../nas/data/links';
import { SOURCE_REV, sourceLinksOf } from './source-links';

const LATER = '2099-01-01T00:00:00.000Z';

describe('source links', () => {
  it('pairs each item with its file and thumbnail links and skips items the hub gave none', () => {
    const links = sourceLinksOf(
      ['a', 'b', 'c'],
      { a: { url: 'thumb-a', expiresAt: LATER } },
      {
        a: { url: 'file-a', expiresAt: LATER },
        b: { url: 'file-b', expiresAt: LATER },
      },
    );
    expect(links).toEqual([
      {
        itemId: 'a',
        rev: SOURCE_REV,
        file: { url: 'file-a', expiresAt: LATER },
        thumb: { url: 'thumb-a', expiresAt: LATER },
        preview: null,
      },
      {
        itemId: 'b',
        rev: SOURCE_REV,
        file: { url: 'file-b', expiresAt: LATER },
        thumb: null,
        preview: null,
      },
    ]);
  });

  it('asks the hub once for every tile that resolves in the same turn', async () => {
    const asked: (readonly string[])[] = [];
    const cache = new DriveLinkCache(
      async (ids) => {
        asked.push(ids);
        const files = Object.fromEntries(
          ids.map((id) => [id, { url: `f-${id}`, expiresAt: LATER }]),
        );
        return Promise.resolve(sourceLinksOf(ids, files, files));
      },
      Date.now,
      () => 0,
    );
    const urls = await Promise.all([
      cache.resolve('a', SOURCE_REV, 'thumb'),
      cache.resolve('b', SOURCE_REV, 'thumb'),
    ]);
    expect(urls).toEqual(['f-a', 'f-b']);
    expect(asked).toEqual([['a', 'b']]);
  });

  it('asks again for a link once the route to the hub changes', async () => {
    const asked: (readonly string[])[] = [];
    let generation = 0;
    const cache = new DriveLinkCache(
      async (ids) => {
        asked.push(ids);
        const files = Object.fromEntries(
          ids.map((id) => [id, { url: `f-${id}-${String(generation)}`, expiresAt: LATER }]),
        );
        return Promise.resolve(sourceLinksOf(ids, files, files));
      },
      Date.now,
      () => generation,
    );
    expect(await cache.resolve('a', SOURCE_REV, 'thumb')).toBe('f-a-0');
    generation = 1;
    expect(await cache.resolve('a', SOURCE_REV, 'thumb')).toBe('f-a-1');
    expect(asked).toEqual([['a'], ['a']]);
  });
});
