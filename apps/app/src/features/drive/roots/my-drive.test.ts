import { describe, expect, it } from 'vitest';
import {
  DRIVE_RECENT_ENTRY,
  DRIVE_SHARE,
  DRIVE_SYNC_CLIENT,
  type DriveRecentEntry,
  type DriveStats,
  type DriveSyncClient,
} from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import { startOfDayKey } from '../../../format/time';
import { OTHER_ROOT_ID, ROOT_ID, rootRow } from '../../nas/data/fixtures';
import {
  libraryTilesOf,
  myDriveSubtitleOf,
  phaseLineOf,
  rootGroupsOf,
} from '../screens/my-drive-screen';
import { computerRowsOf, computersLineOf, type KnownComputer } from './computers-strip';
import { OUTSIDE_CAPTION, recentCaptionOf, type RecentNames } from './quick-recent-row';
import {
  activeLinksOf,
  addedThisWeek,
  changeSeriesOf,
  splitFigure,
  statColumnsOf,
  statItemsOf,
  type StatInputs,
} from './stat-strip';

const AT = '2026-11-07T10:00:00.000Z';
const NOW = Date.parse(AT);
const TODAY = '2026-11-07';
const ME = 'c0000000-0000-4000-8000-000000000001';
const SAM = 'c0000000-0000-4000-8000-000000000002';
const LAPTOP = 'b0000000-0000-4000-8000-000000000002';
const OFFICE = 'b0000000-0000-4000-8000-000000000003';
const GIB = 1024 ** 3;

function stats(patch: Partial<DriveStats> = {}): DriveStats {
  return {
    items: 75_186,
    folders: 210,
    bytes: 40 * GIB,
    liveBytes: 40 * GIB,
    versionBytes: 0,
    trashBytes: 0,
    kinds: [],
    roots: [],
    volumes: [
      {
        mountId: 'm1',
        rootIds: [ROOT_ID],
        totalBytes: 100 * GIB,
        freeBytes: 60 * GIB,
        fullInMonths: null,
      },
      {
        mountId: 'm2',
        rootIds: [ROOT_ID],
        totalBytes: 100 * GIB,
        freeBytes: 60 * GIB,
        fullInMonths: null,
      },
    ],
    purges: [],
    growth: [
      { day: '2026-11-07', items: 1, bytes: 1, added: 4, removed: 1 },
      { day: '2026-11-02', items: 1, bytes: 1, added: 10, removed: 0 },
      { day: '2026-10-20', items: 1, bytes: 1, added: 99, removed: 99 },
    ],
    ...patch,
  };
}

function client(deviceId: string, patch: Partial<DriveSyncClient> = {}): DriveSyncClient {
  return DRIVE_SYNC_CLIENT.parse({
    clientId: deviceId.replace('b0000000', 'd0000000'),
    rootId: ROOT_ID,
    deviceId,
    profileId: ME,
    enabled: true,
    selected: [],
    lastSeq: 1,
    lastSeenAt: AT,
    needBytes: 0,
    errors: [],
    ...patch,
  });
}

function inputs(patch: Partial<StatInputs> = {}): StatInputs {
  return {
    stats: stats(),
    roots: [{ ...rootRow(ROOT_ID, 'ready'), synced: true }],
    clients: [client(LAPTOP)],
    sync: {
      tone: 'positive',
      icon: 'circleCheck',
      pill: 'In sync',
      line: 'Up to date on 1 computer',
    },
    links: { active: 4, more: false, opens: 38 },
    today: TODAY,
    stale: false,
    ...patch,
  };
}

