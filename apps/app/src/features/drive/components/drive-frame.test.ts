import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DrivePlacement, DriveRoot, DriveStats } from '@smarteverything/domain';
import { useHeaderStatus } from '../../../components/header-status';
import { bytes, count } from '../../../format/number';
import type { LibraryFrameProps } from '../../../components/library-frame';
import type { DriveFrameProps } from './drive-frame';

const VIEWER = '00000000-0000-4000-8000-0000000000e1';
const LAPTOP = '00000000-0000-4000-8000-0000000000d1';
const DESKTOP = '00000000-0000-4000-8000-0000000000d2';

interface Seen {
  area: number;
  width: 'compact' | 'medium' | 'expanded' | 'large' | 'xlarge';
  frame: (LibraryFrameProps & { readonly iconRail?: boolean }) | null;
  status: ReactNode;
  placements: DrivePlacement[];
  stats: DriveStats | undefined;
}

const seen = vi.hoisted((): Seen => ({
  area: 1336,
  width: 'large',
  frame: null,
  status: null,
  placements: [],
  stats: undefined,
}));

vi.mock('../../../design/size-class', async (original) => ({
  ...(await original<object>()),
  useAreaWidth: (): number => seen.area,
  useSizeClass: (): { readonly width: Seen['width'] } => ({ width: seen.width }),
}));
vi.mock('../../../settings/env', () => ({
  useSettingEnv: (): { readonly owner: boolean; readonly platform: string } => ({
    owner: true,
    platform: 'desktop',
  }),
}));
vi.mock('../../../store/selectors', () => ({
  useIsOwner: (): boolean => true,
  useDevices: (): readonly { readonly id: string; readonly label: string }[] => [
    { id: LAPTOP, label: 'Laptop' },
    { id: DESKTOP, label: 'Desktop' },
  ],
}));
vi.mock('../data', () => ({
  useMyDrive: (): null => null,
  useSharedDrive: (): null => null,
  useViewerId: (): string => VIEWER,
  useDriveAlbums: (): readonly unknown[] => [],
  useDriveGrantRows: (): readonly unknown[] => [],
  useDrivePlacementRows: (): readonly DrivePlacement[] => seen.placements,
  useDriveUsage: (): { readonly data: undefined } => ({ data: undefined }),
  useDriveStats: (): { readonly data: DriveStats | undefined } => ({ data: seen.stats }),
  useDriveTrash: (): { readonly data: undefined; readonly hasNextPage: boolean } => ({
    data: undefined,
    hasNextPage: false,
  }),
  useDriveConflicts: (): { readonly data: undefined; readonly hasNextPage: boolean } => ({
    data: undefined,
    hasNextPage: false,
  }),
  flattenPages: (): readonly unknown[] => [],
  useLibraryRefresh: (): { readonly refreshing: boolean; readonly refresh: () => void } => ({
    refreshing: false,
    refresh: (): void => undefined,
  }),
}));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/interactive', () => ({
  Interactive: (props: { readonly label: string; readonly children: ReactNode }): ReactNode =>
    createElement('a', { 'aria-label': props.label }, props.children),
}));
vi.mock('../../../components/library-frame', () => ({
  SummaryWell: ({ title }: { readonly title: string }): ReactNode =>
    createElement('aside', {}, title),
  LibraryFrame: (props: NonNullable<Seen['frame']>): ReactNode => {
    seen.frame = props;
    seen.status = useHeaderStatus();
    return createElement('main', {}, props.children);
  },
}));

const { DriveFrame, driveRailOf, driveSectionGroupsOf, driveSectionHref, spaceMeterOf } =
  await import('./drive-frame');
const { storageSummaryOf } = await import('./drive-frame');
const { driveSyncSummaryOf, SyncPill } = await import('./sync-pill');
const { secondaryActionsOf } = await import('./drive-header');

