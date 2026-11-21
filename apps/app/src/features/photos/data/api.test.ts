import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PHOTOS_ENDPOINTS as P } from '@smarteverything/domain';

const call = vi.hoisted(() => vi.fn());

vi.mock('../../../api/transport', () => ({ api: (): unknown => ({ call }) }));

import {
  listPhotoSource,
  makeStackCover,
  readPlace,
  readLibraryBuckets,
  readLibraryPage,
  NO_SOURCE_SEARCH,
} from '../../../api/photos';

const ITEM = '00000000-0000-4000-8000-0000000000a1';
const STACK = '00000000-0000-4000-8000-0000000000b1';

describe('photos api', () => {
  beforeEach(() => {
    call.mockReset();
    call.mockResolvedValue(undefined);
  });

  it('sends the whole library scope as the query', async () => {
    const { signal } = new AbortController();
    await readLibraryBuckets({ filter: 'videos' }, signal);
    expect(call).toHaveBeenCalledWith(
      P.readLibraryBuckets,
      { query: { filter: 'videos' } },
      { signal },
    );
    await readLibraryBuckets(
      {
        filter: 'all',
        placeId: 7,
        countryCode: 'PT',
        camera: 'Sony A7 IV',
        albumId: ITEM,
        text: 'beach',
        from: '2026-01-01',
        to: '2026-12-31',
      },
      signal,
    );
    expect(call).toHaveBeenLastCalledWith(
      P.readLibraryBuckets,
      {
        query: {
          filter: 'all',
          placeId: 7,
          countryCode: 'PT',
          camera: 'Sony A7 IV',
          albumId: ITEM,
          text: 'beach',
          from: '2026-01-01',
          to: '2026-12-31',
        },
      },
      { signal },
    );
  });

  it('sends a month with the cursor only when there is one', async () => {
    const { signal } = new AbortController();
    await readLibraryPage('2026-10', { filter: 'all' }, null, signal);
    expect(call).toHaveBeenLastCalledWith(
      P.readLibraryPage,
      { params: { month: '2026-10' }, query: { filter: 'all' } },
      { signal },
    );
    await readLibraryPage('2026-10', { filter: 'favourites', text: 'sun' }, 'c1', signal);
    expect(call).toHaveBeenLastCalledWith(
      P.readLibraryPage,
      { params: { month: '2026-10' }, query: { filter: 'favourites', text: 'sun', cursor: 'c1' } },
      { signal },
    );
  });

  it('sends source chips, search and cursors only when chosen', async () => {
    const { signal } = new AbortController();
    await listPhotoSource('cameras', null, NO_SOURCE_SEARCH, { cursor: null, signal });
    expect(call).toHaveBeenLastCalledWith(
      P.listPhotoSource,
      { params: { source: 'cameras' }, query: {} },
      { signal },
    );
    await listPhotoSource(
      'ai',
      'chip',
      { text: 'cat', from: '2026-01-01', to: null },
      { cursor: 'c2', signal },
    );
    expect(call).toHaveBeenLastCalledWith(
      P.listPhotoSource,
      {
        params: { source: 'ai' },
        query: { chipId: 'chip', text: 'cat', from: '2026-01-01', cursor: 'c2' },
      },
      { signal },
    );
  });

  it('sends ids as path parameters and bodies', async () => {
    const { signal } = new AbortController();
    await readPlace(3, signal);
    expect(call).toHaveBeenLastCalledWith(P.readPlace, { params: { placeId: '3' } }, { signal });
    await makeStackCover(STACK, ITEM);
    expect(call).toHaveBeenLastCalledWith(P.makeStackCover, {
      params: { stackId: STACK },
      body: { itemId: ITEM },
    });
  });
});
