import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DRIVE_ALBUM, DRIVE_ITEM, type DriveAlbum, type DriveItem } from '@smarteverything/domain';

interface Pages {
  data: { pages: { items: DriveItem[]; next: string | null }[] } | undefined;
  isPending: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
}

interface Seen {
  pages: Pages | null;
  kinds: (readonly string[] | null)[];
  albums: DriveAlbum[];
  status: string;
  smart: string | null;
}

const seen = vi.hoisted((): Seen => ({
  pages: null,
  kinds: [],
  albums: [],
  status: 'live',
  smart: null,
}));

vi.mock('../../nas/data', () => ({
  useDriveSearch: (query: { kinds: readonly string[] | null }, enabled: boolean): unknown => {
    if (enabled) seen.kinds.push(query.kinds);
    return seen.pages;
  },
  useDriveRoots: (): readonly unknown[] => [{ id: ROOT_ID, label: 'Media disk' }],
  useDriveAlbums: (surface: string): readonly DriveAlbum[] =>
    seen.albums.filter((album) => album.surface === surface),
  flattenPages: (data: { pages: { items: DriveItem[] }[] } | undefined): readonly DriveItem[] =>
    data?.pages.flatMap((page) => page.items) ?? [],
}));
vi.mock('../../../store/selectors', () => ({
  useSyncStatus: (): unknown => ({ status: seen.status }),
}));
vi.mock('../../../components/use-section-param', () => ({
  useSectionParam: (): readonly unknown[] => [
    seen.smart,
    (): undefined => undefined,
    (): undefined => undefined,
  ],
}));
vi.mock('../../../design/size-class', async (original) => ({
  ...(await original<object>()),
  useAreaWidth: (): number => 1336,
}));
vi.mock('../components/drive-frame', () => ({
  DriveFrame: ({
    children,
    banner,
    subtitle,
    primary,
  }: {
    readonly children: ReactNode;
    readonly banner?: ReactNode;
    readonly subtitle?: string;
    readonly primary?: { readonly label: string };
  }): ReactNode => createElement('main', {}, primary?.label, subtitle, banner, children),
}));
vi.mock('../folder/folder-footer', () => ({ runChange: (): void => undefined }));
vi.mock('./smart-folder-screen', () => ({
  SmartFolderScreen: ({ albumId }: { readonly albumId: string }): ReactNode =>
    createElement('article', {}, `smart ${albumId}`),
}));
vi.mock('./save-smart-folder', () => ({
  useSaveSmartFolder: (): unknown => ({
    open: (): void => undefined,
    rename: (): void => undefined,
    host: null,
  }),
}));
vi.mock('./smart-folders', () => ({
  SmartFolders: ({ folders }: { readonly folders: readonly DriveAlbum[] }): ReactNode =>
    createElement(
      'ul',
      {},
      folders.map((folder) => createElement('li', { key: folder.id }, folder.title)),
    ),
}));
vi.mock('./starred-row', () => ({
  StarredRow: ({ item, where }: { readonly item: DriveItem; readonly where: string }): ReactNode =>
    createElement('li', {}, `${item.name} in ${where}`),
}));
vi.mock('./starred-states', () => ({
  StarredEmpty: ({ live }: { readonly live: boolean }): ReactNode =>
    createElement('p', {}, live ? 'nothing starred' : 'offline'),
  StarredFooter: (): null => null,
  StarredStaleBanner: (): ReactNode => createElement('aside', {}, 'stale'),
  loadMoreStarred: (): void => undefined,
}));
vi.mock('../../../components/filter-chip', () => ({
  FilterChip: ({ value, count }: { readonly value: string; readonly count?: number }): ReactNode =>
    createElement('button', {}, count === undefined ? value : `${value} ${String(count)}`),
}));
vi.mock('../../../components/virtual-list', () => ({
  VirtualList: <T>(props: {
    readonly sections: readonly { key: string; data: readonly T[] }[];
    readonly renderItem: (item: T) => ReactElement;
    readonly header: ReactElement;
    readonly empty: ReactElement;
  }): ReactNode =>
    createElement(
      'section',
      {},
      props.header,
      props.sections.length === 0
        ? props.empty
        : props.sections.map((section) =>
            createElement('div', { key: section.key }, section.data.map(props.renderItem)),
          ),
    ),
}));

