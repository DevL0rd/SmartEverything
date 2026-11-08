import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { bytes } from '../../../format/number';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface Query {
  data: unknown;
  isError: boolean;
  error: unknown;
}

interface Frame {
  readonly title?: string;
  readonly subtitle?: string;
  readonly actions?: readonly { readonly label: string }[];
  readonly banner?: ReactNode;
  readonly children?: ReactNode;
}

interface State {
  query: Query;
  health: unknown;
  roots: readonly unknown[];
  live: boolean;
  owner: boolean;
  width: number;
  frame: Frame | null;
}

const state = vi.hoisted((): State => ({
  query: { data: undefined, isError: false, error: null },
  health: undefined,
  roots: [],
  live: true,
  owner: true,
  width: 1000,
  frame: null,
}));

interface Props {
  readonly children?: ReactNode;
  readonly wide?: boolean;
  readonly owner?: boolean;
}

function stub(name: string): (props: Props) => ReactNode {
  return function Part({ children, wide }: Props): ReactNode {
    return createElement(
      'section',
      { 'data-part': wide === true ? `${name}-wide` : name },
      children,
    );
  };
}

vi.mock('../components/drive-frame', async (original) => ({
  ...(await original<object>()),
  DriveFrame: (frame: Frame): ReactNode => {
    state.frame = frame;
    return createElement('main', null, frame.banner, frame.children);
  },
}));
vi.mock('../../nas/data', () => ({
  useDriveStats: (): Query & { readonly refetch: () => Promise<void> } => ({
    ...state.query,
    refetch: () => Promise.resolve(),
  }),
  useDriveHealth: (): { readonly data: unknown; readonly refetch: () => Promise<void> } => ({
    data: state.health,
    refetch: () => Promise.resolve(),
  }),
  useDriveRoots: (): readonly unknown[] => state.roots,
  useDriveVolumes: (): { readonly data: undefined } => ({ data: undefined }),
}));
vi.mock('../../../store/clock', () => ({ useMinute: (): number => Date.parse('2026-11-07') }));
vi.mock('../../../store/selectors', () => ({
  useIsOwner: (): boolean => state.owner,
  useSyncStatus: (): { readonly status: string } => ({ status: state.live ? 'live' : 'offline' }),
}));
vi.mock('../../../components/section-body', () => ({
  useFrameBodyWidth: (): number => state.width,
}));
vi.mock('../../../components/banner', () => ({ Banner: stub('stale') }));
vi.mock('../../../components/error-state', () => ({ ErrorState: stub('error') }));
vi.mock('../../../components/skeleton', () => ({ Skeleton: stub('loading') }));
vi.mock('../../../components/empty-state', () => ({
  EmptyState: ({
    title,
    action,
  }: {
    readonly title: string;
    readonly action?: ReactNode;
  }): ReactNode =>
    createElement(
      'section',
      { 'data-part': title === 'The hub is offline' ? 'offline' : 'empty' },
      action,
    ),
}));
vi.mock('../../../components/button', () => ({
  Button: ({ label }: { readonly label: string }): ReactNode =>
    createElement('button', null, label),
}));
vi.mock('./storage-hero', () => ({ StorageHero: stub('hero') }));
vi.mock('./volume-list', () => ({
  VolumeList: stub('volumes'),
  volumeNamesOf: (): readonly unknown[] => [],
}));
vi.mock('./by-root', () => ({ ByRoot: stub('by-root') }));

const { StorageScreen, scrubTextOf, storageSubtitleOf } = await import('./storage-screen');

const render = (slots?: object): string =>
  renderToStaticMarkup(createElement(StorageScreen, slots === undefined ? {} : { slots }));

const parts = (slots?: object): readonly string[] =>
  [...render(slots).matchAll(/data-part="([^"]+)"/gu)].map((match) => match[1] ?? '');

const GB = 1024 ** 3;

