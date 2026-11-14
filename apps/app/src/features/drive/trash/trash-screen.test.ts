import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveFrameProps } from '../components/drive-frame';
import type { TrashActions } from './trash-actions';
import type { TrashFilter } from './trash-filter';
import type { TrashFilterRowProps } from './trash-filter-row';
import type { DriveChip } from '../model/drive-chip';
import type { TrashItem } from './trash-model';
import type { TrashRowProps } from './trash-row';
import type { TableTopProps } from './trash-table';
import type { TrashView } from './use-trash';

interface Seen {
  owner: boolean;
  live: boolean;
  filter: TrashFilter;
  view: TrashView;
  frame: DriveFrameProps | null;
  top: TableTopProps | null;
  rows: TrashRowProps[];
  restored: (readonly TrashItem[])[];
  removedAll: (readonly TrashItem[])[];
}

const ROOT_ID = 'a1b2c3d4-0000-4000-8000-000000000001';

const ITEM: TrashItem = {
  id: 'a1b2c3d4-0000-4000-8000-000000000011',
  rootId: ROOT_ID,
  name: 'Old tile quote.pdf',
  isFolder: false,
  bytes: 220_000,
  deletedAt: Date.parse('2026-11-06T12:00:00Z'),
  daysLeft: 364,
  kept: 364 / 365,
  folders: ['Home', 'Kitchen remodel'],
  deleter: { kind: 'you' },
};

function viewOf(items: readonly TrashItem[], status: TrashView['status'] = 'ready'): TrashView {
  return {
    status,
    error: status === 'error' ? new Error('hub down') : null,
    retry: () => undefined,
    complete: true,
    items,
    totals: { count: items.length, bytes: items.length * ITEM.bytes },
    deletedBy: [],
    months: [],
    rootLabelOf: (rootId) => (rootId === ROOT_ID ? 'Projects' : null),
    chipOf: () => ({ key: 'mine', label: 'Projects', icon: 'hardDrive', tone: 'primary' }),
  };
}

const seen = vi.hoisted((): Seen => ({
  owner: true,
  live: true,
  filter: { chip: 'everything', drive: 'all', query: '' },
  view: {
    status: 'loading',
    error: null,
    retry: () => undefined,
    complete: true,
    items: [],
    totals: { count: 0, bytes: 0 },
    deletedBy: [],
    months: null,
    rootLabelOf: () => null,
    chipOf: () => ({ key: 'mine', label: 'My Drive', icon: 'hardDrive', tone: 'primary' }),
  },
  frame: null,
  top: null,
  rows: [],
  restored: [],
  removedAll: [],
}));

function text(label: string): () => ReactNode {
  return function Stand(): ReactNode {
    return createElement('span', {}, label);
  };
}

vi.mock('../../../store/selectors', () => ({
  useIsOwner: (): boolean => seen.owner,
  useSyncStatus: (): { readonly status: string } => ({ status: seen.live ? 'live' : 'offline' }),
}));
vi.mock('../../../design/size-class', async (original) => ({
  ...(await original<object>()),
  useAreaWidth: (): number => 1336,
}));
vi.mock('../../../components/use-escape', () => ({ useEscape: (): void => undefined }));
vi.mock('../../../components/text', () => ({
  Text: ({ children }: { readonly children: ReactNode }): ReactNode =>
    createElement('span', {}, children),
}));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/button', () => ({
  Button: ({ label }: { readonly label: string }): ReactNode => createElement('button', {}, label),
}));
vi.mock('../../../components/skeleton', () => ({ Skeleton: text('skeleton') }));
vi.mock('../../../components/error-state', () => ({ ErrorState: text('error') }));
vi.mock('../../../components/empty-state', () => ({
  EmptyState: ({ title }: { readonly title: string }): ReactNode =>
    createElement('section', {}, title),
}));
vi.mock('../../../components/banner', () => ({
  Banner: ({ title }: { readonly title: string }): ReactNode => createElement('aside', {}, title),
}));
vi.mock('../../../components/files/selection-bar', () => ({ SelectionBar: text('picked') }));
vi.mock('./trash-filter', async (original) => ({
  ...(await original<object>()),
  get NO_FILTER(): TrashFilter {
    return seen.filter;
  },
}));
vi.mock('./use-trash', () => ({ useTrash: (): TrashView => seen.view }));
vi.mock('./trash-actions', () => ({
  useTrashActions: (): TrashActions => ({
    busy: false,
    restore: (items): void => {
      seen.restored.push(items);
    },
    deleteNow: (): void => undefined,
    deleteAll: (items): void => {
      seen.removedAll.push(items);
    },
  }),
}));
vi.mock('./trash-table', () => ({
  TableTop: (props: TableTopProps): ReactNode => {
    seen.top = props;
    return createElement('div', {}, props.deleteAll === null ? 'top' : 'top with Delete all now');
  },
}));
vi.mock('./trash-row', () => ({
  TrashRow: (props: TrashRowProps): ReactNode => {
    seen.rows.push(props);
    return createElement('li', {}, `${props.item.name} in ${props.wasIn}`);
  },
}));
vi.mock('../components/drive-frame', () => ({
  DriveFrame: (props: DriveFrameProps): ReactNode => {
    seen.frame = props;
    return createElement('main', {}, props.banner, props.children);
  },
}));
vi.mock('../../../components/virtual-list', () => ({
  VirtualList: <T>(props: {
    readonly sections: readonly { key: string; data: readonly T[] }[];
    readonly renderItem: (item: T) => ReactElement;
    readonly header?: ReactElement;
    readonly empty: ReactElement;
    readonly footer?: ReactElement;
  }): ReactNode => {
    const items = props.sections.flatMap((section) => section.data);
    return createElement(
      'section',
      {},
      props.header,
      items.length === 0 ? props.empty : items.map(props.renderItem),
      props.footer,
    );
  },
}));