const STATUS: DrivePlacement['status'] = {
  state: 'up_to_date',
  tier: null,
  basicLimits: null,
  readOnly: false,
  route: 'local',
  cacheBytes: 0,
  pinnedBytes: 0,
  openFiles: 0,
  pendingUploads: 0,
  needBytes: 0,
  lastSyncedAt: null,
  errors: [],
  reason: null,
  reportedAt: '2026-11-14T08:00:00+00:00',
};

const PLACEMENT: DrivePlacement = {
  id: '00000000-0000-4000-8000-000000000001',
  deviceId: LAPTOP,
  rootId: '00000000-0000-4000-8000-0000000000a1',
  folderItemId: null,
  mode: 'synced',
  localPath: '/home/me/Drive',
  enabled: true,
  excluded: [],
  ignorePatterns: [],
  conflictCopies: true,
  hold: null,
  createdBy: VIEWER,
  createdAt: '2026-11-14T08:00:00+00:00',
  status: STATUS,
};

const NAMES: ReadonlyMap<string, string> = new Map([
  [LAPTOP, 'Laptop'],
  [DESKTOP, 'Desktop'],
]);

const NONE = { open: 0, more: false };

function placed(
  patch: Partial<DrivePlacement>,
  status: Partial<DrivePlacement['status']> = {},
): DrivePlacement {
  return { ...PLACEMENT, ...patch, status: { ...STATUS, ...status } };
}

function summary(
  placements: readonly DrivePlacement[],
  conflicts = NONE,
): ReturnType<typeof driveSyncSummaryOf> {
  return driveSyncSummaryOf({ placements, names: NAMES, conflicts });
}

const ROOT: DriveRoot = {
  id: '00000000-0000-4000-8000-0000000000a1',
  scope: 'person',
  ownerProfileId: VIEWER,
  indexId: 'index-1',
  state: 'ready',
  stateReason: null,
  items: 12480,
  folders: 40,
  bytes: 2048,
  scannedAt: null,
  health: { hashedShare: 1, verifiedShare: 1, corrupt: 0, lastScrubAt: null, lastBackupAt: null },
  versions: true,
  skipPatterns: [],
  includeHidden: false,
};

const STATS: DriveStats = {
  items: 10,
  folders: 2,
  bytes: 3072,
  liveBytes: 3072,
  versionBytes: 0,
  trashBytes: 0,
  kinds: [
    { kind: 'image', items: 6, bytes: 2048 },
    { kind: 'other', items: 4, bytes: 1024 },
  ],
  roots: [],
  space: { totalBytes: 8192, freeBytes: 4096, fsType: 'ext4' },
  fullInMonths: null,
  purges: [],
  growth: null,
};

const BASE: DriveFrameProps = { section: 'computers', children: 'Body' };

function render(patch: Partial<DriveFrameProps> = {}): string {
  return renderToStaticMarkup(createElement(DriveFrame, { ...BASE, ...patch }));
}

beforeEach(() => {
  seen.area = 1336;
  seen.width = 'large';
  seen.frame = null;
  seen.status = null;
  seen.placements = [];
  seen.stats = undefined;
});

