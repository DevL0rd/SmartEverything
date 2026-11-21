import { act, createElement, Fragment, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveRecentEntry } from '@smarteverything/domain';
import { documentFixture } from '../data/fixtures';

interface Pages {
  readonly data: { readonly pages: readonly { readonly entries: readonly DriveRecentEntry[] }[] };
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error: null;
  readonly hasNextPage: boolean;
  readonly isFetching: boolean;
  readonly isFetchingNextPage: boolean;
  readonly fetchNextPage: () => Promise<void>;
  readonly refetch: () => Promise<void>;
}

interface Seen {
  pages: Pages | null;
  rows: Map<string, number>;
}

const seen = vi.hoisted((): Seen => ({ pages: null, rows: new Map() }));

const stable = vi.hoisted(() => ({
  chip: { key: 'mine', label: 'My Drive', icon: 'hardDrive', tone: 'primary' },
  people: new Array<unknown>(),
  devices: new Map<string, string>(),
  session: { client: { profile_id: 'me' } },
  settings: { time_zone: 'Europe/Berlin' },
  sync: { status: 'live' },
  context: {},
  width: { width: 0, onLayout: (): void => undefined },
}));

const chipOf = vi.hoisted(() => (): unknown => stable.chip);

vi.mock('react-native', async (original) => ({
  ...(await original<object>()),
  View: ({ children }: { readonly children?: ReactNode }): ReactNode => children,
}));
vi.mock('../data', () => ({
  useDriveRecent: (): Pages | null => seen.pages,
  useDriveChips: (): unknown => chipOf,
  flattenPages: (data: Pages['data'] | undefined): readonly DriveRecentEntry[] =>
    data?.pages.flatMap((page) => page.entries) ?? [],
}));
vi.mock('../../../store/selectors', () => ({
  useSession: (): unknown => stable.session,
  useRows: (): readonly unknown[] => stable.people,
  useDeviceNames: (): ReadonlyMap<string, string> => stable.devices,
  useSettings: (): unknown => stable.settings,
  useSyncStatus: (): unknown => stable.sync,
}));
vi.mock('../../../store/clock', () => ({ useMinute: (): number => NOW }));
vi.mock('../../../components/use-lifecycle-log', () => ({
  useLifecycleLog: (): void => undefined,
}));
vi.mock('../../../components/use-measured-width', () => ({
  useMeasuredWidth: (): unknown => stable.width,
}));
vi.mock('../../../design/size-class', async (original) => ({
  ...(await original<object>()),
  useAreaWidth: (): number => 1336,
}));
vi.mock('../components/drive-frame', () => ({
  DriveFrame: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('../../../components/segmented', () => ({ Segmented: (): null => null }));
vi.mock('../components/drive-chip', () => ({ DriveFilterRow: (): null => null }));
vi.mock('../components/drive-columns', () => ({ DriveColumnHead: (): null => null }));
vi.mock('./recent-bars', () => ({ RecentBars: (): null => null }));
vi.mock('./recent-states', () => ({
  RecentEmpty: (): null => null,
  RecentFooter: (): null => null,
}));
vi.mock('./recent-row', () => ({
  RECENT_COLUMNS: [],
  RecentRow: ({ node }: { readonly node: { readonly key: string } }): null => {
    seen.rows.set(node.key, (seen.rows.get(node.key) ?? 0) + 1);
    return null;
  },
}));
vi.mock('../source/drive-node', () => ({
  driveNodeOf: (item: { readonly id: string }): object => ({ key: item.id }),
  shortcutNodeOf: (shortcut: { readonly id: string }): object => ({ key: shortcut.id }),
}));
vi.mock('../source/drive-lists', () => ({
  useDriveList: (): null => null,
  useDriveNodeList: (
    _list: string,
    build: (context: object) => readonly object[],
  ): { readonly browser: null; readonly nodes: readonly object[] } => ({
    browser: null,
    nodes: build(stable.context),
  }),
  DriveListFrame: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('../source/drive-location', () => ({ useDriveNodeContext: (): object => stable.context }));
vi.mock('../../../components/virtual-list', async () => {
  const { createElement: element, memo: memoOf, Fragment: Group } = await import('react');
  interface RowProps {
    readonly item: unknown;
    readonly render: (item: unknown) => ReactElement;
  }
  const Row = memoOf(
    ({ item, render }: RowProps): ReactElement => render(item),
    (left: RowProps, right: RowProps) => left.item === right.item && left.render === right.render,
  );
  return {
    VirtualList: (props: {
      readonly sections: readonly { readonly data: readonly unknown[] }[];
      readonly keyOf: (item: unknown) => string;
      readonly renderItem: (item: unknown) => ReactElement;
    }): ReactNode =>
      element(
        Group,
        null,
        props.sections.flatMap((section) =>
          section.data.map((item) =>
            element(Row, { key: props.keyOf(item), item, render: props.renderItem }),
          ),
        ),
      ),
  };
});

const NOW = Date.parse('2026-11-07T15:00:00.000Z');

function itemOf(id: string): ReturnType<typeof documentFixture> {
  return documentFixture({
    id,
    rootId: 'a1b2c3d4-0000-4000-8000-000000000001',
    parentId: null,
    name: `${id}.md`,
    modifiedAt: '2026-11-07T10:00:00.000Z',
    addedAt: '2026-11-07T10:00:00.000Z',
    etag: 'e',
    mime: 'text/markdown',
    bytes: 4,
  });
}

function openedOf(id: string, at: string): DriveRecentEntry {
  return { kind: 'opened', item: itemOf(id), at };
}

function pagesOf(entries: readonly DriveRecentEntry[], isFetching: boolean): Pages {
  return {
    data: { pages: [{ entries }] },
    isPending: false,
    isError: false,
    error: null,
    hasNextPage: false,
    isFetching,
    isFetchingNextPage: false,
    fetchNextPage: () => Promise.resolve(),
    refetch: () => Promise.resolve(),
  };
}

const A = 'a1b2c3d4-0000-4000-8000-0000000000a1';
const B = 'a1b2c3d4-0000-4000-8000-0000000000b1';
const C = 'a1b2c3d4-0000-4000-8000-0000000000c1';

let root: Root;

async function show(): Promise<void> {
  const { RecentScreen } = await import('./recent-screen');
  act(() => {
    root.render(createElement(Fragment, null, createElement(RecentScreen)));
  });
}

function total(): number {
  return [...seen.rows.values()].reduce((sum, count) => sum + count, 0);
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  seen.rows = new Map();
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  vi.unstubAllGlobals();
});

describe('the Recent row render budget', () => {
  it('renders no row again when a refetch brings back the same entries', async () => {
    const first = openedOf(A, '2026-11-07T09:00:00.000Z');
    const second = openedOf(B, '2026-11-07T08:00:00.000Z');
    seen.pages = pagesOf([first, second], false);
    await show();
    expect(total()).toBe(2);
    seen.pages = pagesOf([first, second], true);
    await show();
    seen.pages = pagesOf([first, second], false);
    await show();
    expect(total()).toBe(2);
  });

  it('renders only the new row when one entry arrives on top', async () => {
    const first = openedOf(A, '2026-11-07T09:00:00.000Z');
    const second = openedOf(B, '2026-11-07T08:00:00.000Z');
    seen.pages = pagesOf([first, second], false);
    await show();
    seen.pages = pagesOf([openedOf(C, '2026-11-07T11:00:00.000Z'), first, second], false);
    await show();
    expect(Object.fromEntries(seen.rows)).toEqual({ [A]: 1, [B]: 1, [C]: 1 });
  });
});
