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
  readonly source: {
    readonly uri?: string;
    readonly cacheKey?: string;
    readonly thumbhash?: string;
  } | null;
  readonly placeholder: { readonly thumbhash: string } | null;
  readonly recyclingKey: string;
  readonly transition: number;
}

const lists = vi.hoisted((): ListProps[] => []);
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
vi.mock('../interactive', () => ({ Interactive: passThrough }));
vi.mock('../icon', () => ({ Icon: (): null => null }));
vi.mock('../text', () => ({ Text: (): null => null }));

const { MediaGrid } = await import('./media-grid');
const { fixtureTiles } = await import('./fixtures');
const { photoFlags } = await import('@smarteverything/domain');

let root: Root | null = null;
const resolveThumb = vi.fn((tile: MediaTile): Promise<string> =>
  Promise.resolve(`https://hub.test/t/${tile.id}?sig=1`),
);

function render(tiles: readonly MediaTile[]): void {
  act(() => {
    root?.render(
      createElement(MediaGrid, {
        tiles,
        step: 'days',
        today: '2026-11-07',
        resolveThumb,
        onOpen: (): void => undefined,
        decor: {
          placeOf: (): string => 'Lisbon',
          actionOf: (): ReactElement => createElement(Fragment),
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
  images.length = 0;
  resolveThumb.mockClear();
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
  it('renders sticky day heads over justified tile rows', () => {
    render(fixtureTiles(30, 10));
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

  it('paints the ThumbHash first, then fades the thumbnail in under a revision cache key', async () => {
    const tiles = fixtureTiles(1);
    render(tiles);
    const first = images.at(-1);
    expect(first?.source).toEqual({ thumbhash: tiles[0]?.thumbhash });
    expect(first?.placeholder).toEqual({ thumbhash: tiles[0]?.thumbhash });
    await settle();
    const loaded = images.at(-1);
    const id = tiles[0]?.id ?? '';
    expect(loaded?.source).toEqual({ uri: `https://hub.test/t/${id}?sig=1`, cacheKey: `${id}:1` });
    expect(loaded?.recyclingKey).toBe(`${id}:1`);
    expect(loaded?.transition).toBe(120);
  });

  it('never loads a thumbnail for an item that is still processing', async () => {
    const [ready] = fixtureTiles(1);
    if (ready === undefined) throw new Error('the fixture has a tile');
    render([{ ...ready, flags: photoFlags(['processing']) }]);
    await settle();
    expect(resolveThumb).not.toHaveBeenCalled();
    expect(images.at(-1)?.source).toEqual({ thumbhash: ready.thumbhash });
  });

  it('loads only the rows the list reports as visible', async () => {
    const tiles = fixtureTiles(20, 20);
    render(tiles);
    await settle();
    const list = lastList();
    const rows = list.data.filter((row) => row.kind === 'tiles');
    const [shown, hidden] = rows;
    if (shown === undefined || hidden === undefined) throw new Error('the day spans two rows');
    act(() => {
      list.viewabilityConfigCallbackPairs[0]?.onViewableItemsChanged({
        viewableItems: [{ key: shown.key, index: 1, isViewable: true }],
      });
    });
    resolveThumb.mockClear();
    render(tiles.map((tile) => ({ ...tile, rev: 2 })));
    await settle();
    const asked = new Set(resolveThumb.mock.calls.map(([tile]) => tile.id));
    const shownIds = shown.tiles.map((placed) => placed.tile.id);
    const hiddenIds = hidden.tiles.map((placed) => placed.tile.id);
    expect(shownIds.some((id) => asked.has(id))).toBe(true);
    expect(hiddenIds.some((id) => asked.has(id))).toBe(false);
  });
});
