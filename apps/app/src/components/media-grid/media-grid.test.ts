import { act, createElement, Fragment, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaGridRow } from './justify';
import type { MediaTile } from './tiles';

interface ListProps {
  readonly data: readonly MediaGridRow[];
  readonly stickyHeaderIndices: readonly number[];
  readonly getItemType: (row: MediaGridRow) => string;
  readonly renderItem: (info: { readonly item: MediaGridRow; readonly index: number }) => ReactNode;
  readonly viewabilityConfigCallbackPairs: readonly {
    readonly onViewableItemsChanged: (change: {
      readonly viewableItems: readonly {
        readonly key: string;
        readonly index: number;
        readonly isViewable: boolean;
      }[];
    }) => void;
  }[];
}

interface ImageProps {
  readonly source: { readonly uri: string; readonly cacheKey: string } | null;
  readonly placeholder?: unknown;
  readonly recyclingKey: string;
  readonly cachePolicy: string;
  readonly transition?: number;
}

interface PressProps {
  readonly label?: string;
  readonly role?: string;
  readonly checked?: boolean | 'mixed';
  readonly onPress?: () => void;
  readonly children?: ReactNode;
}

const lists = vi.hoisted((): ListProps[] => []);
const presses = vi.hoisted((): PressProps[] => []);
const images = vi.hoisted((): ImageProps[] => []);

function passThrough({ children }: { readonly children?: ReactNode }): ReactNode {
  return children;
}

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  View: ({ children }: { readonly children?: ReactNode }): ReactNode => children,
}));
vi.mock('@shopify/flash-list', () => ({
  FlashList: (props: ListProps): ReactNode => {
    lists.push(props);
    return props.data.map((item, index) =>
      createElement(Fragment, { key: item.key }, props.renderItem({ item, index })),
    );
  },
}));
vi.mock('expo-image', () => ({
  Image: (props: ImageProps): null => {
    images.push(props);
    return null;
  },
}));
vi.mock('../use-measured-width', () => ({
  useMeasuredWidth: (): { width: number; onLayout: () => void } => ({
    width: 400,
    onLayout: (): void => undefined,
  }),
}));
vi.mock('../virtual-list', () => ({ DRAW_DISTANCE: 1000 }));
vi.mock('../../perf/list-probe', () => ({
  useListProbe: (): { cell: undefined } => ({ cell: undefined }),
}));
vi.mock('../../design/platform', () => ({ useIdiom: (): string => 'pointer' }));
vi.mock('../../design/motion', () => ({
  useMotion: (): { reduced: boolean } => ({ reduced: false }),
}));
vi.mock('../../design/theme-scope', () => ({ ThemeScope: passThrough }));
vi.mock('../interactive', () => ({
  Interactive: (props: PressProps): ReactNode => {
    presses.push(props);
    return props.children;
  },
}));
vi.mock('../icon', () => ({ Icon: (): null => null }));
vi.mock('../text', () => ({ Text: (): null => null }));

const { MediaGrid } = await import('./media-grid');
const { fixtureTiles } = await import('./fixtures');
const { tileState } = await import('./marks');
const { tileKey } = await import('./tile');
const { photoFlags } = await import('@smarteverything/domain');

let root: Root | null = null;
const urlOf = (tile: MediaTile): string => `https://hub.test/t/${tile.id}?sig=1`;
const peekThumb = vi.fn((tile: MediaTile): string | null => {
  void tile;
  return null;
});
const resolveThumb = vi.fn((tile: MediaTile): Promise<string> => Promise.resolve(urlOf(tile)));
const thumbs = { peek: peekThumb, resolve: resolveThumb };

