import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DuplicateGroup, DuplicateStats } from '@smarteverything/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HeaderAction } from '../../../components/page-header';
import type { PhotosFrameProps } from '../components/photos-frame';

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
  frame: PhotosFrameProps | null;
  pagesCalled: number;
  keepAll: DuplicateStats | null;
}

const seen = vi.hoisted((): Seen => ({
  owner: true,
  live: true,
  width: 1360,
  pages: { data: undefined, isError: false, error: null, hasNextPage: false },
  stats: { data: undefined, isError: false, error: null },
  frame: null,
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
vi.mock('../components/photos-frame', () => ({
  PhotosFrame: (props: PhotosFrameProps): ReactNode => {
    seen.frame = props;
    return createElement('main', {}, props.banner, props.children);
  },
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
vi.mock('../../../components/list-loader', () => ({ ListLoader: (): null => null }));

const { DuplicatesScreen } = await import('./screen');

const STATS: DuplicateStats = {
  groups: 2,
  extraCopies: 3,
  bytesBack: 4096,
  sources: [
    {
      rootId: '00000000-0000-4000-8000-000000000001',
      label: 'Phone backup',
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
  return renderToStaticMarkup(createElement(DuplicatesScreen));
}

function actions(): readonly HeaderAction[] {
  return seen.frame?.actions ?? [];
}

beforeEach(() => {
  seen.owner = true;
  seen.live = true;
  seen.width = 1360;
  seen.pages = { data: undefined, isError: false, error: null, hasNextPage: false };
  seen.stats = { data: undefined, isError: false, error: null };
  seen.frame = null;
  seen.pagesCalled = 0;
  seen.keepAll = null;
});

describe('the Duplicates page', () => {
  it('never reads duplicates for a member and says the page is the owner’s', () => {
    seen.owner = false;
    const html = render();
    expect(html).toContain('Duplicates are for the owner');
    expect(seen.pagesCalled).toBe(0);
    expect(actions()).toHaveLength(0);
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
    expect(html).toContain('Every photo and video is stored once');
    expect(html).toContain('Open Timeline');
    expect(seen.frame?.subtitle).toBe('Exact copies, matched by content');
    expect(actions()).toHaveLength(0);
  });

  it('puts Keep best in all groups in the desktop header as the one primary', () => {
    seen.stats.data = STATS;
    seen.pages.data = { pages: [{ items: [group('a'), group('b')], next: null }] };
    const html = render();
    expect(html).toContain('group a on');
    expect(html).toContain('group b on');
    expect(seen.frame?.subtitle).toBe('2 groups · 3 extra copies');
    const [primary] = actions();
    expect(primary).toMatchObject({ label: 'Keep best in all groups', primary: true });
    primary?.onPress?.();
    expect(seen.keepAll).toBe(STATS);
  });

  it('moves the primary into the page on phones', () => {
    seen.width = 412;
    seen.stats.data = STATS;
    seen.pages.data = { pages: [{ items: [group('a')], next: null }] };
    const html = render();
    expect(actions()).toHaveLength(0);
    expect(html).toContain('Keep best in all groups');
  });

  it('keeps the last groups but turns the actions off while the hub is offline', () => {
    seen.live = false;
    seen.stats.data = STATS;
    seen.pages.data = { pages: [{ items: [group('a')], next: null }] };
    const html = render();
    expect(html).toContain('Offline · showing the last snapshot');
    expect(html).toContain('group a off');
    expect(actions()).toHaveLength(0);
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