describe('stat strip', () => {
  it('splits a size into figure and unit', () => {
    expect(splitFigure(bytes(40 * GIB))).toEqual({ value: '40', unit: 'GB' });
    expect(splitFigure('214')).toEqual({ value: '214' });
  });

  it('shows two tiles a row on the phone, three below the wide rail and five with it', () => {
    expect([400, 800, 1100].map(statColumnsOf)).toEqual([2, 3, 5]);
  });

  it('draws fourteen days of changes ending today with empty days at zero', () => {
    const series = changeSeriesOf(stats().growth ?? [], TODAY);
    expect(series).toHaveLength(14);
    expect(series.at(-1)).toEqual({ t: startOfDayKey(TODAY), v: 5 });
    expect(series.reduce((all, point) => all + point.v, 0)).toBe(15);
    expect(addedThisWeek(stats().growth ?? [], TODAY)).toBe(14);
  });

  it('counts only links that are not revoked or ended', () => {
    const share = (patch: object): ReturnType<typeof DRIVE_SHARE.parse> =>
      DRIVE_SHARE.parse({
        id: 'e0000000-0000-4000-8000-000000000001',
        itemId: 'e0000000-0000-4000-8000-000000000002',
        permission: 'view',
        expiresAt: null,
        hasPassword: false,
        createdBy: ME,
        revokedAt: null,
        opens: 3,
        downloads: 0,
        lastOpenedAt: null,
        ...patch,
      });
    const counts = activeLinksOf(
      [
        share({}),
        share({ revokedAt: AT, opens: 9 }),
        share({ expiresAt: '2026-11-01T00:00:00.000Z' }),
      ],
      true,
      NOW,
    );
    expect(counts).toEqual({ active: 1, more: true, opens: 3 });
  });

  it('builds the five tiles with the used caption and the sync tone', () => {
    const items = statItemsOf(
      inputs({
        sync: {
          tone: 'warning',
          icon: 'warning',
          pill: '1 conflict',
          line: '1 conflict waits for you',
        },
      }),
    );
    expect(items.map((item) => item.key)).toEqual(['files', 'used', 'changes', 'synced', 'links']);
    expect(items[0]?.caption).toBe('14 added this week');
    expect(items[1]).toMatchObject({
      value: '40',
      unit: 'GB',
      caption: `of ${bytes(200 * GIB)} on 2 volumes`,
    });
    expect(items[2]).toMatchObject({ value: '15', caption: 'in 14 days' });
    expect(items[3]).toMatchObject({ value: '1', unit: 'on 1 computer', tone: 'warning' });
    expect(items[4]).toMatchObject({ value: '4', unit: 'active', caption: '38 opens' });
  });

  it('leaves out changes before the drive has history and links before they load', () => {
    const items = statItemsOf(inputs({ stats: stats({ growth: null }), links: null, stale: true }));
    expect(items.map((item) => item.key)).toEqual(['files', 'used', 'synced']);
    expect(items[0]?.caption).toBe('210 folders');
    expect(items.every((item) => item.stale === true)).toBe(true);
  });
});

function entry(raw: object): DriveRecentEntry {
  return DRIVE_RECENT_ENTRY.parse({
    item: {
      id: 'e0000000-0000-4000-8000-000000000009',
      rootId: ROOT_ID,
      parentId: null,
      relPath: 'Budget 2027.xlsx',
      name: 'Budget 2027.xlsx',
      modifiedAt: AT,
      addedAt: AT,
      openedAt: null,
      starred: false,
      rev: 1,
      etag: 'e1',
      outside: false,
      addedByProfileId: null,
      remoteId: null,
      remoteRev: null,
      mime: 'application/vnd.ms-excel',
      bytes: 10,
      sha256: null,
      integrity: 'unknown',
      thumb: { state: 'none' },
      kind: 'document',
    },
    at: '2026-11-07T09:48:00.000Z',
    ...raw,
  });
}

const NAMES: RecentNames = { me: ME, people: { [SAM]: 'Sam' }, devices: { [LAPTOP]: 'Laptop' } };

