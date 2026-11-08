import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { DriveAlbum, DriveItem, Memory, TimelineBucket } from '@smarteverything/domain';
import type { MediaTile } from '../../../components/media-grid/tiles';
import { PhotosWidget } from './photos-widget';
import {
  PHOTOS_WIDGET_COPY,
  SINGLE_HEIGHT,
  STRIP_GAP,
  STRIP_HEIGHT,
  TILE_MIN,
  stripLayout,
  validPhotosWidget,
  type PhotosChatWidget,
} from './photos-widget-model';

interface Query<T> {
  readonly data: T | undefined;
  readonly error: Error | null;
  readonly refetch: () => Promise<unknown>;
}

const state = vi.hoisted(
  (): {
    album: DriveAlbum | null;
    albumItems: Query<{ readonly pages: readonly { readonly items: readonly DriveItem[] }[] }>;
    item: Query<DriveItem>;
    memories: Query<readonly Memory[]>;
    buckets: Query<readonly TimelineBucket[]>;
    month: Query<{ readonly pages: readonly never[] }>;
    sync: string;
  } => {
    const idle = { data: undefined, error: null, refetch: (): Promise<void> => Promise.resolve() };
    return {
      album: null,
      albumItems: idle,
      item: idle,
      memories: idle,
      buckets: idle,
      month: idle,
      sync: 'live',
    };
  },
);

function resolved(): Promise<void> {
  return Promise.resolve();
}

vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));
vi.mock('../../nas/data/queries', () => ({ useDriveItem: (): typeof state.item => state.item }));
vi.mock('../../nas/data/links', () => ({
  driveLinks: { resolve: (): Promise<null> => Promise.resolve(null) },
}));
vi.mock('../../photos/albums/album-data', () => ({
  usePhotoAlbum: (): typeof state.album => state.album,
  usePhotoAlbumItems: (): typeof state.albumItems => state.albumItems,
  loadedItems: (
    pages: typeof state.albumItems,
  ): { readonly items: readonly DriveItem[]; readonly complete: boolean } | null =>
    pages.data === undefined
      ? null
      : { items: pages.data.pages.flatMap((page) => page.items), complete: true },
}));
vi.mock('../../photos/data', () => ({
  PHOTO_ALL: { filter: 'all', placeId: null },
  usePhotoBuckets: (): typeof state.buckets => state.buckets,
  usePhotoMemories: (): typeof state.memories => state.memories,
  usePhotoMemoryItems: (): typeof state.albumItems => state.albumItems,
  usePhotoMonth: (): typeof state.month => state.month,
}));
vi.mock('../../photos/memories', () => ({ MemoryPlayer: (): null => null }));
vi.mock('../../../store/selectors', () => ({
  useSyncStatus: (): { readonly status: string } => ({ status: state.sync }),
}));
vi.mock('../../../design/size-class', () => ({ useAreaWidth: (): number => 412 }));
vi.mock('../../../components/media-grid/tile', () => ({ MediaTileView: (): null => null }));
vi.mock('../../../components/button', () => ({
  Button: ({ label }: { readonly label: string }): ReactNode => createElement('button', {}, label),
}));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/skeleton', () => ({
  Skeleton: (): ReactNode => createElement('i', { 'data-skeleton': 'block' }),
}));

const ALBUM_ID = '0b9f8a4e-0000-4000-8000-0000000000a1';
const ITEM_ID = '0b9f8a4e-0000-4000-8000-0000000000b1';

function tile(aspect: number): MediaTile {
  return {
    id: ITEM_ID,
    rev: 1,
    aspect,
    takenAt: 0,
    offsetMin: 0,
    durationMs: null,
    thumbhash: null,
    flags: 0,
    local: false,
  };
}

function tiles(total: number): readonly MediaTile[] {
  return Array.from({ length: total }, () => tile(1.5));
}

function render(widget: PhotosChatWidget): string {
  return renderToStaticMarkup(createElement(PhotosWidget, { widget }));
}

function album(itemCount: number): DriveAlbum {
  return {
    id: ALBUM_ID,
    title: 'Lisbon 2026',
    surface: 'photos',
    scope: 'home',
    ownerProfileId: null,
    coverItemId: null,
    itemCount,
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-01T10:00:00Z',
    kind: 'manual',
  };
}

