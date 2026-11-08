import { describe, expect, it, vi } from 'vitest';
import { albumRow } from '../../nas/data/fixtures';
import { ViewerScreen, viewerParamsOf, viewerTargetOf } from './index';
import { albumMenuItems, moreMenuItems } from './menus';
import { photoLookOf } from './photo';
import { stackCaption } from './stack-strip';
import { LOCATION_NOTE } from './info-rows';

const ITEM = '00000000-0000-4000-8000-0000000000a1';
const STACK = '00000000-0000-4000-8000-0000000000c1';

describe('photo viewer', () => {
  it('loads the screen the route shows', () => {
    expect(typeof ViewerScreen).toBe('function');
  });

  it('reads the item and its timeline scope from the route and writes them back', () => {
    expect(viewerTargetOf({ itemId: ITEM })).toEqual({
      itemId: ITEM,
      scope: { filter: 'all', placeId: null },
    });
    const target = viewerTargetOf({ itemId: ITEM, filter: 'videos', placeId: '7' });
    expect(target?.scope).toEqual({ filter: 'videos', placeId: 7 });
    expect(viewerParamsOf({ filter: 'videos', placeId: 7 })).toEqual({
      filter: 'videos',
      placeId: '7',
    });
    expect(viewerParamsOf({ filter: 'all', placeId: null })).toEqual({});
  });

  it('refuses a link that is not a photo id or carries unknown parameters', () => {
    expect(viewerTargetOf({ itemId: 'nope' })).toBeNull();
    expect(viewerTargetOf({ itemId: ITEM, sort: 'name' })).toBeNull();
    expect(viewerTargetOf({ itemId: ITEM, filter: 'raw' })).toBeNull();
  });

  it('shows the picture once the preview is ready and the RAW note when it cannot be made', () => {
    expect(photoLookOf(null)).toBe('image');
    const states = { poster: { state: 'none' }, playable: { state: 'none' } } as const;
    const media = {
      itemId: ITEM,
      timeSource: null,
      tzOffsetMin: null,
      motionClipId: null,
      liveId: null,
      burstId: null,
      stackId: null,
      placeId: null,
      ...states,
    };
    expect(photoLookOf({ ...media, preview: { state: 'ready' } })).toBe('image');
    expect(photoLookOf({ ...media, preview: { state: 'processing' } })).toBe('processing');
    expect(photoLookOf({ ...media, preview: { state: 'unsupported', reason: 'raw' } })).toBe(
      'no-preview',
    );
    expect(LOCATION_NOTE).toBe('Location is removed from links shared outside the home');
  });

  it('offers the albums to add to and keeps Move to trash last', () => {
    const add = vi.fn();
    const items = albumMenuItems([albumRow(ITEM, 'photos')], add);
    expect(items.map((item) => item.label)).toEqual(['Trip']);
    items[0]?.onPress();
    expect(add).toHaveBeenCalledWith(ITEM, 'Trip');
    expect(albumMenuItems([], add)[0]?.disabled).toBe(true);
    const more = moreMenuItems({ onDownload: vi.fn(), onShowInDrive: vi.fn(), onTrash: vi.fn() });
    expect(more.at(-1)).toMatchObject({ label: 'Move to trash', destructive: true });
  });

  it('names the stack', () => {
    expect(
      stackCaption({ id: STACK, kind: 'raw_jpeg', coverItemId: ITEM, itemIds: [ITEM, STACK] }),
    ).toBe('RAW and JPEG · 2 shots');
    expect(
      stackCaption({ id: STACK, kind: 'burst', coverItemId: ITEM, itemIds: [ITEM, STACK, ITEM] }),
    ).toBe('Stack · 3 shots');
  });
});
