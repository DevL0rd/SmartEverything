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
    await readLibraryBuckets({ filter: 'videos' });
    expect(call).toHaveBeenCalledWith(P.readLibraryBuckets, { query: { filter: 'videos' } });
    await readLibraryBuckets({
      filter: 'all',
      placeId: 7,
      countryCode: 'PT',
      camera: 'Sony A7 IV',
      albumId: ITEM,
      text: 'beach',
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(call).toHaveBeenLastCalledWith(P.readLibraryBuckets, {
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
    });
  });

  it('sends a month with the cursor only when there is one', async () => {
    await readLibraryPage('2026-10', { filter: 'all' }, null);
    expect(call).toHaveBeenLastCalledWith(P.readLibraryPage, {
      params: { month: '2026-10' },
      query: { filter: 'all' },
    });
    await readLibraryPage('2026-10', { filter: 'favourites', text: 'sun' }, 'c1');
    expect(call).toHaveBeenLastCalledWith(P.readLibraryPage, {
      params: { month: '2026-10' },
      query: { filter: 'favourites', text: 'sun', cursor: 'c1' },
    });
  });

  it('sends source chips, search and cursors only when chosen', async () => {
    await listPhotoSource('cameras', null, NO_SOURCE_SEARCH, null);
    expect(call).toHaveBeenLastCalledWith(P.listPhotoSource, {
      params: { source: 'cameras' },
      query: {},
    });
    await listPhotoSource('ai', 'chip', { text: 'cat', from: '2026-01-01', to: null }, 'c2');
    expect(call).toHaveBeenLastCalledWith(P.listPhotoSource, {
      params: { source: 'ai' },
      query: { chipId: 'chip', text: 'cat', from: '2026-01-01', cursor: 'c2' },
    });
  });

  it('sends ids as path parameters and bodies', async () => {
    await readPlace(3);
    expect(call).toHaveBeenLastCalledWith(P.readPlace, { params: { placeId: '3' } });
    await makeStackCover(STACK, ITEM);
    expect(call).toHaveBeenLastCalledWith(P.makeStackCover, {
      params: { stackId: STACK },
      body: { itemId: ITEM },
    });
  });
});
