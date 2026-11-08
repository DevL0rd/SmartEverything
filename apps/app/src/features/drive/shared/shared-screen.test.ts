import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveShare } from '@smarteverything/domain';

interface Children {
  readonly children?: ReactNode;
}

interface Seen {
  view: string | null;
  owner: boolean;
  live: boolean;
  shares: readonly DriveShare[] | undefined;
  failed: boolean;
  subtitle: string | undefined;
  primary: boolean;
}

const seen = vi.hoisted((): Seen => ({
  view: null,
  owner: true,
  live: true,
  shares: [],
  failed: false,
  subtitle: undefined,
  primary: false,
}));

const ME = '00000000-0000-4000-8000-000000000001';
const NOW = Date.parse('2026-11-07T12:00:00.000Z');

function node(tag: string): (props: Children) => ReactNode {
  return function Element(props: Children): ReactNode {
    return createElement(tag, null, props.children);
  };
}

vi.mock('react-native', () => ({ View: node('div') }));
vi.mock('../../../components/toast-store', () => ({
  notifyFailure: (): (() => void) => () => undefined,
}));
vi.mock('./revoke-link', () => ({ revokeLink: (): Promise<boolean> => Promise.resolve(true) }));
vi.mock('../../../app-shell/hrefs', () => ({
  href: {
    driveRoot: (id: string): string => `/drive/root/${id}`,
    drivePage: (page: string): string => `/drive/${page}`,
    photosAlbum: (id: string): string => `/photos/albums/${id}`,
    settings: { focus: (page: string, id: string): string => `/settings/${page}#${id}` },
  },
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: (): object => ({}) }));
vi.mock('../../../components/use-section-param', () => ({
  useSectionParam: (): readonly unknown[] => [seen.view, (): void => undefined],
}));
vi.mock('../../../design/size-class', () => ({
  atLeast: (): boolean => true,
  useAreaWidth: (): number => 1360,
  useSizeClass: (): { readonly width: string } => ({ width: 'large' }),
}));
vi.mock('../../nas/frame/sections', () => ({ libraryLayoutOf: (): string => 'wide' }));
vi.mock('../../../store/selectors', () => ({
  useIsOwner: (): boolean => seen.owner,
  useSyncStatus: (): { readonly status: string } => ({ status: seen.live ? 'live' : 'offline' }),
}));
vi.mock('../../../store/clock', () => ({ useMinute: (): number => NOW }));
vi.mock('../../../store/people', () => ({
  useProfiles: (): readonly object[] => [],
  useActiveProfile: (): { readonly id: string } => ({ id: ME }),
}));
vi.mock('../../nas/data', () => ({
  useDriveRoots: (): readonly object[] => [
    {
      id: 'r1',
      label: 'Projects',
      scope: 'home',
      kind: 'folder',
      readOnly: false,
      bytes: 0,
      items: 3,
      synced: false,
    },
    {
      id: 'r2',
      label: 'Your files',
      scope: 'person',
      kind: 'managed',
      readOnly: false,
      bytes: 0,
      items: 1,
      synced: false,
    },
  ],
  useDriveAlbums: (surface: string): readonly object[] =>
    surface === 'photos'
      ? [{ id: 'a1', title: 'Lisbon 2026', scope: 'home', kind: 'manual', itemCount: 214, surface }]
      : [],
  useDriveSyncClients: (): readonly object[] => [],
  useDriveItem: (): object => ({ data: undefined, isError: false }),
  useDriveShares: (): object => ({
    data: seen.shares === undefined ? undefined : { pages: [{ items: seen.shares, next: null }] },
    isError: seen.failed,
    error: new Error('The hub is not answering'),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
  flattenPages: (data: {
    readonly pages: readonly { readonly items: readonly DriveShare[] }[];
  }): readonly DriveShare[] => data.pages.flatMap((page) => page.items),
}));
vi.mock('../components/drive-frame', () => ({
  DriveFrame: (
    props: Children & { readonly subtitle?: string; readonly primary?: object },
  ): ReactNode => {
    seen.subtitle = props.subtitle;
    seen.primary = props.primary !== undefined;
    return createElement('main', null, props.children);
  },
}));
vi.mock('../../../components/segmented', () => ({
  Segmented: (props: { readonly value: string }): ReactNode =>
    createElement('nav', null, `view:${props.value}`),
}));
vi.mock('../../../components/section', () => ({
  List: (props: Children & { readonly title: string }): ReactNode =>
    createElement('section', null, props.title, props.children),
}));
vi.mock('../../../components/list-row', () => ({
  ListRow: (props: {
    readonly title: string;
    readonly subtitle?: string;
    readonly trailing?: ReactNode;
  }): ReactNode =>
    createElement('p', null, props.title, ` | ${props.subtitle ?? ''} | `, props.trailing),
}));
vi.mock('../../../components/badge', () => ({
  Badge: (props: { readonly label: string }): ReactNode => createElement('b', null, props.label),
}));
vi.mock('../../../components/button', () => ({
  Button: (props: { readonly label: string; readonly disabled?: boolean }): ReactNode =>
    createElement('button', { disabled: props.disabled }, props.label),
}));
vi.mock('../../../components/icon-button', () => ({ IconButton: (): null => null }));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/text', () => ({ Text: node('span') }));
vi.mock('../../../components/empty-state', () => ({
  EmptyState: (props: { readonly title: string }): ReactNode =>
    createElement('h2', null, props.title),
}));
vi.mock('../../../components/error-state', () => ({
  ErrorState: (): ReactNode => createElement('h2', null, 'error'),
}));
vi.mock('../../../components/skeleton', () => ({ Skeleton: (): ReactNode => createElement('i') }));
vi.mock('../../../components/list-loader', () => ({ ListLoader: (): null => null }));
vi.mock('../../../components/disclosure', () => ({
  Disclosure: (props: { readonly label: string; readonly count: number }): ReactNode =>
    createElement('summary', null, `${props.label} ${String(props.count)}`),
}));
vi.mock('../../../components/metric-strip', () => ({
  MetricStrip: (props: {
    readonly items: readonly { readonly label: string; readonly value: string }[];
  }): ReactNode =>
    createElement('dl', null, props.items.map((item) => `${item.label}=${item.value};`).join('')),
}));
vi.mock('../../../components/virtual-list', () => ({
  VirtualList: <T>(props: {
    readonly header?: ReactElement;
    readonly empty?: ReactElement;
    readonly sections: readonly { readonly data: readonly T[] }[];
    readonly renderItem: (item: T) => ReactElement;
  }): ReactNode => {
    const rows = props.sections.flatMap((section) => section.data);
    return createElement(
      'ol',
      null,
      props.header,
      rows.length === 0 ? props.empty : rows.map(props.renderItem),
    );
  },
}));

const { SharedScreen } = await import('./shared-screen');

function share(id: string, extra: Partial<DriveShare> = {}): DriveShare {
  return {
    id,
    itemId: '00000000-0000-4000-8000-000000000200',
    permission: 'download',
    expiresAt: null,
    hasPassword: false,
    createdBy: ME,
    revokedAt: null,
    opens: 4,
    downloads: 1,
    lastOpenedAt: null,
    ...extra,
  };
}

const render = (props: object = {}): string =>
  renderToStaticMarkup(createElement(SharedScreen, props));

describe('Shared screen', () => {
  beforeEach(() => {
    seen.view = null;
    seen.owner = true;
    seen.live = true;
    seen.shares = [];
    seen.failed = false;
  });

  it('lists only the library folders and albums everyone in the home can use', () => {
    const markup = render();
    expect(markup).toContain('view:home');
    expect(markup).toContain('Projects');
    expect(markup).toContain('Lisbon 2026');
    expect(markup).not.toContain('Your files');
    expect(seen.subtitle).toBe('1 library folder · 1 album');
  });

  it('offers Make a link and New link once a share opener is given', () => {
    expect(render()).not.toContain('Make a link');
    expect(seen.primary).toBe(false);
    expect(render({ openShare: (): void => undefined })).toContain('Make a link');
    expect(seen.primary).toBe(true);
  });

  it('shows a member with no links the empty state and no stats', () => {
    seen.view = 'links';
    seen.owner = false;
    const markup = render();
    expect(markup).toContain('You have no links');
    expect(markup).not.toContain('Active links=');
  });

  it('lists active links with stats and keeps ended links behind the toggle', () => {
    seen.view = 'links';
    seen.shares = [share('s1'), share('s2', { revokedAt: '2026-11-01T00:00:00.000Z' })];
    const markup = render();
    expect(markup).toContain('Active links=1;Opens=8;');
    expect(markup).toContain('View and download');
    expect(markup).toContain('4 opens · 1 download');
    expect(markup).toContain('Ended links 1');
    expect(markup).toContain('You see every link in the home.');
    expect(seen.subtitle).toBe('1 active link · 8 opens');
  });

  it('keeps Revoke off while the hub is not reachable', () => {
    seen.view = 'links';
    seen.live = false;
    seen.shares = [share('s1')];
    expect(render()).toContain('<button disabled="">Revoke</button>');
  });

  it('shows loading and error states for the links list', () => {
    seen.view = 'links';
    seen.shares = undefined;
    expect(render()).toContain('<i>');
    seen.failed = true;
    expect(render()).toContain('error');
  });
});