describe('chat photos strip layout', () => {
  it('fits as many tiles as the width holds and keeps the last cell for the rest count', () => {
    const width = 4 * TILE_MIN + 3 * STRIP_GAP;
    const layout = stripLayout(width, tiles(40), 40);
    expect(layout).toMatchObject({ rest: 37, height: STRIP_HEIGHT });
    expect(layout.cells).toHaveLength(3);
    const drawn = layout.cells.reduce((sum, cell) => sum + cell.width, layout.restWidth);
    expect(drawn + STRIP_GAP * 3).toBeCloseTo(width);
  });

  it('gives each photo a width in proportion to its shape', () => {
    const layout = stripLayout(600, [tile(1.5), tile(0.75), tile(1)], 3);
    const [wide, tall, square] = layout.cells.map((cell) => cell.width);
    expect(wide).toBeCloseTo(2 * (tall ?? 0));
    expect(square).toBeCloseTo((tall ?? 0) / 0.75);
    expect(layout.restWidth).toBe(0);
  });

  it('shows every tile without a rest count when all of them fit', () => {
    expect(stripLayout(600, tiles(3), 3)).toMatchObject({ rest: 0, restWidth: 0 });
    expect(stripLayout(600, tiles(3), 3).cells).toHaveLength(3);
  });

  it('counts photos not loaded yet in the rest', () => {
    const layout = stripLayout(600, tiles(2), 9);
    expect(layout).toMatchObject({ rest: 7 });
    expect(layout.cells).toHaveLength(2);
    expect(layout.restWidth).toBeGreaterThan(0);
  });

  it('draws one photo at its own shape, never wider than the card', () => {
    const single = stripLayout(500, [tile(0.75)], 1);
    expect(single.height).toBe(SINGLE_HEIGHT);
    expect(single.cells.map((cell) => cell.width)).toEqual([SINGLE_HEIGHT * 0.75]);
    expect(stripLayout(300, [tile(2)], 1).cells[0]?.width).toBe(300);
  });

  it('draws nothing before the card is measured', () => {
    expect(stripLayout(0, tiles(4), 4).cells).toHaveLength(0);
  });
});

describe('chat photos widget', () => {
  it('accepts only file ids for items and months as YYYY-MM', () => {
    expect(validPhotosWidget({ kind: 'photos', view: 'item', id: ITEM_ID })).toBe(true);
    expect(validPhotosWidget({ kind: 'photos', view: 'item', id: 'beach' })).toBe(false);
    expect(validPhotosWidget({ kind: 'photos', view: 'month', id: '2026-11' })).toBe(true);
    expect(validPhotosWidget({ kind: 'photos', view: 'month', id: '2026-13' })).toBe(false);
  });

  it('shows the album title with its count and Open album', () => {
    state.album = album(204);
    state.albumItems = {
      data: { pages: [{ items: [] }] },
      error: null,
      refetch: resolved,
    };
    const markup = render({ kind: 'photos', view: 'album', id: ALBUM_ID });
    expect(markup).toContain('Lisbon 2026');
    expect(markup).toContain('>204<');
    expect(markup).toContain(`<button>${PHOTOS_WIDGET_COPY.openAlbum}</button>`);
  });

  it('heads a month with its name, count and Open in Photos', () => {
    state.buckets = { data: [{ month: '2026-11', count: 1234 }], error: null, refetch: resolved };
    state.month = { data: { pages: [] }, error: null, refetch: resolved };
    const markup = render({ kind: 'photos', view: 'month', id: '2026-11' });
    expect(markup).toContain('November 2026');
    expect(markup).toContain('>1,234<');
    expect(markup).toContain(`<button>${PHOTOS_WIDGET_COPY.openPhotos}</button>`);
  });

  it('says when the month has no photos', () => {
    state.buckets = { data: [{ month: '2026-10', count: 3 }], error: null, refetch: resolved };
    const markup = render({ kind: 'photos', view: 'month', id: '2026-11' });
    expect(markup).toContain(PHOTOS_WIDGET_COPY.noMonth);
  });

  it('says why when the album is gone', () => {
    state.album = null;
    const markup = render({ kind: 'photos', view: 'album', id: ALBUM_ID });
    expect(markup).toContain(PHOTOS_WIDGET_COPY.gone);
    expect(markup).not.toContain(PHOTOS_WIDGET_COPY.openAlbum);
  });

  it('shows a placeholder while loading and the hub offline note when offline', () => {
    state.item = { data: undefined, error: null, refetch: resolved };
    expect(render({ kind: 'photos', view: 'item', id: ITEM_ID })).toContain('data-skeleton');
    state.sync = 'interrupted';
    expect(render({ kind: 'photos', view: 'item', id: ITEM_ID })).toContain(
      PHOTOS_WIDGET_COPY.waiting,
    );
    state.sync = 'live';
  });

  it('shows the failure with Try again', () => {
    state.buckets = {
      data: undefined,
      error: new Error('boom'),
      refetch: resolved,
    };
    const markup = render({ kind: 'photos', view: 'month', id: '2026-11' });
    expect(markup).toContain(PHOTOS_WIDGET_COPY.failed);
    expect(markup).toContain(`<button>${PHOTOS_WIDGET_COPY.retry}</button>`);
  });

  it('refuses an item id that is not a file id without loading anything', () => {
    const markup = render({ kind: 'photos', view: 'item', id: 'beach' });
    expect(markup).toContain(PHOTOS_WIDGET_COPY.gone);
  });
});