describe('drive sync summary', () => {
  it('has nothing to say while no folder is placed on a computer', () => {
    expect(summary([])).toBeNull();
    expect(summary([placed({ enabled: false })])).toBeNull();
  });

  it('names the one computer when every synced folder is up to date', () => {
    const other = placed({ id: '00000000-0000-4000-8000-000000000002' });
    expect(summary([PLACEMENT, other])).toEqual({
      tone: 'positive',
      icon: 'circleCheck',
      pill: 'Up to date',
      line: 'Synced on Laptop · up to date',
    });
  });

  it('counts computers and says mounted when nothing syncs', () => {
    const mounted = placed({
      mode: 'mounted',
      deviceId: DESKTOP,
      excluded: undefined,
      ignorePatterns: undefined,
      conflictCopies: undefined,
    });
    expect(summary([mounted])?.line).toBe('Mounted on Desktop');
    expect(summary([PLACEMENT, mounted])?.line).toBe('Synced on Laptop · up to date');
    expect(summary([PLACEMENT, placed({ deviceId: DESKTOP })])?.line).toBe(
      'Synced on 2 computers · up to date',
    );
  });

  it('sums what is left to move over the synced folders still catching up', () => {
    const result = summary([PLACEMENT, placed({}, { needBytes: 2048, state: 'syncing' })]);
    expect(result?.tone).toBe('info');
    expect(result?.pill).toBe(`${bytes(2048)} left`);
    expect(result?.line).toBe(`Syncing ${bytes(2048)} to Laptop`);
  });

  it('puts open conflicts ahead of transfers and says when more are waiting', () => {
    const moving = placed({}, { needBytes: 10 });
    expect(summary([moving], { open: 1, more: false })?.line).toBe('1 conflict waits for you');
    expect(summary([moving], { open: 50, more: true })?.pill).toBe('50+ conflicts');
  });

  it('says how many folders are on hold', () => {
    expect(summary([placed({ hold: 'no_access' })])).toMatchObject({
      tone: 'warning',
      pill: '1 folder on hold',
    });
  });

  it('puts failures ahead of everything else', () => {
    const error = { relPath: null, message: 'Disk full', at: '2026-11-14T08:00:00+00:00' };
    const failed = placed({}, { errors: [error, error] });
    const result = summary([failed, placed({}, { state: 'failed' })], { open: 3, more: false });
    expect(result).toMatchObject({ tone: 'critical', pill: '3 sync problems' });
    expect(result?.line).toBe('Sync failed on Laptop');
  });
});

describe('drive rail', () => {
  it('shows only the lines and badges live rows can back', () => {
    const rail = driveRailOf({
      myDrive: null,
      sharedDrive: null,
      smartFolders: 0,
      sharedWithMe: 0,
      computerProblems: 0,
      trash: { count: 0, more: false },
      sync: null,
    });
    expect(
      Object.values(rail).every((entry) => entry.count === null && entry.detail === null),
    ).toBe(true);
  });

  it('badges shared with me, computer problems and trash, and counts each drive', () => {
    const rail = driveRailOf({
      myDrive: ROOT,
      sharedDrive: { ...ROOT, scope: 'home', ownerProfileId: null, items: 1 },
      smartFolders: 3,
      sharedWithMe: 4,
      computerProblems: 2,
      trash: { count: 50, more: true },
      sync: 'Synced on Laptop · up to date',
    });
    expect(rail.index?.detail).toBe(`${count(12480)} files`);
    expect(rail['shared-drive']?.detail).toBe('1 file');
    expect(rail.shared?.count).toBe(4);
    expect(rail.starred?.detail).toBe('3 smart folders');
    expect(rail.computers).toEqual({ count: 2, detail: 'Synced on Laptop · up to date' });
    expect(rail.trash?.count).toBe(`${count(50)}+`);
  });

  it('groups the rail as the plan lays it out with a usage bar under Storage', () => {
    const groups = driveSectionGroupsOf({}, spaceMeterOf({ used: 10, quota: 100, disk: 1000 }));
    expect(groups.map((group) => group.title)).toEqual([null, 'Activity', 'Computers', 'Space']);
    expect(groups[0]?.sections.map((section) => section.label)).toEqual([
      'My Drive',
      'Shared Drive',
      'Shared with me',
      'Recent',
      'Starred',
    ]);
    const storage = groups[3]?.sections.find((section) => section.id === 'storage');
    expect(isValidElement(storage?.detail)).toBe(true);
  });

  it('measures your drive against your quota, else against the data disk', () => {
    expect(spaceMeterOf({ used: 50, quota: 100, disk: 1000 })).toEqual({
      text: `${bytes(50)} of ${bytes(100)}`,
      share: 0.5,
      colour: 'primary',
    });
    expect(spaceMeterOf({ used: 120, quota: 100, disk: 1000 })).toMatchObject({
      share: 1,
      colour: 'critical',
    });
    expect(spaceMeterOf({ used: 100, quota: null, disk: 1000 })).toEqual({
      text: `${bytes(100)} · no limit`,
      share: 0.1,
      colour: 'primary',
    });
    expect(spaceMeterOf({ used: 100, quota: null, disk: null }).share).toBeNull();
  });
});