function render(
  tiles: readonly MediaTile[],
  onPrefetchTiles?: (tiles: readonly MediaTile[]) => void,
  step: 'months' | 'days' | 'comfortable' = 'days',
): void {
  act(() => {
    root?.render(
      createElement(MediaGrid, {
        tiles,
        step,
        today: '2026-11-07',
        thumbs,
        ...(onPrefetchTiles === undefined ? {} : { onPrefetchTiles }),
        onOpen: (): void => undefined,
        decor: {
          placeOf: (): string => 'Lisbon',
        },
      }),
    );
  });
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function lastList(): ListProps {
  const list = lists.at(-1);
  if (list === undefined) throw new Error('the grid rendered no list');
  return list;
}

beforeEach(() => {
  lists.length = 0;
  presses.length = 0;
  images.length = 0;
  resolveThumb.mockClear();
  peekThumb.mockReset();
  peekThumb.mockReturnValue(null);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  vi.unstubAllGlobals();
});

describe('the media grid', () => {
  it('renders sticky day heads over justified tile rows at the Comfortable step', async () => {
    render(fixtureTiles(30, 10), undefined, 'comfortable');
    await settle();
    const list = lastList();
    expect(list.stickyHeaderIndices.map((index) => list.data[index]?.kind)).toEqual([
      'head',
      'head',
      'head',
    ]);
    expect(new Set(list.data.map((row) => list.getItemType(row)))).toEqual(
      new Set(['head', 'tiles']),
    );
  });

  it('shows the plain tile until the thumbnail arrives, then shows it sharp at once', async () => {
    const tiles = fixtureTiles(1);
    render(tiles);
    const first = images.at(-1);
    expect(first?.source).toBeNull();
    expect(first?.placeholder).toBeUndefined();
    await settle();
    const loaded = images.at(-1);
    const id = tiles[0]?.id ?? '';
    expect(loaded?.source).toEqual({ uri: `https://hub.test/t/${id}?sig=1`, cacheKey: `${id}:1` });
    expect(loaded?.recyclingKey).toBe(`${id}:1`);
    expect(loaded?.cachePolicy).toBe('memory-disk');
    expect(loaded?.transition).toBeUndefined();
    expect(loaded?.placeholder).toBeUndefined();
  });

  it('paints a thumbnail whose link is already known on the first frame', () => {
    const tiles = fixtureTiles(1);
    peekThumb.mockImplementation(urlOf);
    render(tiles);
    const id = tiles[0]?.id ?? '';
    expect(images[0]?.source).toEqual({
      uri: `https://hub.test/t/${id}?sig=1`,
      cacheKey: `${id}:1`,
    });
  });

  it('never loads a thumbnail for an item that is still processing', async () => {
    const [ready] = fixtureTiles(1);
    if (ready === undefined) throw new Error('the fixture has a tile');
    render([{ ...ready, flags: photoFlags(['processing']) }]);
    await settle();
    expect(resolveThumb).not.toHaveBeenCalled();
    expect(peekThumb).not.toHaveBeenCalled();
    expect(images.at(-1)?.source).toBeNull();
  });

  it('reports the tiles past the drawn rows for opt-in prefetch', async () => {
    const upcoming = vi.fn<(tiles: readonly MediaTile[]) => void>();
    const tiles = fixtureTiles(50, 50);
    render(tiles, upcoming);
    await settle();
    const list = lastList();
    const [shown, next] = list.data.filter((row) => row.kind === 'tiles');
    if (shown === undefined || next === undefined) throw new Error('two rows are required');
    act(() => {
      list.viewabilityConfigCallbackPairs[0]?.onViewableItemsChanged({
        viewableItems: [{ key: shown.key, index: 1, isViewable: true }],
      });
    });
    const selected = upcoming.mock.calls.at(-1)?.[0] ?? [];
    expect(selected.length).toBeGreaterThan(0);
    const drawn = new Set([...shown.tiles, ...next.tiles].map(({ tile }) => tile.id));
    expect(selected.some((tile) => drawn.has(tile.id))).toBe(false);
    const count = upcoming.mock.calls.length;
    act(() => {
      list.viewabilityConfigCallbackPairs[0]?.onViewableItemsChanged({
        viewableItems: [{ key: shown.key, index: 1, isViewable: true }],
      });
    });
    expect(upcoming).toHaveBeenCalledTimes(count);
  });

  it('loads every drawn row and keeps its thumbnails when it leaves the viewport', async () => {
    const tiles = fixtureTiles(20, 20);
    render(tiles);
    await settle();
    const list = lastList();
    const rows = list.data.filter((row) => row.kind === 'tiles');
    const [shown, hidden] = rows;
    if (shown === undefined || hidden === undefined) throw new Error('the day spans two rows');
    const hiddenIds = new Set(hidden.tiles.map((placed) => placed.tile.id));
    expect(resolveThumb.mock.calls.some(([tile]) => hiddenIds.has(tile.id))).toBe(true);
    resolveThumb.mockClear();
    images.length = 0;
    act(() => {
      list.viewabilityConfigCallbackPairs[0]?.onViewableItemsChanged({
        viewableItems: [{ key: shown.key, index: 1, isViewable: true }],
      });
    });
    render([...tiles]);
    await settle();
    expect(resolveThumb).not.toHaveBeenCalled();
    expect(images.length).toBeGreaterThan(0);
    const ready = new Set(tiles.filter((tile) => tileState(tile) === 'ready').map(tileKey));
    const shownReady = images.filter((image) => ready.has(image.recyclingKey));
    expect(shownReady.length).toBeGreaterThan(0);
    expect(shownReady.every((image) => image.source !== null)).toBe(true);
  });

  it('draws the badge each tile asks for and nothing for the others', async () => {
    const tiles = fixtureTiles(4);
    const badged = new Set([tiles[0]?.id, tiles[2]?.id]);
    const drawn: string[] = [];
    const Badge = ({ id }: { readonly id: string }): null => {
      drawn.push(id);
      return null;
    };
    act(() => {
      root?.render(
        createElement(MediaGrid, {
          tiles,
          step: 'days',
          today: '2026-11-07',
          thumbs,
          onOpen: (): void => undefined,
          badgeOf: (tile: MediaTile): ReactElement | null =>
            badged.has(tile.id) ? createElement(Badge, { id: tile.id }) : null,
        }),
      );
    });
    await settle();
    expect(new Set(drawn)).toEqual(badged);
  });

  it('packs short days below the Comfortable step and pins no heading over them', async () => {
    render(fixtureTiles(6, 1), undefined, 'months');
    await settle();
    const list = lastList();
    expect(list.stickyHeaderIndices).toEqual([]);
    expect(list.data.some((row) => row.kind === 'tiles' && row.days !== undefined)).toBe(true);
  });

  it('marks picked tiles and offers each day as a whole while selecting', async () => {
    const tiles = fixtureTiles(4);
    const picked = tiles[1]?.id ?? '';
    const onDay = vi.fn();
    act(() => {
      root?.render(
        createElement(MediaGrid, {
          tiles,
          step: 'comfortable',
          today: '2026-11-07',
          thumbs,
          onOpen: (): void => undefined,
          selection: { active: true, ids: new Set([picked]), anchor: picked },
          onDay,
        }),
      );
    });
    const checks = presses.filter((press) => press.role === 'checkbox');
    const tileChecks = checks.filter((press) => press.label?.startsWith('Select all') !== true);
    expect(tileChecks.map((press) => press.checked)).toEqual([false, true, false, false]);
    const day = checks.find((press) => press.label?.startsWith('Select all') === true);
    expect(day?.checked).toBe('mixed');
    act(() => {
      day?.onPress?.();
    });
    expect(onDay).toHaveBeenCalledWith(tiles.map((tile) => tile.id));
    await settle();
  });

  it('shows no checks outside selection mode', async () => {
    render(fixtureTiles(4));
    await settle();
    expect(presses.filter((press) => press.role === 'checkbox')).toEqual([]);
  });
});