const STATS = {
  items: 12,
  folders: 2,
  bytes: 300 * GB,
  liveBytes: 300 * GB,
  versionBytes: 0,
  trashBytes: 0,
  kinds: [],
  roots: [],
  volumes: [
    {
      mountId: '41',
      rootIds: ['00000000-0000-4000-8000-0000000000a1'],
      totalBytes: 1000 * GB,
      freeBytes: 700 * GB,
      fullInMonths: null,
    },
  ],
  purges: [],
  growth: null,
};

const IDLE = { state: 'idle', lastFinishedAt: '2026-11-04T00:00:00Z', corrupt: 0 } as const;

afterEach(() => {
  state.query = { data: undefined, isError: false, error: null };
  state.health = undefined;
  state.roots = [];
  state.live = true;
  state.owner = true;
  state.width = 1000;
  state.frame = null;
});

describe('Storage screen states', () => {
  it('shows a skeleton while the hub answers', () => {
    expect(new Set(parts())).toEqual(new Set(['loading']));
    expect(state.frame?.title).toBe('Storage');
  });

  it('tells an offline hub from a failed read', () => {
    state.query = { data: undefined, isError: true, error: new Error('nope') };
    expect(parts()).toEqual(['error']);
    state.live = false;
    expect(parts()).toEqual(['offline']);
  });

  it('keeps the last numbers under a banner when the hub drops', () => {
    state.query = { data: STATS, isError: false, error: null };
    state.live = false;
    expect(parts()[0]).toBe('stale');
    expect(parts()).toContain('hero-wide');
  });

  it('offers the owner a first folder and tells a member who adds them', () => {
    state.query = { data: { ...STATS, items: 0 }, isError: false, error: null };
    expect(parts()).toEqual(['empty']);
    expect(render()).toContain('Add a folder or drive');
    state.owner = false;
    expect(render()).not.toContain('Add a folder or drive');
  });

  it('puts the hero and volumes in the wide column and library folders beside them', () => {
    state.query = { data: STATS, isError: false, error: null };
    expect(parts({ main: createElement('i', { 'data-part': 'people' }) })).toEqual([
      'hero-wide',
      'volumes',
      'people',
      'by-root',
    ]);
  });

  it('stacks one column and drops the donut when the body is narrow', () => {
    state.query = { data: STATS, isError: false, error: null };
    state.width = 400;
    expect(parts()).toEqual(['hero', 'volumes', 'by-root']);
  });
});

describe('Storage header', () => {
  it('offers Scrub now to the owner only and not while a scrub runs', () => {
    state.query = { data: STATS, isError: false, error: null };
    state.health = { scrub: IDLE };
    render();
    expect(state.frame?.actions?.map((action) => action.label)).toEqual(['Scrub now']);
    state.owner = false;
    render();
    expect(state.frame?.actions).toEqual([]);
    state.owner = true;
    state.health = {
      scrub: { state: 'running', startedAt: IDLE.lastFinishedAt, checked: 1, total: 4, corrupt: 0 },
    };
    render();
    expect(state.frame?.actions).toEqual([]);
  });

  it('sums the space and the last scrub in the subtitle', () => {
    const now = Date.parse('2026-11-07T00:00:00Z');
    expect(storageSubtitleOf(undefined, IDLE, now)).toBeUndefined();
    expect(storageSubtitleOf({ ...STATS, kinds: [] }, IDLE, now)).toBe(
      `${bytes(300 * GB)} of ${bytes(1000 * GB)} · 1 volume · ${bytes(700 * GB)} free · Last scrub 3 d ago, no damage`,
    );
  });

  it('words every scrub state', () => {
    const now = Date.parse('2026-11-07T00:00:00Z');
    expect(scrubTextOf({ state: 'idle', lastFinishedAt: null, corrupt: 0 }, now)).toBe(
      'Never scrubbed',
    );
    expect(scrubTextOf({ ...IDLE, corrupt: 2 }, now)).toBe('Last scrub 3 d ago, 2 damaged files');
    expect(
      scrubTextOf(
        { state: 'stopped', startedAt: IDLE.lastFinishedAt, checked: 1, total: 4, corrupt: 0 },
        now,
      ),
    ).toBe('Scrub stopped at 25 %');
  });
});