const { TrashScreen } = await import('./trash-screen');

function render(): string {
  return renderToStaticMarkup(createElement(TrashScreen));
}

describe('Trash screen', () => {
  beforeEach(() => {
    seen.owner = true;
    seen.live = true;
    seen.filter = { chip: 'everything', drive: 'all', query: '' };
    seen.view = viewOf([ITEM]);
    seen.frame = null;
    seen.top = null;
    seen.rows = [];
    seen.restored = [];
    seen.removedAll = [];
  });

  it('sits in the Drive frame on Trash with the count, size and how long items are kept', () => {
    const html = render();
    expect(seen.frame?.section).toBe('trash');
    expect(seen.frame?.title).toBe('Trash');
    expect(seen.frame?.subtitle).toMatch(/^1 item · .+ · each item is kept a year, then deleted$/);
    expect(html).toContain('Old tile quote.pdf in Projects › Home › Kitchen remodel');
    expect(html).not.toContain('picked');
  });

  it('gives the owner Delete all now over the whole list and restores a single row', () => {
    const html = render();
    expect(html).toContain('top with Delete all now');
    expect(html).toContain('Shared Drive trash is seen by everyone in the home');
    seen.top?.deleteAll?.onPress();
    expect(seen.removedAll).toEqual([[ITEM]]);
    seen.rows[0]?.onRestore(ITEM);
    expect(seen.restored).toEqual([[ITEM]]);
    expect(seen.top?.pickState).toBe(false);
    expect(seen.top?.layout).toBe('list');
    expect(seen.rows[0]?.layout).toBe('list');
  });

  it('lets a member empty their own drive’s trash and keeps what others deleted in the Shared Drive', () => {
    seen.owner = false;
    const html = render();
    expect(seen.top?.deleteAll).not.toBeNull();
    expect(html).toContain('In the Shared Drive you delete for good only what you deleted');
    expect(seen.rows[0]?.disabled).toBe(false);
    seen.view = {
      ...viewOf([{ ...ITEM, deleter: { kind: 'person', id: 'sam', name: 'Sam' } }]),
      chipOf: (): DriveChip => ({
        key: 'shared-drive',
        label: 'Shared Drive',
        icon: 'users',
        tone: 'info',
      }),
    };
    render();
    expect(seen.top?.deleteAll).toBeNull();
  });

  it('waits for the whole list before Delete all now', () => {
    seen.view = { ...viewOf([ITEM]), complete: false };
    render();
    expect(seen.top?.deleteAll?.disabled).toBe(true);
  });

  it('shows the offline banner and turns the actions off while the hub is away', () => {
    seen.live = false;
    const html = render();
    expect(html).toContain('Offline · showing the last snapshot');
    expect(seen.top?.deleteAll?.disabled).toBe(true);
    expect(seen.rows[0]?.disabled).toBe(true);
  });

  it('shows the empty, loading and error states without the table top', () => {
    seen.view = viewOf([]);
    expect(render()).toContain('Trash is empty');
    expect(seen.top).toBeNull();
    seen.view = viewOf([], 'loading');
    expect(render()).toContain('skeleton');
    expect(seen.frame?.subtitle).toBe(
      'Deleted files and folders · each item is kept a year, then deleted',
    );
    seen.view = viewOf([], 'error');
    expect(render()).toContain('error');
  });

  it('lists only the matching items and selects within them', () => {
    const folder: TrashItem = {
      ...ITEM,
      id: 'a1b2c3d4-0000-4000-8000-000000000012',
      name: 'Quotes',
      isFolder: true,
    };
    seen.view = viewOf([ITEM, folder]);
    seen.filter = { chip: 'folders', drive: 'all', query: '' };
    const html = render();
    expect(html).toContain('Quotes in Projects');
    expect(html).not.toContain('Old tile quote.pdf');
    const row = seen.top?.filterRow;
    expect(isValidElement<TrashFilterRowProps>(row) ? row.props.shown : null).toBe(1);
    expect(seen.top?.pickState).toBe(false);
  });

  it('says nothing matches and keeps the table top when the filter hides every item', () => {
    seen.filter = { chip: 'everything', drive: 'all', query: 'lease' };
    const html = render();
    expect(html).toContain('Nothing in Trash matches');
    expect(html).not.toContain('Trash is empty');
    expect(html).not.toContain('Shared Drive trash is seen by everyone');
    expect(seen.top).not.toBeNull();
  });
});
