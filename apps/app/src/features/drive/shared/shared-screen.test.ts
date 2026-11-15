import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveSharedByMeEntry, DriveSharedWithMeEntry } from '@smarteverything/domain';
import { folderFixture } from '../data/fixtures';

interface Children {
  readonly children?: ReactNode;
}

interface Seen {
  view: string | null;
  live: boolean;
  withMe: readonly DriveSharedWithMeEntry[] | undefined;
  byMe: readonly DriveSharedByMeEntry[] | undefined;
  failed: boolean;
  subtitle: string | undefined;
  banner: boolean;
  requests: readonly object[];
}

const seen = vi.hoisted((): Seen => ({
  view: null,
  live: true,
  withMe: [],
  byMe: [],
  failed: false,
  subtitle: undefined,
  banner: false,
  requests: [],
}));

const ME = '00000000-0000-4000-8000-000000000001';
const SAM = '00000000-0000-4000-8000-000000000002';
const ROOT = '00000000-0000-4000-8000-000000000300';
const NOW = Date.parse('2026-11-07T12:00:00.000Z');
const AT = '2026-11-05T12:00:00.000Z';

function node(tag: string): (props: Children) => ReactNode {
  return function Element(props: Children): ReactNode {
    return createElement(tag, null, props.children);
  };
}

function pagesOf(items: readonly unknown[] | undefined): object {
  return {
    data: items === undefined ? undefined : { pages: [{ items, next: null }] },
    isError: seen.failed,
    error: new Error('The hub is not answering'),
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: (): Promise<void> => Promise.resolve(),
  };
}

vi.mock('react-native', () => ({ View: node('div'), ScrollView: node('div') }));
vi.mock('expo-router', () => ({ router: { push: (): void => undefined } }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: (): object => ({}) }));
vi.mock('../../../components/toast-store', () => ({
  notify: (): void => undefined,
  notifyFailure: (): (() => void) => () => undefined,
}));
vi.mock('./stop-sharing', () => ({ stopSharing: (): Promise<boolean> => Promise.resolve(true) }));
vi.mock('../model/item-commands', () => ({ openItemFile: (): void => undefined }));
vi.mock('../components/folder-glyph', () => ({ DriveGlyph: (): null => null }));
vi.mock('../requests/file-request-list', () => ({
  FileRequestsSection: (): ReactNode => createElement('section', null, 'file-requests'),
  useMyFileRequests: (): readonly object[] => seen.requests,
}));
vi.mock('../requests/file-request-sheet', () => ({
  useFileRequestSheet: (): object => ({ edit: (): void => undefined, host: null }),
}));
vi.mock('../../profiles', () => ({ ProfileAvatar: (): ReactNode => createElement('img') }));
vi.mock('../share', () => ({
  useShareSheet: (): object => ({ open: (): void => undefined, host: null }),
}));
vi.mock('../../../app-shell/hrefs', () => ({
  href: {
    drive: (): string => '/drive',
    driveFolder: (id: string): string => `/drive/folder/${id}`,
  },
}));
vi.mock('../../../components/use-section-param', () => ({
  useSectionParam: (): readonly unknown[] => [seen.view, (): void => undefined],
}));
vi.mock('../../../design/size-class', () => ({ useAreaWidth: (): number => 1360 }));
vi.mock('../../../components/page-shell/layout', () => ({
  SHELL_BREAKPOINTS: { compactMax: 600 },
}));
vi.mock('../../../store/selectors', () => ({
  useSyncStatus: (): { readonly status: string } => ({ status: seen.live ? 'live' : 'offline' }),
}));
vi.mock('../../../store/clock', () => ({ useMinute: (): number => NOW }));
vi.mock('../../../store/people', () => ({
  useProfiles: (): readonly object[] => [{ id: SAM, name: 'Sam', colour: 'blue' }],
}));
vi.mock('../data', () => ({
  useSharedWithMe: (): object => pagesOf(seen.withMe),
  useSharedByMe: (): object => pagesOf(seen.byMe),
  flattenPages: (
    data: { readonly pages: readonly { readonly items: readonly unknown[] }[] } | undefined,
  ): readonly unknown[] => data?.pages.flatMap((page) => page.items) ?? [],
}));
vi.mock('../components/drive-frame', () => ({
  DriveFrame: (
    props: Children & { readonly subtitle?: string; readonly banner?: ReactNode },
  ): ReactNode => {
    seen.subtitle = props.subtitle;
    seen.banner = props.banner !== undefined;
    return createElement('main', null, props.banner, props.children);
  },
}));
vi.mock('../../../components/banner', () => ({
  Banner: (props: { readonly title: string }): ReactNode =>
    createElement('aside', null, props.title),
}));
vi.mock('../../../components/segmented', () => ({
  Segmented: (props: { readonly value: string }): ReactNode =>
    createElement('nav', null, `view:${props.value}`),
}));
vi.mock('../../files', () => ({
  FileRow: (props: {
    readonly node: { readonly name: string };
    readonly look: { readonly caption: string | null; readonly trailing: ReactNode };
  }): ReactNode =>
    createElement(
      'p',
      null,
      props.node.name,
      ` | ${props.look.caption ?? ''} | `,
      props.look.trailing,
    ),
}));
vi.mock('../source/drive-node', () => ({
  driveNodeOf: (item: { readonly id: string; readonly name: string }): object => ({
    key: item.id,
    name: item.name,
  }),
}));
vi.mock('../source/drive-lists', () => ({
  useDriveNodeList: (
    _list: string,
    build: (context: object) => readonly object[],
  ): { readonly browser: null; readonly nodes: readonly object[] } => ({
    browser: null,
    nodes: build({}),
  }),
  DriveListFrame: ({ children }: { readonly children: ReactNode }): ReactNode => children,
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
    readonly footer?: ReactElement;
    readonly sections: readonly { readonly data: readonly T[] }[];
    readonly renderItem: (item: T) => ReactElement;
  }): ReactNode => {
    const rows = props.sections.flatMap((section) => section.data);
    return createElement(
      'ol',
      null,
      props.header,
      rows.length === 0 ? props.empty : rows.map(props.renderItem),
      props.footer,
    );
  },
}));

