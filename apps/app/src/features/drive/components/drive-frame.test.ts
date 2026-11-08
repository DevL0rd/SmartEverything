import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveRoot, DriveStats, DriveSyncClient } from '@smarteverything/domain';
import { useHeaderStatus } from '../../../components/header-status';
import { bytes, count } from '../../../format/number';
import type { LibraryFrameProps } from '../../nas/frame';
import type { DriveFrameProps } from './drive-frame';

interface Seen {
  area: number;
  width: 'compact' | 'medium' | 'expanded' | 'large' | 'xlarge';
  frame: (LibraryFrameProps & { readonly iconRail?: boolean }) | null;
  status: ReactNode;
  clients: DriveSyncClient[];
  stats: DriveStats | undefined;
}

const seen = vi.hoisted((): Seen => ({
  area: 1336,
  width: 'large',
  frame: null,
  status: null,
  clients: [],
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
vi.mock('../../nas/data', () => ({
  useDriveRoots: (): readonly unknown[] => [],
  useDriveAlbums: (): readonly unknown[] => [],
  useDriveSyncClients: (): readonly DriveSyncClient[] => seen.clients,
  useDriveStats: (): { readonly data: DriveStats | undefined } => ({ data: seen.stats }),
  useDriveConflicts: (): { readonly data: undefined; readonly hasNextPage: boolean } => ({
    data: undefined,
    hasNextPage: false,
  }),
  flattenPages: (): readonly unknown[] => [],
}));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/interactive', () => ({
  Interactive: (props: { readonly label: string; readonly children: ReactNode }): ReactNode =>
    createElement('a', { 'aria-label': props.label }, props.children),
}));
vi.mock('../../nas/frame', () => ({
  SummaryWell: ({ title }: { readonly title: string }): ReactNode =>
    createElement('aside', {}, title),
  LibraryFrame: (props: NonNullable<Seen['frame']>): ReactNode => {
    seen.frame = props;
    seen.status = useHeaderStatus();
    return createElement('main', {}, props.children);
  },
}));

const { DriveFrame, driveRailDetailsOf, driveSectionHref, storageSummaryOf } =
  await import('./drive-frame');
const { driveSyncSummaryOf, SyncPill } = await import('./sync-pill');
const { secondaryActionsOf } = await import('./drive-header');

const CLIENT: DriveSyncClient = {
  clientId: '00000000-0000-4000-8000-000000000001',
  rootId: '00000000-0000-4000-8000-0000000000a1',
  deviceId: '00000000-0000-4000-8000-0000000000d1',
  profileId: '00000000-0000-4000-8000-0000000000e1',
  enabled: true,
  selected: [],
  lastSeq: 4,
  lastSeenAt: '2026-11-07T08:00:00+00:00',
  needBytes: 0,
  errors: [],
};

const NONE = { open: 0, more: false };

const ROOT_BASE = {
  scope: 'home',
  ownerProfileId: null,
  indexId: 'index-1',
  state: 'ready',
  stateReason: null,
  folders: 0,
  scannedAt: null,
  health: { hashedShare: 1, verifiedShare: 1, corrupt: 0, lastScrubAt: null, lastBackupAt: null },
  inPhotos: false,
  skipPatterns: [],
  includeHidden: false,
} as const;

const FOLDER: DriveRoot = {
  ...ROOT_BASE,
  id: '00000000-0000-4000-8000-0000000000a1',
  label: 'Media',
  kind: 'folder',
  items: 1000,
  bytes: 1024,
  path: '/srv/media',
  synced: false,
  sync: { ignorePatterns: [], conflictCopies: true, clients: [] },
  readOnly: false,
  versions: true,
  volume: { mountId: 'disk-a', fsType: 'ext4', network: false },
};

const CAMERAS: DriveRoot = {
  ...ROOT_BASE,
  id: '00000000-0000-4000-8000-0000000000a3',
  label: 'Cameras',
  kind: 'cameras',
  items: 1,
  bytes: 1024,
  path: null,
  readOnly: true,
  versions: false,
  synced: false,
  sync: null,
};

const BASE: DriveFrameProps = { section: 'sync', children: 'Body' };

function render(patch: Partial<DriveFrameProps> = {}): string {
  return renderToStaticMarkup(createElement(DriveFrame, { ...BASE, ...patch }));
}

beforeEach(() => {
  seen.area = 1336;
  seen.width = 'large';
  seen.frame = null;
  seen.status = null;
  seen.clients = [];
  seen.stats = undefined;
});