describe('recent captions', () => {
  const written = { actorProfileId: null, deviceId: null };

  it('names who made the change and when', () => {
    expect(
      recentCaptionOf(
        entry({ kind: 'changed', ...written, actorProfileId: ME, via: 'app' }),
        NAMES,
        NOW,
      ),
    ).toBe('You · 12 min ago');
    expect(
      recentCaptionOf(
        entry({ kind: 'added', ...written, actorProfileId: SAM, via: 'app' }),
        NAMES,
        NOW,
      ),
    ).toBe('Sam · 12 min ago');
    expect(
      recentCaptionOf(
        entry({ kind: 'changed', ...written, deviceId: LAPTOP, via: 'sync' }),
        NAMES,
        NOW,
      ),
    ).toBe('Laptop · 12 min ago');
    expect(recentCaptionOf(entry({ kind: 'changed', ...written, via: 'ai' }), NAMES, NOW)).toBe(
      'AI · 12 min ago',
    );
    expect(recentCaptionOf(entry({ kind: 'opened' }), NAMES, NOW)).toBe('Opened · 12 min ago');
  });

  it('says when a file changed outside SmartEverything', () => {
    expect(
      recentCaptionOf(entry({ kind: 'changed', ...written, via: 'outside' }), NAMES, NOW),
    ).toBe(`${OUTSIDE_CAPTION} · 12 min ago`);
  });
});

describe('computers strip', () => {
  const computers: ReadonlyMap<string, KnownComputer> = new Map([
    [LAPTOP, { deviceId: LAPTOP, name: 'Laptop', online: true, glyph: 'laptop' }],
    [OFFICE, { deviceId: OFFICE, name: 'Office PC', online: false, glyph: 'monitor' }],
  ]);

  it('gives each syncing computer one state across its folders', () => {
    const rows = computerRowsOf(
      [
        client(LAPTOP, { needBytes: GIB }),
        client(OFFICE, { needBytes: GIB }),
        client('b0000000-0000-4000-8000-000000000009', { enabled: false }),
      ],
      [],
      computers,
    );
    expect(rows.map((row) => [row.name, row.state, row.sentence])).toEqual([
      ['Laptop', 'syncing', `Syncing · ${bytes(GIB)} left`],
      ['Office PC', 'offline', `Offline · ${bytes(GIB)} waiting`],
    ]);
  });

  it('puts a failure above a conflict and an unknown computer offline', () => {
    const failing = client(LAPTOP, { errors: [{ relPath: null, message: 'Disk full', at: AT }] });
    expect(computerRowsOf([failing], [], computers)[0]?.state).toBe('failed');
    expect(
      computerRowsOf([client('b0000000-0000-4000-8000-000000000009')], [], computers)[0],
    ).toMatchObject({
      name: 'Unknown computer',
      state: 'offline',
      tone: null,
    });
  });

  it('counts the computers and the ones online', () => {
    const rows = computerRowsOf([client(LAPTOP), client(OFFICE)], [], computers);
    expect(computersLineOf(rows)).toBe('2 computers · 1 online');
  });
});

describe('my drive header and progress', () => {
  it('says the file count with the sync line', () => {
    const root = { ...rootRow(ROOT_ID, 'ready'), items: 75_186 };
    expect(myDriveSubtitleOf([root], 'Everything in sync')).toBe(
      '75,186 files · Everything in sync',
    );
    expect(myDriveSubtitleOf([root], null)).toBe('75,186 files');
  });

  it('keeps private files apart and ends the library folders with the computers card', () => {
    const home = rootRow(ROOT_ID, 'ready');
    const mine = {
      ...rootRow(OTHER_ROOT_ID, 'ready'),
      scope: 'person' as const,
      ownerProfileId: ME,
    };
    const groups = rootGroupsOf([mine, home]);
    expect(groups.mine.map((root) => root.id)).toEqual([mine.id]);
    expect(groups.library.map((root) => root.id)).toEqual([ROOT_ID]);
    expect(libraryTilesOf(groups.library).map((tile) => tile.kind)).toEqual(['root', 'computers']);
  });

  it('says what the hub is doing to a folder', () => {
    expect(phaseLineOf(rootRow(ROOT_ID, 'scanning'), 'scan', { done: 1200, total: 4000 })).toBe(
      'Scanning Photos · 1,200 of 4,000',
    );
  });
});