const { SharedScreen } = await import('./shared-screen');

function folder(id: string, name: string): DriveSharedWithMeEntry['item'] {
  return folderFixture({
    id,
    rootId: ROOT,
    parentId: null,
    name,
    modifiedAt: AT,
    addedAt: AT,
    shared: true,
    etag: 'e',
    childCount: 1,
    bytes: 1,
  });
}

const ITEM = '00000000-0000-4000-8000-000000000201';
const GRANT = {
  id: '00000000-0000-4000-8000-000000000401',
  itemId: ITEM,
  profileId: ME,
  role: 'edit',
  grantedBy: SAM,
  createdAt: AT,
  expiresAt: null,
} as const;

const render = (): string => renderToStaticMarkup(createElement(SharedScreen));

describe('Shared screen', () => {
  beforeEach(() => {
    seen.view = null;
    seen.live = true;
    seen.withMe = [];
    seen.byMe = [];
    seen.failed = false;
    seen.requests = [];
  });

  it('shows the file requests below the shared items in By me, also while they load', () => {
    seen.view = 'by-me';
    seen.requests = [{}];
    const empty = render();
    expect(empty).toContain('<section>file-requests</section>');
    expect(empty).toContain('You have not shared anything yet');
    expect(empty).not.toContain('Shared items');
    seen.byMe = [{ item: folder(ITEM, 'Holiday'), grants: [], links: [] }];
    const shared = render();
    expect(shared.indexOf('Shared items')).toBeLessThan(shared.indexOf('file-requests'));
    seen.byMe = undefined;
    seen.failed = true;
    const failed = render();
    expect(failed).toContain('error');
    expect(failed).toContain('<section>file-requests</section>');
  });

  it('marks a view only item shared for viewing and names when the access ends', () => {
    seen.withMe = [
      {
        item: { ...folder(ITEM, 'Taxes'), locked: true },
        grant: { ...GRANT, role: 'view', expiresAt: '2026-11-10T12:00:00.000Z' },
      },
    ];
    const markup = render();
    expect(markup).toContain('Taxes | Shared 2 d ago · Ends in 3 days |');
    expect(markup).toContain('<b>View only</b><b>Can view</b>');
  });

  it('opens With me and groups what was shared under the person who shared it', () => {
    seen.withMe = [{ item: folder(ITEM, 'Taxes'), grant: GRANT }];
    const markup = render();
    expect(markup).toContain('view:with-me');
    expect(markup).toContain('Sam');
    expect(markup).toContain('shared 1 item');
    expect(markup).toContain('Taxes | Shared 2 d ago | <div><b>Can edit</b></div>');
    expect(seen.subtitle).toBe('1 item · from 1 person');
  });

  it('says when nothing is shared with the person and when nothing is shared by them', () => {
    expect(render()).toContain('Nothing has been shared with you yet');
    seen.view = 'by-me';
    const markup = render();
    expect(markup).toContain('You have not shared anything yet');
    expect(markup).not.toContain('Active links=');
  });

  it('shows one card per item shared by the person with people, links and actions', () => {
    seen.view = 'by-me';
    seen.byMe = [
      {
        item: folder(ITEM, 'Holiday'),
        grants: [{ ...GRANT, profileId: SAM, grantedBy: ME, role: 'view' }],
        links: [
          {
            id: '00000000-0000-4000-8000-000000000501',
            itemId: ITEM,
            albumId: null,
            permission: 'view',
            expiresAt: null,
            hasPassword: false,
            createdBy: ME,
            revokedAt: null,
            opens: 3,
            downloads: 0,
            lastOpenedAt: null,
          },
        ],
      },
    ];
    const markup = render();
    expect(markup).toContain('Active links=1;Opens=3;');
    expect(markup).toContain('<b>Sam · Can view</b>');
    expect(markup).toContain('<b>Link · No end · 3 opens</b>');
    expect(markup).toContain('<button>Manage</button>');
    expect(markup).toContain('<button>Stop sharing</button>');
    expect(seen.subtitle).toBe('1 item · 1 active link');
  });

  it('shows the offline banner and keeps the actions off while the hub is away', () => {
    seen.live = false;
    seen.view = 'by-me';
    seen.byMe = [{ item: folder(ITEM, 'Holiday'), grants: [], links: [] }];
    const markup = render();
    expect(seen.banner).toBe(true);
    expect(markup).toContain('Showing the last known shares · reconnecting');
    expect(markup).toContain('<button disabled="">Stop sharing</button>');
  });

  it('shows loading and error states for each tab', () => {
    seen.withMe = undefined;
    expect(render()).toContain('<i>');
    seen.failed = true;
    expect(render()).toContain('error');
  });
});