describe('drive sync summary', () => {
  it('has nothing to say while no computer syncs', () => {
    expect(driveSyncSummaryOf([], NONE)).toBeNull();
    expect(driveSyncSummaryOf([{ ...CLIENT, enabled: false }], NONE)).toBeNull();
  });

  it('counts each computer once when everything is up to date', () => {
    const other = { ...CLIENT, rootId: '00000000-0000-4000-8000-0000000000a2' };
    expect(driveSyncSummaryOf([CLIENT, other], NONE)).toEqual({
      tone: 'positive',
      icon: 'circleCheck',
      pill: 'In sync',
      line: 'Up to date on 1 computer',
    });
  });

  it('sums what is left to move over the computers still catching up', () => {
    const laptop = { ...CLIENT, deviceId: '00000000-0000-4000-8000-0000000000d2', needBytes: 2048 };
    const summary = driveSyncSummaryOf([CLIENT, laptop, { ...laptop, needBytes: 1024 }], NONE);
    expect(summary?.tone).toBe('info');
    expect(summary?.pill).toBe(`${bytes(3072)} left`);
    expect(summary?.line).toBe(`Syncing ${bytes(3072)} to 1 computer`);
  });

  it('puts open conflicts ahead of transfers and says when more are waiting', () => {
    const moving = { ...CLIENT, needBytes: 10 };
    expect(driveSyncSummaryOf([moving], { open: 1, more: false })?.line).toBe(
      '1 conflict waits for you',
    );
    expect(driveSyncSummaryOf([moving], { open: 50, more: true })?.pill).toBe('50+ conflicts');
  });

  it('puts failures ahead of everything else', () => {
    const error = { relPath: null, message: 'Disk full', at: '2026-11-07T08:00:00+00:00' };
    const summary = driveSyncSummaryOf([{ ...CLIENT, errors: [error, error] }], {
      open: 3,
      more: false,
    });
    expect(summary).toMatchObject({ tone: 'critical', pill: '2 sync problems' });
    expect(summary?.line).toBe('Sync failed on 1 computer');
  });
});

describe('drive rail details', () => {
  it('shows only the lines live rows can back', () => {
    expect(driveRailDetailsOf({ roots: [], smartFolders: 0, computers: 0, sync: null })).toEqual(
      {},
    );
    expect(
      driveRailDetailsOf({ roots: [], smartFolders: 3, computers: 2, sync: 'In sync' }),
    ).toEqual({ starred: '3 smart folders', computers: '2 computers', sync: 'In sync' });
  });

  it('counts files and space over every root and volumes only where a root has one', () => {
    const details = driveRailDetailsOf({
      roots: [FOLDER, { ...FOLDER, id: '00000000-0000-4000-8000-0000000000a2' }, CAMERAS],
      smartFolders: 0,
      computers: 0,
      sync: null,
    });
    expect(details.index).toBe(`${count(2001)} files`);
    expect(details.storage).toBe(`${bytes(3072)} used · 1 volume`);
  });
});

describe('drive storage summary', () => {
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
    volumes: [
      {
        mountId: 'disk-a',
        rootIds: ['00000000-0000-4000-8000-0000000000a1'],
        totalBytes: 8192,
        freeBytes: 4096,
        fullInMonths: null,
      },
    ],
    purges: [],
    growth: null,
  };

  it('reads used of total over the volumes with kind colours', () => {
    const summary = storageSummaryOf(STATS);
    expect(summary.used).toBe(`${bytes(3072)} of ${bytes(8192)}`);
    expect(summary.caption).toBe(`1 volume · ${bytes(4096)} free`);
    expect(summary.total).toBe(8192);
    expect(summary.segments.map((segment) => segment.colour)).toEqual(['viz-1', 'track']);
  });

  it('says only what is used while the hub reports no volume', () => {
    const summary = storageSummaryOf({ ...STATS, volumes: [] });
    expect(summary).toMatchObject({ used: `${bytes(3072)} used`, caption: null, total: undefined });
  });
});

describe('drive section links', () => {
  it('links My Drive to the drive root and every other section under it', () => {
    expect(driveSectionHref('index')).toBe('/drive');
    expect(driveSectionHref('trash')).toEqual({ pathname: '/drive/trash', params: {} });
    expect(() => driveSectionHref('photos')).toThrow('There is no Drive section photos.');
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
    expect(seen.frame?.settings?.label).toBe('Drive settings');
    expect(seen.frame?.settings?.href).toMatchObject({
      params: { page: ['drive'], focus: 'drive.sync-mount' },
    });
    expect(seen.frame?.primaryAction?.label).toBe('New');
    expect(seen.frame?.title).toBe('Drive');
  });

  it('puts the sync pill in the header status and the storage well in the rail on wide screens', () => {
    render();
    expect(isValidElement(seen.status)).toBe(true);
    expect(seen.frame?.summary).toBeDefined();
    expect(seen.frame?.iconRail).toBe(false);
    expect(seen.frame?.sections.map((group) => group.title)).toEqual([null, 'Computers', 'Space']);
  });

  it('drops to the icon rail when the page asks and below the large width', () => {
    render({ iconRail: true });
    expect(seen.frame?.iconRail).toBe(true);
    seen.width = 'expanded';
    render();
    expect(seen.frame?.iconRail).toBe(true);
  });

  it('keeps the phone header free of the pill and moves the wells into the pull-up', () => {
    seen.area = 412;
    seen.width = 'compact';
    render();
    expect(seen.status).toBeNull();
    expect(seen.frame?.summary).toBeUndefined();
    expect(seen.frame?.renderPullUpFooter).toBeTypeOf('function');
    expect(seen.frame?.chips).toBeDefined();
  });

  it('shows the pill only while a computer syncs and links it to Sync', () => {
    expect(renderToStaticMarkup(createElement(SyncPill))).toBe('');
    seen.clients = [CLIENT];
    const markup = renderToStaticMarkup(createElement(SyncPill));
    expect(markup).toContain('In sync');
    expect(markup).toContain('Up to date on 1 computer, open Sync');
  });
});
