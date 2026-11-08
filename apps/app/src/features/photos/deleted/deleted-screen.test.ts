import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SizeClassModule from '../../../design/size-class';
import type { PhotosFrameProps } from '../components/photos-frame';
import type { DeletedActions } from './actions';
import type { DeletedGridProps } from './deleted-grid';
import type { WholeActions } from './leaving-card';
import type { DeletedItem } from './model';
import type { DeletedView } from './use-deleted';

interface Seen {
  owner: boolean;
  area: number;
  live: boolean;
  view: DeletedView;
  frame: PhotosFrameProps | null;
  grid: DeletedGridProps | null;
  whole: WholeActions | null;
  restored: (readonly DeletedItem[])[];
  removedAll: (readonly DeletedItem[])[];
}

const ITEM: DeletedItem = {
  id: '00000000-0000-4000-8000-000000000011',
  name: 'IMG_1.jpg',
  isFolder: false,
  bytes: 2_000_000,
  deletedAt: Date.parse('2026-11-06T12:00:00Z'),
  day: '2026-11-06',
  purgeDay: '2027-11-06',
  daysLeft: 364,
  kept: 364 / 365,
  critical: false,
  who: 'You',
};

function viewOf(
  items: readonly DeletedItem[],
  status: DeletedView['status'] = 'ready',
): DeletedView {
  return {
    status,
    error: status === 'error' ? new Error('hub down') : null,
    retry: () => undefined,
    complete: true,
    items,
    days: items.length === 0 ? [] : [{ day: ITEM.day, items }],
    totals: { count: items.length, bytes: items.length * ITEM.bytes },
    months: [],
    today: '2026-11-07',
  };
}

const seen = vi.hoisted((): Seen => ({
  owner: true,
  area: 1360,
  live: true,
  view: {
    status: 'loading',
    error: null,
    retry: () => undefined,
    complete: true,
    items: [],
    days: [],
    totals: { count: 0, bytes: 0 },
    months: [],
    today: '2026-11-07',
  },
  frame: null,
  grid: null,
  whole: null,
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
vi.mock('../../../design/size-class', async (importOriginal) => ({
  ...(await importOriginal<typeof SizeClassModule>()),
  useAreaWidth: (): number => seen.area,
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
vi.mock('./use-deleted', () => ({ useDeleted: (): DeletedView => seen.view }));
vi.mock('./actions', () => ({
  useDeletedActions: (): DeletedActions => ({
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
vi.mock('./leaving-card', () => ({
  LeavingCard: ({ actions }: { readonly actions: WholeActions }): ReactNode => {
    seen.whole = actions;
    return createElement('div', {}, 'leaving');
  },
}));
vi.mock('./deleted-grid', () => ({
  DeletedGrid: (props: DeletedGridProps): ReactNode => {
    seen.grid = props;
    return createElement('div', {}, props.header, props.footer);
  },
}));
vi.mock('../components/photos-frame', () => ({
  PhotosFrame: (props: PhotosFrameProps): ReactNode => {
    seen.frame = props;
    return createElement('main', {}, props.banner, props.children);
  },
}));

const { DeletedScreen } = await import('./deleted-screen');

function render(): string {
  return renderToStaticMarkup(createElement(DeletedScreen));
}

describe('Recently deleted screen', () => {
  beforeEach(() => {
    seen.owner = true;
    seen.area = 1360;
    seen.live = true;
    seen.view = viewOf([ITEM]);
    seen.frame = null;
    seen.grid = null;
    seen.whole = null;
    seen.restored = [];
    seen.removedAll = [];
  });

  it('sits in the Photos frame on the deleted section with Select and no selection bar', () => {
    render();
    expect(seen.frame?.active).toBe('deleted');
    expect(seen.frame?.scroll).toBe(false);
    expect(seen.frame?.actions?.map((action) => action.label)).toEqual(['Select']);
    expect(seen.frame?.selection).toBeNull();
  });

  it('gives the owner Restore all, Delete all now, Delete now and both notes', () => {
    const html = render();
    expect(seen.whole?.onDeleteAll).not.toBeNull();
    expect(seen.grid?.onDeleteNow).not.toBeNull();
    expect(seen.grid?.disabled).toBe(false);
    expect(html).toContain('Delete now is for the owner');
    expect(html).toContain('read-only library folder');
    seen.whole?.onRestoreAll();
    expect(seen.restored).toEqual([[ITEM]]);
    seen.whole?.onDeleteAll?.();
    expect(seen.removedAll).toEqual([[ITEM]]);
  });

  it('keeps the year rule under the title and a divided action row on wide screens', () => {
    render();
    expect(seen.frame?.subtitle).toBe('Items stay here for a year, then leave for good');
    expect(seen.whole?.compact).toBe(false);
  });

  it('puts the count and size under the title and full-width actions on phones', () => {
    seen.area = 412;
    render();
    expect(seen.frame?.subtitle).toMatch(/^1 item · .+ · kept a year$/);
    expect(seen.whole?.compact).toBe(true);
  });

  it('lets a member restore but never delete for good', () => {
    seen.owner = false;
    const html = render();
    expect(seen.whole?.onDeleteAll).toBeNull();
    expect(seen.grid?.onDeleteNow).toBeNull();
    expect(html).toContain('Only the owner can delete items for good');
    expect(html).not.toContain('read-only library folder');
  });

  it('waits for the whole list before acting on all of it', () => {
    seen.view = { ...viewOf([ITEM]), complete: false };
    render();
    expect(seen.whole?.disabled).toBe(true);
  });

  it('shows the offline banner and turns the actions off while the hub is away', () => {
    seen.live = false;
    const html = render();
    expect(html).toContain('Offline · showing the last snapshot');
    expect(seen.whole?.disabled).toBe(true);
    expect(seen.grid?.disabled).toBe(true);
    expect(seen.grid?.onDeleteNow).not.toBeNull();
  });

  it('shows the empty, loading and error states', () => {
    seen.view = viewOf([]);
    expect(render()).toContain('Nothing in Recently deleted');
    expect(seen.frame?.actions).toEqual([]);
    seen.view = viewOf([], 'loading');
    expect(render()).toContain('skeleton');
    seen.view = viewOf([], 'error');
    expect(render()).toContain('error');
  });
});
