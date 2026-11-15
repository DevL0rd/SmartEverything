import { describe, expect, it, vi } from 'vitest';
import { albumRow } from '../../drive/testing';
import { ViewerScreen, viewerParamsOf, viewerTargetOf } from './index';
import { viewerFromParams } from './params';
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

  it('reads the item and its library scope from the route and writes them back', () => {
    expect(viewerTargetOf({ itemId: ITEM })).toEqual({
      itemId: ITEM,
      scope: { filter: 'all' },
      from: 'library',
    });
    expect(viewerTargetOf({ itemId: ITEM, origin: 'archive' })?.from).toBe('archive');
    expect(viewerFromParams('archive')).toEqual({ origin: 'archive' });
    expect(viewerFromParams('library')).toEqual({});
    const target = viewerTargetOf({ itemId: ITEM, filter: 'videos', placeId: '7' });
    expect(target?.scope).toEqual({ filter: 'videos', placeId: 7 });
    expect(viewerParamsOf({ filter: 'videos', placeId: 7 })).toEqual({
      filter: 'videos',
      placeId: '7',
    });
    expect(viewerParamsOf({ filter: 'all' })).toEqual({});
  });

  it('refuses a link that is not a photo id or carries unknown parameters', () => {
    expect(viewerTargetOf({ itemId: 'nope' })).toBeNull();
    expect(viewerTargetOf({ itemId: ITEM, sort: 'name' })).toBeNull();
    expect(viewerTargetOf({ itemId: ITEM, filter: 'raw' })).toBeNull();
    expect(viewerTargetOf({ itemId: ITEM, origin: 'trash' })).toBeNull();
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
    const archive = { label: 'Archive', onPress: vi.fn() };
    const more = moreMenuItems({
      onSave: vi.fn(),
      onShowInDrive: vi.fn(),
      onTrash: vi.fn(),
      onRevert: null,
      organise: [archive],
    });
    expect(more.at(-2)).toBe(archive);
    expect(more.at(-1)).toMatchObject({ label: 'Move to trash', destructive: true });
    expect(more.some((entry) => entry.label === 'Revert to original')).toBe(false);
    const revert = vi.fn();
    const edited = moreMenuItems({
      onSave: vi.fn(),
      onShowInDrive: vi.fn(),
      onTrash: vi.fn(),
      onRevert: revert,
      organise: [archive],
    });
    expect(edited.map((entry) => entry.label)).toEqual([
      'Save to this device',
      'Show in Drive',
      'Revert to original',
      'Archive',
      'Move to trash',
    ]);
    edited[2]?.onPress();
    expect(revert).toHaveBeenCalledOnce();
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