describe('drive storage summary', () => {
  it('reads used of the data disk with kind colours', () => {
    const result = storageSummaryOf(STATS);
    expect(result.used).toBe(`${bytes(3072)} of ${bytes(8192)}`);
    expect(result.caption).toBe(`${bytes(4096)} free on the data disk`);
    expect(result.total).toBe(8192);
    expect(result.segments.map((segment) => segment.colour)).toEqual(['viz-1', 'track']);
  });
});

describe('drive section links', () => {
  it('links My Drive to the Drive page and every other section under it', () => {
    expect(driveSectionHref('index')).toBe('/drive');
    expect(driveSectionHref('shared-drive')).toEqual({
      pathname: '/drive/shared-drive',
      params: {},
    });
    expect(driveSectionHref('trash')).toEqual({ pathname: '/drive/trash', params: {} });
    expect(() => driveSectionHref('sync')).toThrow('There is no Drive section sync.');
  });
});

describe('drive header', () => {
  it('keeps every header action secondary so the page primary stays the only one', () => {
    const actions = secondaryActionsOf([
      { icon: 'upload', label: 'Upload' },
      { icon: 'folder', label: 'New', primary: true },
    ]);
    expect(actions.map((action) => action.primary ?? false)).toEqual([false, false]);
  });
});

describe('drive frame', () => {
  it('opens Drive settings on the section that matches the page', () => {
    render({ primary: { label: 'New', icon: 'folder', onPress: vi.fn() } });
    expect(seen.frame?.settings.label).toBe('Drive settings');
    expect(seen.frame?.settings.href).toMatchObject({
      params: { page: ['drive'], focus: 'drive.sync-mount' },
    });
    expect(seen.frame?.primaryAction?.label).toBe('New');
    expect(seen.frame?.title).toBe('Drive');
  });

  it('puts the sync pill in the header status and the drives well in the rail on wide screens', () => {
    seen.placements = [PLACEMENT];
    seen.stats = STATS;
    render();
    expect(isValidElement(seen.status)).toBe(true);
    expect(seen.frame?.summary).toBeDefined();
    expect(seen.frame?.iconRail).toBe(false);
    expect(seen.frame?.sections.map((group) => group.title)).toEqual([
      null,
      'Activity',
      'Computers',
      'Space',
    ]);
  });

  it('badges Computers while a placed folder failed', () => {
    seen.placements = [placed({}, { state: 'failed' })];
    render();
    const computers = seen.frame?.sections[2]?.sections[0];
    expect(computers?.count).toBe(1);
  });

  it('drops to the icon rail when the page asks and below the large width', () => {
    render({ iconRail: true });
    expect(seen.frame?.iconRail).toBe(true);
    seen.width = 'expanded';
    render();
    expect(seen.frame?.iconRail).toBe(true);
  });

  it('keeps the phone header free of the pill and moves the well into the pull-up', () => {
    seen.area = 412;
    seen.width = 'compact';
    render();
    expect(seen.status).toBeNull();
    expect(seen.frame?.summary).toBeUndefined();
    expect(seen.frame?.renderPullUpFooter).toBeTypeOf('function');
    expect(seen.frame?.chips).toBeDefined();
  });

  it('shows the pill only while a folder is placed and links it to Computers', () => {
    expect(renderToStaticMarkup(createElement(SyncPill))).toBe('');
    seen.placements = [PLACEMENT];
    const markup = renderToStaticMarkup(createElement(SyncPill));
    expect(markup).toContain('Up to date');
    expect(markup).toContain('Synced on Laptop · up to date, open Computers');
  });
});
