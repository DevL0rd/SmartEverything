import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DuplicateGroup, DuplicateStats } from '@smarteverything/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ModelModule from './model';

interface PagesState {
  data:
    | {
        readonly pages: readonly {
          readonly items: readonly DuplicateGroup[];
          readonly next: string | null;
        }[];
      }
    | undefined;
  isError: boolean;
  error: Error | null;
  hasNextPage: boolean;
}

interface Seen {
  owner: boolean;
  live: boolean;
  width: number;
  pages: PagesState;
  stats: { data: DuplicateStats | undefined; isError: boolean; error: Error | null };
  hashing: boolean | undefined;
  hashedShare: number;
  page: string | null;
  banner: ReactNode;
  pagesCalled: number;
  keepAll: DuplicateStats | null;
}

const seen = vi.hoisted((): Seen => ({
  owner: true,
  live: true,
  width: 1360,
  pages: { data: undefined, isError: false, error: null, hasNextPage: false },
  stats: { data: undefined, isError: false, error: null },
  hashing: true,
  hashedShare: 1,
  page: null,
  banner: null,
  pagesCalled: 0,
  keepAll: null,
}));

interface TagProps {
  readonly children?: ReactNode;
  readonly label?: string;
  readonly title?: string;
  readonly body?: string;
  readonly action?: ReactNode;
}

function tag(name: string): (props: TagProps) => ReactNode {
  return function Tag(props: TagProps): ReactNode {
    return createElement(
      name,
      {},
      props.title,
      props.body,
      props.label,
      props.action,
      props.children,
    );
  };
}

vi.mock('../../../store/selectors', () => ({
  useIsOwner: (): boolean => seen.owner,
  useSyncStatus: (): { readonly status: string } => ({
    status: seen.live ? 'live' : 'interrupted',
  }),
}));
vi.mock('../../../design/size-class', () => ({ useAreaWidth: (): number => seen.width }));
vi.mock('../../../settings/settings-frame', () => ({
  SettingsFrame: (props: {
    readonly page: string;
    readonly banner?: ReactNode;
    readonly children: ReactNode;
  }): ReactNode => {
    seen.page = props.page;
    seen.banner = props.banner ?? null;
    return createElement('main', {}, props.banner, props.children);
  },
}));
vi.mock('../../../settings/settings-page', () => ({
  SettingsPageBody: ({ page }: { readonly page: string }): ReactNode =>
    createElement('footer', {}, `rows of ${page}`),
}));
vi.mock('../../drive', () => ({
  flattenPages: <P, T>(
    data: { readonly pages: readonly P[] } | undefined,
    items: (page: P) => readonly T[],
  ): readonly T[] => (data?.pages ?? []).flatMap(items),
  useDriveRoots: (): readonly unknown[] => [],
  useViewerId: (): string => 'me',
  useDriveSettings: (): unknown => ({
    data: seen.hashing === undefined ? undefined : { duplicatesHashing: seen.hashing },
  }),
}));
vi.mock('./model', async (load) => ({
  ...(await load<typeof ModelModule>()),
  hashedShareOf: (): number => seen.hashedShare,
}));
vi.mock('../settings', () => ({ PHOTOS_DUPLICATES_PAGE: 'photos/duplicates' }));
vi.mock('./use-drive-labels', () => ({
  useDriveLabels: (): ReadonlyMap<string, string> => new Map(),
}));
vi.mock('../data', () => ({
  usePhotoDuplicates: (): unknown => {
    seen.pagesCalled += 1;
    return { ...seen.pages, isFetchingNextPage: false, refetch: vi.fn(), fetchNextPage: vi.fn() };
  },
  usePhotoDuplicateStats: (): unknown => ({ ...seen.stats, refetch: vi.fn() }),
  usePhotoInsights: (): unknown => ({ data: { items: 48213, bytes: 700_000_000_000 } }),
}));
vi.mock('./use-duplicate-actions', () => ({
  useDuplicateActions: (): unknown => ({
    busy: false,
    keepBest: vi.fn(),
    notDuplicates: vi.fn(),
    keepBestInAll: (stats: DuplicateStats): void => {
      seen.keepAll = stats;
    },
  }),
}));
vi.mock('./duplicate-group', () => ({
  DuplicateGroupCard: ({
    group,
    handlers,
  }: {
    readonly group: DuplicateGroup;
    readonly handlers: { readonly disabled: boolean };
  }): ReactNode =>
    createElement(
      'section',
      {},
      `group ${group.sha256.slice(0, 1)} ${handlers.disabled ? 'off' : 'on'}`,
    ),
}));
vi.mock('./duplicate-stats', () => ({
  DuplicateStatsRow: (): ReactNode => createElement('div', {}, 'stats'),
  DuplicatesLoading: (): ReactNode => createElement('div', {}, 'loading'),
  KeepBestRule: (): ReactNode => createElement('p', {}, 'rule'),
}));
vi.mock('../../../components/button', () => ({ Button: tag('button') }));
vi.mock('../../../components/empty-state', () => ({ EmptyState: tag('article') }));
vi.mock('../../../components/error-state', () => ({
  ErrorState: ({ error }: { readonly error: Error }): ReactNode =>
    createElement('aside', {}, `error ${error.message}`),
}));
vi.mock('../../../components/banner', () => ({ Banner: tag('header') }));
vi.mock('../../../components/card', () => ({ Card: tag('div') }));
vi.mock('../../../components/list-loader', () => ({ ListLoader: (): null => null }));

