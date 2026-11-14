import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DRIVE_FEED_ROW, DRIVE_ITEM, type DriveFeedRow } from '@smarteverything/domain';
import { FOLDER_ID, ROOT_ID, rootRow } from '../data/fixtures';

interface Passed {
  readonly children?: ReactNode;
}

interface RowPassed {
  readonly entry: { readonly row: DriveFeedRow; readonly actorName: string | null };
}

interface Hub {
  rows: readonly DriveFeedRow[] | null;
  live: boolean;
  error: boolean;
}

const hub = vi.hoisted((): Hub => ({ rows: null, live: true, error: false }));

vi.mock('react-native', () => ({
  View: ({ children }: Passed): ReactNode => createElement('div', {}, children),
}));
vi.mock('../../../components/button', () => ({
  Button: ({ label, href }: { readonly label: string; readonly href: unknown }): ReactNode =>
    createElement('a', { 'data-href': JSON.stringify(href) }, label),
}));
vi.mock('../../../components/text', () => ({
  Text: ({ children }: Passed): ReactNode => createElement('p', {}, children),
}));
vi.mock('../../../components/skeleton', () => ({ Skeleton: (): ReactNode => 'skeleton' }));
vi.mock('../../../components/empty-state', () => ({
  EmptyState: ({ title }: { readonly title: string }): ReactNode => createElement('h2', {}, title),
}));
vi.mock('../../../components/error-state', () => ({
  ErrorState: (): ReactNode => 'error-state',
}));
vi.mock('../../../design/platform', () => ({ useIdiom: (): string => 'pointer' }));
vi.mock('../../../design/screen-pause', () => ({ useScreenPaused: (): boolean => false }));
vi.mock('../../../store/clock', () => ({
  useMinuteOf: <T>(select: (now: number) => T): T => select(Date.parse('2026-11-07T12:00:00Z')),
}));
vi.mock('../../../store/people', () => ({
  useProfiles: (): readonly object[] => [{ id: ME, name: 'Dana Moss' }],
}));
vi.mock('../../../store/selectors', () => ({
  useDevices: (): readonly object[] => [],
  useSession: (): object => ({ client: { profile_id: ME } }),
  useSettings: (): object => ({ time_zone: 'UTC' }),
  useSyncStatus: (): { readonly status: string } => ({ status: hub.live ? 'live' : 'offline' }),
}));
vi.mock('../../../components/choice-chip', () => ({ ChoiceChip: (): null => null }));
vi.mock('../../../components/filter-chip', () => ({ FilterChip: (): null => null }));
vi.mock('../../../components/library-frame/chip-row', () => ({ ChipRow: (): null => null }));
vi.mock('../activity/via-chips', () => ({ ViaChips: (): null => null }));
vi.mock('../activity/person-picker', () => ({
  EVERYONE_VALUE: 'everyone',
  YOU_VALUE: 'you',
  PersonPicker: (): null => null,
}));
vi.mock('../activity/activity-row', () => ({
  ActivityRow: ({ entry }: RowPassed): ReactNode =>
    createElement('li', {}, `${entry.row.op}:${entry.actorName ?? 'nobody'}`),
}));
vi.mock('../data', () => ({
  useDriveChips: (): (() => unknown) => (): unknown => ({
    key: 'mine',
    label: 'My Drive',
    icon: 'hardDrive',
    tone: 'primary',
  }),
  flattenPages: <T>(
    data: { readonly pages: readonly { readonly items: readonly T[] }[] } | undefined,
  ): readonly T[] => (data === undefined ? [] : data.pages.flatMap((page) => page.items)),
  useDriveItemActivity: (): object => ({
    data: hub.rows === null ? undefined : { pages: [{ items: hub.rows, next: null }] },
    hasNextPage: false,
    isFetchingNextPage: false,
    isError: hub.error,
    fetchNextPage: (): Promise<void> => Promise.resolve(),
  }),
}));

const { ActivityTab, activityDaysOf, itemActivityHref } = await import('./activity-tab');

const ME = 'b1b2c3d4-0000-4000-8000-000000000001';
const ITEM_ID = 'b1b2c3d4-0000-4000-8000-000000000002';

const item = DRIVE_ITEM.parse({
  id: ITEM_ID,
  rootId: ROOT_ID,
  parentId: FOLDER_ID,
  relPath: 'Home/Notes.md',
  name: 'Notes.md',
  modifiedAt: '2026-11-07T09:10:00.000Z',
  addedAt: '2026-11-02T09:10:00.000Z',
  openedAt: null,
  starred: false,
  shared: false,
  rev: 3,
  etag: 'etag',
  outside: false,
  addedByProfileId: null,
  remoteId: null,
  remoteRev: null,
  kind: 'document',
  mime: 'text/markdown',
  bytes: 1200,
  sha256: null,
  integrity: 'unknown',
  thumb: { state: 'none' },
});

const subject = {
  root: rootRow(ROOT_ID, 'ready'),
  item,
  label: 'Shared Drive',
  access: 'shared',
  writable: true,
} as const;

function row(seq: number, op: DriveFeedRow['op'], at: string): DriveFeedRow {
  return DRIVE_FEED_ROW.parse({
    seq,
    rootId: ROOT_ID,
    itemId: ITEM_ID,
    op,
    rev: seq,
    at,
    actorProfileId: ME,
    via: 'app',
    deviceId: null,
  });
}

const ROWS = [
  row(1, 'create', '2026-11-02T09:10:00.000Z'),
  row(2, 'update', '2026-11-07T08:00:00.000Z'),
  row(3, 'rename', '2026-11-07T09:10:00.000Z'),
];

function render(): string {
  return renderToStaticMarkup(createElement(ActivityTab, { subject }));
}

beforeEach(() => {
  hub.rows = null;
  hub.live = true;
  hub.error = false;
});

describe('activity tab', () => {
  it('groups the item changes by day, newest first, with who made them', () => {
    const days = activityDaysOf(
      ROWS,
      subject,
      {
        chipOf: () => ({ key: 'mine', label: 'My Drive', icon: 'hardDrive', tone: 'primary' }),
        people: new Map([[ME, 'Dana Moss']]),
        devices: new Map(),
      },
      { zone: 'UTC', day: '2026-11-07' },
    );
    expect(days.map((day) => day.lines.map((line) => line.entry.row.seq))).toEqual([[3, 2], [1]]);
    expect(days[0]?.head.detail).toBe('2 changes');
    expect(days[0]?.lines[0]?.entry.itemName).toBe('Notes.md');
  });

  it('draws every change and opens Activity filtered to this item', () => {
    hub.rows = ROWS;
    const html = render();
    expect(html).toContain('3 changes');
    expect(html).toContain('<li>rename:Dana Moss</li>');
    expect(html).toContain('<li>create:Dana Moss</li>');
    expect(html).toContain('Open in Activity');
    expect(itemActivityHref(subject)).toEqual({
      pathname: '/drive/activity',
      params: { item: ITEM_ID },
    });
  });

  it('says so when the item has no changes', () => {
    hub.rows = [];
    expect(render()).toContain('No changes yet');
  });

  it('shows loading, the hub error and the offline hub before the feed arrives', () => {
    expect(render()).toContain('skeleton');
    hub.error = true;
    expect(render()).toContain('error-state');
    hub.live = false;
    expect(render()).toContain('The hub is offline');
  });
});