const ROOT_ID = 'a1b2c3d4-0000-4000-8000-000000000001';

const DOC = DRIVE_ITEM.parse({
  id: 'a1b2c3d4-0000-4000-8000-000000000010',
  rootId: ROOT_ID,
  parentId: null,
  relPath: 'Projects/Budget 2027.xlsx',
  name: 'Budget 2027.xlsx',
  modifiedAt: '2026-11-07T10:00:00.000Z',
  addedAt: '2026-11-07T10:00:00.000Z',
  openedAt: null,
  starred: true,
  rev: 1,
  etag: 'e',
  outside: false,
  addedByProfileId: null,
  remoteId: null,
  remoteRev: null,
  mime: 'application/vnd.ms-excel',
  bytes: 88_000,
  sha256: null,
  integrity: 'unknown',
  thumb: { state: 'none' },
  kind: 'document',
});

function smart(title: string, surface: 'drive' | 'photos'): DriveAlbum {
  return DRIVE_ALBUM.parse({
    id:
      surface === 'drive'
        ? 'a1b2c3d4-0000-4000-8000-000000000020'
        : 'a1b2c3d4-0000-4000-8000-000000000021',
    title,
    surface,
    scope: 'home',
    ownerProfileId: null,
    coverItemId: null,
    itemCount: 38,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    kind: 'smart',
    rule: { match: 'all', rules: [{ kind: 'item_kind', itemKinds: ['video'] }] },
  });
}

function pagesOf(items: DriveItem[], next: string | null): Pages {
  return {
    data: { pages: [{ items, next }] },
    isPending: false,
    isError: false,
    hasNextPage: next !== null,
    isFetchingNextPage: false,
  };
}

async function render(): Promise<string> {
  const { StarredScreen } = await import('./starred-screen');
  return renderToStaticMarkup(createElement(StarredScreen));
}

describe('StarredScreen', () => {
  it('shows the Drive smart folders above the starred files with counts and the star note', async () => {
    seen.status = 'live';
    seen.smart = null;
    seen.kinds = [];
    seen.albums = [smart('Big videos', 'drive'), smart('Holiday photos', 'photos')];
    seen.pages = pagesOf([DOC], null);
    const html = await render();
    expect(seen.kinds).toEqual([null]);
    expect(html).toContain('New smart folder');
    expect(html).toContain('1 starred · 1 smart folder');
    expect(html).toContain('A star here and a Photos favourite are one mark');
    expect(html.indexOf('Files 1')).toBeLessThan(html.indexOf('Folders 0'));
    expect(html).toContain('>Changed<');
    expect(html).toContain('Big videos');
    expect(html).not.toContain('Holiday photos');
    expect(html).toContain('All 1');
    expect(html).toContain('Files 1');
    expect(html).toContain('Budget 2027.xlsx in Media disk › Projects');
  });

  it('leaves the counts out while more starred files are still to load', async () => {
    seen.pages = pagesOf([DOC], 'next');
    const html = await render();
    expect(html).toContain('>All<');
    expect(html).not.toContain('1 starred');
  });

  it('shows the empty state when nothing is starred', async () => {
    seen.albums = [];
    seen.pages = pagesOf([], null);
    const html = await render();
    expect(html).toContain('nothing starred');
    expect(html).not.toContain('stale');
  });

  it('keeps the loaded stars under an offline banner when the hub drops', async () => {
    seen.status = 'offline';
    seen.pages = pagesOf([DOC], null);
    const html = await render();
    expect(html).toContain('stale');
    expect(html).toContain('Budget 2027.xlsx');
  });

  it('opens one smart folder as its own list when the address names it', async () => {
    seen.status = 'live';
    seen.smart = 'a1b2c3d4-0000-4000-8000-000000000020';
    const html = await render();
    expect(html).toContain('smart a1b2c3d4-0000-4000-8000-000000000020');
    expect(html).not.toContain('New smart folder');
  });
});
