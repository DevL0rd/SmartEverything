import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PHOTOS_ENDPOINTS as P } from '@smarteverything/domain';

const call = vi.hoisted(() => vi.fn());

vi.mock('../../../api/transport', () => ({ api: (): unknown => ({ call }) }));

import {
  listPhotoSource,
  makeStackCover,
  readPlace,
  readTimelineBuckets,
  readTimelinePage,
} from '../../../api/photos';

const ITEM = '00000000-0000-4000-8000-0000000000a1';
const STACK = '00000000-0000-4000-8000-0000000000b1';

describe('photos api', () => {
  beforeEach(() => {
    call.mockReset();
    call.mockResolvedValue(undefined);
  });

  it('sends the timeline scope without an absent place', async () => {
    await readTimelineBuckets({ filter: 'videos', placeId: null });
    expect(call).toHaveBeenCalledWith(P.readTimelineBuckets, { query: { filter: 'videos' } });
    await readTimelineBuckets({ filter: 'all', placeId: 7 });
    expect(call).toHaveBeenLastCalledWith(P.readTimelineBuckets, {
      query: { filter: 'all', placeId: 7 },
    });
  });

  it('sends a month with the cursor only when there is one', async () => {
    await readTimelinePage('2026-10', { filter: 'all', placeId: null }, null);
    expect(call).toHaveBeenLastCalledWith(P.readTimelinePage, {
      params: { month: '2026-10' },
      query: { filter: 'all' },
    });
    await readTimelinePage('2026-10', { filter: 'all', placeId: null }, 'c1');
    expect(call).toHaveBeenLastCalledWith(P.readTimelinePage, {
      params: { month: '2026-10' },
      query: { filter: 'all', cursor: 'c1' },
    });
  });

  it('sends source chips and cursors only when chosen', async () => {
    await listPhotoSource('cameras', null, null);
    expect(call).toHaveBeenLastCalledWith(P.listPhotoSource, {
      params: { source: 'cameras' },
      query: {},
    });
    await listPhotoSource('ai', 'chip', 'c2');
    expect(call).toHaveBeenLastCalledWith(P.listPhotoSource, {
      params: { source: 'ai' },
      query: { chipId: 'chip', cursor: 'c2' },
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