const { DuplicatesSettingsScreen } = await import('./screen');

const STATS: DuplicateStats = {
  groups: 2,
  extraCopies: 3,
  bytesBack: 4096,
  sources: [
    {
      rootId: '00000000-0000-4000-8000-000000000001',
      copies: 5,
      bytes: 4096,
    },
  ],
};

function group(letter: string): DuplicateGroup {
  return {
    sha256: letter.repeat(64),
    bytes: 1,
    keeperItemId: '00000000-0000-4000-8000-000000000009',
    reclaimableBytes: 1,
    items: [],
  };
}

function render(): string {
  return renderToStaticMarkup(createElement(DuplicatesSettingsScreen));
}

beforeEach(() => {
  seen.owner = true;
  seen.live = true;
  seen.width = 1360;
  seen.pages = { data: undefined, isError: false, error: null, hasNextPage: false };
  seen.stats = { data: undefined, isError: false, error: null };
  seen.hashing = true;
  seen.hashedShare = 1;
  seen.page = null;
  seen.banner = null;
  seen.pagesCalled = 0;
  seen.keepAll = null;
});

describe('the Duplicates settings page', () => {
  it('opens for every person on the Duplicates settings page with its rows', () => {
    seen.owner = false;
    seen.stats.data = STATS;
    seen.pages.data = { pages: [{ items: [group('a')], next: null }] };
    const html = render();
    expect(seen.page).toBe('photos/duplicates');
    expect(html).toContain('group a on');
    expect(html).toContain('rows of photos/duplicates');
  });

  it('shows the loading skeleton until both the groups and the stats arrive', () => {
    seen.stats.data = STATS;
    expect(render()).toContain('loading');
  });

  it('shows the error with a retry when the hub fails before anything loaded', () => {
    seen.pages = { ...seen.pages, isError: true, error: new Error('boom') };
    expect(render()).toContain('error boom');
  });

  it('says there are no duplicates when there are no groups', () => {
    seen.stats.data = { ...STATS, groups: 0, extraCopies: 0, bytesBack: 0, sources: [] };
    seen.pages.data = { pages: [{ items: [], next: null }] };
    const html = render();
    expect(html).toContain('No duplicates');
    expect(html).toContain('Open Library');
    expect(html).not.toContain('Keep best in all groups');
  });

  it('explains hashing is off and links the owner to Drive indexing', () => {
    seen.hashing = false;
    expect(render()).toContain('Duplicate detection is off');
    expect(render()).toContain('Open Drive indexing');
    seen.owner = false;
    expect(render()).not.toContain('Open Drive indexing');
    expect(render()).toContain('The owner of this home can turn it on');
  });

  it('says files are still being checked while hashing runs', () => {
    seen.hashedShare = 0.5;
    seen.stats.data = STATS;
    seen.pages.data = { pages: [{ items: [group('a')], next: null }] };
    expect(render()).toContain('Still checking files');
  });

  it('puts Keep best in all groups in the stats card as the one primary', () => {
    seen.stats.data = STATS;
    seen.pages.data = { pages: [{ items: [group('a'), group('b')], next: null }] };
    const html = render();
    expect(html).toContain('group a on');
    expect(html).toContain('group b on');
    expect(html.match(/Keep best in all groups/g)).toHaveLength(1);
  });

  it('keeps the last groups but turns the actions off while the hub is offline', () => {
    seen.live = false;
    seen.hashedShare = 0.5;
    seen.stats.data = STATS;
    seen.pages.data = { pages: [{ items: [group('a')], next: null }] };
    const html = render();
    expect(html).toContain('Offline · showing the last snapshot');
    expect(html).not.toContain('Still checking files');
    expect(html).toContain('group a off');
  });

  it('offers the next page of groups only while the hub has more', () => {
    seen.stats.data = STATS;
    seen.pages = {
      ...seen.pages,
      data: { pages: [{ items: [group('a')], next: 'x' }] },
      hasNextPage: true,
    };
    expect(render()).toContain('Show more groups (1 left)');
  });
});
