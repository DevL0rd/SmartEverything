import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DRIVE_ITEM, type DriveRecentEntry } from '@smarteverything/domain';

interface Pages {
  data: { pages: { entries: DriveRecentEntry[]; next: string | null }[] } | undefined;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<void>;
  refetch: () => Promise<void>;
}

interface Seen {
  pages: Pages | null;
  filter: string;
  status: string;
  me: string;
  people: readonly { id: string; name: string }[];
}

const seen = vi.hoisted((): Seen => ({
  pages: null,
  filter: '',
  status: 'live',
  me: '',
  people: [],
}));

vi.mock('../../nas/data', () => ({
  useDriveRecent: (filter: string): unknown => {
    seen.filter = filter;
    return seen.pages;
  },
  useDriveRoots: (): readonly unknown[] => [{ id: ROOT_ID, label: 'Media disk' }],
  flattenPages: (
    data: { pages: { entries: DriveRecentEntry[] }[] } | undefined,
  ): readonly DriveRecentEntry[] => data?.pages.flatMap((page) => page.entries) ?? [],
}));
vi.mock('../../../store/selectors', () => ({
  useSession: (): unknown => ({ client: { profile_id: seen.me } }),
  useRows: (): readonly unknown[] => seen.people,
  useDevices: (): readonly unknown[] => [],
  useSettings: (): unknown => ({ time_zone: 'Europe/Berlin' }),
  useSyncStatus: (): unknown => ({ status: seen.status }),
}));
vi.mock('../../../store/clock', () => ({ useMinute: (): number => NOW }));
vi.mock('../../../design/size-class', async (original) => ({
  ...(await original<object>()),
  useAreaWidth: (): number => 1336,
}));
vi.mock('../components/drive-frame', () => ({
  DriveFrame: ({
    children,
    banner,
  }: {
    readonly children: ReactNode;
    readonly banner?: ReactNode;
  }): ReactNode => createElement('main', {}, banner, children),
}));
vi.mock('../../../components/segmented', () => ({ Segmented: (): null => null }));
vi.mock('./recent-bars', () => ({
  RecentBars: (): ReactNode => createElement('figure', {}, 'chart'),
}));
vi.mock('./recent-row', () => ({
  RecentRow: ({
    how,
    time,
  }: {
    readonly how: { text: string };
    readonly time: string;
  }): ReactNode => createElement('li', {}, `${how.text} ${time}`),
}));
vi.mock('./recent-states', () => ({
  RecentEmpty: ({ live }: { readonly live: boolean }): ReactNode =>
    createElement('p', {}, live ? 'empty' : 'offline'),
  RecentFooter: (): null => null,
  RecentStaleBanner: (): ReactNode => createElement('aside', {}, 'stale'),
  recentStale: (hasData: boolean, live: boolean): boolean => hasData && !live,
}));
vi.mock('../../../components/virtual-list', () => ({
  VirtualList: <T>(props: {
    readonly sections: readonly { key: string; title: string; data: readonly T[] }[];
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
            createElement(
              'div',
              { key: section.key },
              section.title,
              section.data.map(props.renderItem),
            ),
          ),
    ),
}));

const ROOT_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const ME = 'a1b2c3d4-0000-4000-8000-0000000000a1';
const MEMBER = 'a1b2c3d4-0000-4000-8000-0000000000b2';
const NOW = Date.parse('2026-11-07T15:00:00.000Z');

const ITEM = DRIVE_ITEM.parse({
  id: 'a1b2c3d4-0000-4000-8000-000000000010',
  rootId: ROOT_ID,
  parentId: null,
  relPath: 'Notes.md',
  name: 'Notes.md',
  modifiedAt: '2026-11-07T10:00:00.000Z',
  addedAt: '2026-11-07T10:00:00.000Z',
  openedAt: null,
  starred: false,
  rev: 1,
  etag: 'e',
  outside: false,
  addedByProfileId: null,
  remoteId: null,
  remoteRev: null,
  mime: 'text/markdown',
  bytes: 4,
  sha256: null,
  integrity: 'unknown',
  thumb: { state: 'none' },
  kind: 'document',
});

function pagesOf(entries: DriveRecentEntry[], next: string | null): Pages {
  return {
    data: { pages: [{ entries, next }] },
    isPending: false,
    isError: false,
    error: null,
    hasNextPage: next !== null,
    isFetchingNextPage: false,
    fetchNextPage: () => Promise.resolve(),
    refetch: () => Promise.resolve(),
  };
}

async function render(): Promise<string> {
  const { RecentScreen } = await import('./recent-screen');
  return renderToStaticMarkup(createElement(RecentScreen));
}

describe('RecentScreen', () => {
  beforeEach(() => {
    seen.status = 'live';
    seen.me = ME;
    seen.people = [];
  });

  it('shows the week chart and the groups with who changed each file', async () => {
    seen.pages = pagesOf(
      [
        {
          kind: 'changed',
          item: ITEM,
          at: '2026-11-07T09:00:00.000Z',
          actorProfileId: null,
          via: 'outside',
          deviceId: null,
        },
        {
          kind: 'added',
          item: ITEM,
          at: '2026-10-01T09:00:00.000Z',
          actorProfileId: ME,
          via: 'app',
          deviceId: null,
        },
      ],
      null,
    );
    const html = await render();
    expect(seen.filter).toBe('everything');
    expect(html).toContain('chart');
    expect(html).toContain('Today · 1');
    expect(html).toContain('Earlier');
    expect(html).toContain('Changed outside SmartEverything');
    expect(html).toContain('Added by you');
  });

  it('shows the empty state when nothing came back', async () => {
    seen.status = 'live';
    seen.pages = pagesOf([], null);
    const html = await render();
    expect(html).toContain('empty');
    expect(html).not.toContain('chart');
    expect(html).not.toContain('stale');
  });

  it('keeps the loaded files under an offline banner when the hub drops', async () => {
    seen.status = 'offline';
    seen.pages = pagesOf(
      [
        {
          kind: 'opened',
          item: ITEM,
          at: '2026-11-07T09:00:00.000Z',
        },
      ],
      null,
    );
    const html = await render();
    expect(html).toContain('stale');
    expect(html).toContain('Opened');
  });

  it('shows the offline state when nothing was loaded before the hub dropped', async () => {
    seen.status = 'offline';
    seen.pages = { ...pagesOf([], null), data: undefined, isPending: true };
    const html = await render();
    expect(html).toContain('offline');
    expect(html).not.toContain('stale');
  });

  it('shows a member their own writes as theirs and the owner by name', async () => {
    seen.me = MEMBER;
    seen.people = [
      { id: ME, name: 'Dana' },
      { id: MEMBER, name: 'Sam' },
    ];
    seen.pages = pagesOf(
      [
        {
          kind: 'changed',
          item: ITEM,
          at: '2026-11-07T09:00:00.000Z',
          actorProfileId: ME,
          via: 'app',
          deviceId: null,
        },
        {
          kind: 'added',
          item: ITEM,
          at: '2026-11-07T08:00:00.000Z',
          actorProfileId: MEMBER,
          via: 'app',
          deviceId: null,
        },
      ],
      null,
    );
    const html = await render();
    expect(html).toContain('Changed by Dana');
    expect(html).toContain('Added by you');
    expect(html).not.toContain('Added by Sam');
  });
});
