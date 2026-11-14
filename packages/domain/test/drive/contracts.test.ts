import { describe, expect, it } from 'vitest';
import { DRIVE_CHANGE, DRIVE_CHANGE_RESULT } from '../../src/drive/change';
import { DRIVE_CONFLICT, DRIVE_CONFLICT_RESOLVE } from '../../src/drive/conflict';
import { DRIVE_FEED_PAGE, DRIVE_FEED_ROW } from '../../src/drive/feed';
import { DRIVE_BACKUP_STATUS, DRIVE_HEALTH, DRIVE_SCRUB_STATE } from '../../src/drive/health';
import { DRIVE_QUERY, DRIVE_QUERY_PAGE, driveDurationBucket } from '../../src/drive/query';
import { DRIVE_QUOTA, DRIVE_QUOTA_SET } from '../../src/drive/quota';
import { DRIVE_RECENT_ENTRY, DRIVE_RECENT_QUERY } from '../../src/drive/recent';
import { DRIVE_SETTINGS, DRIVE_SETTINGS_UPDATE } from '../../src/drive/settings';
import { DRIVE_SHARE, DRIVE_SHARE_CREATE, DRIVE_SHARE_CREATED } from '../../src/drive/share';
import { DRIVE_STATS, driveHistoryShown } from '../../src/drive/stats';
import { DRIVE_UPLOAD } from '../../src/drive/upload';
import { DRIVE_USAGE } from '../../src/drive/usage';
import { DRIVE_VERSION } from '../../src/drive/version';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const AT = '2026-11-07T10:00:00.000Z';
const LATER = '2026-11-08T10:00:00.000Z';
const SHA = 'a'.repeat(64);

const ITEM = {
  id: A,
  rootId: B,
  parentId: null,
  relPath: 'a.pdf',
  name: 'a.pdf',
  modifiedAt: AT,
  addedAt: AT,
  openedAt: null,
  starred: false,
  shared: false,
  rev: 1,
  etag: '1-abc',
  outside: false,
  addedByProfileId: null,
  remoteId: null,
  remoteRev: null,
  kind: 'document',
  mime: 'application/pdf',
  bytes: 5,
  sha256: SHA,
  integrity: 'unknown',
  thumb: { state: 'none' },
};

const FEED_ROW = {
  seq: 1,
  rootId: B,
  itemId: A,
  op: 'create',
  rev: 1,
  at: AT,
  actorProfileId: C,
  via: 'app',
  deviceId: null,
};

describe('DRIVE_CHANGE', () => {
  it('accepts every action with its own fields', () => {
    const changes = [
      { action: 'new_folder', parent: { kind: 'folder', folderId: A }, name: 'Taxes' },
      { action: 'new_folder', parent: { kind: 'drive', rootId: B }, name: 'Taxes' },
      { action: 'rename', itemId: A, name: 'b.pdf' },
      { action: 'move', itemIds: [A], toFolderId: B },
      { action: 'copy', itemIds: [A, B], toFolderId: C },
      { action: 'star', itemIds: [A] },
      { action: 'unstar', itemIds: [A] },
      { action: 'trash', itemIds: [A] },
      { action: 'restore', itemIds: [A] },
      { action: 'delete_now', itemIds: [A] },
      { action: 'album_add', albumId: B, itemIds: [A] },
      { action: 'album_remove', albumId: B, itemIds: [A] },
      { action: 'keep_source_item', itemId: A, toFolderId: B },
    ];
    for (const change of changes) {
      expect(DRIVE_CHANGE.safeParse(change).success, change.action).toBe(true);
    }
  });

  it('refuses an unknown action, including rotate', () => {
    expect(DRIVE_CHANGE.safeParse({ action: 'rotate', itemId: A, degrees: 90 }).success).toBe(
      false,
    );
    expect(DRIVE_CHANGE.safeParse({ action: 'purge', itemIds: [A] }).success).toBe(false);
  });

  it('refuses extra fields and empty selections', () => {
    expect(DRIVE_CHANGE.safeParse({ action: 'star', itemIds: [A], note: 'x' }).success).toBe(false);
    expect(DRIVE_CHANGE.safeParse({ action: 'trash', itemIds: [] }).success).toBe(false);
    expect(DRIVE_CHANGE.safeParse({ action: 'move', itemIds: [A] }).success).toBe(false);
  });

  it('refuses names that could leave their folder', () => {
    for (const name of ['', '  ', 'a/b', '..', '.', 'a\0b', 'x'.repeat(256)]) {
      expect(DRIVE_CHANGE.safeParse({ action: 'rename', itemId: A, name }).success, name).toBe(
        false,
      );
    }
    expect(DRIVE_CHANGE.safeParse({ action: 'rename', itemId: A, name: ' a ' }).data).toEqual({
      action: 'rename',
      itemId: A,
      name: 'a',
    });
  });
});

describe('DRIVE_CHANGE_RESULT', () => {
  it('carries done, failed and conflicts', () => {
    expect(
      DRIVE_CHANGE_RESULT.safeParse({
        done: [{ itemId: A, resultItemId: B }],
        failed: [{ itemId: null, reason: 'parent is read-only' }],
        conflicts: [{ itemId: A, name: 'a.pdf', existingItemId: C }],
      }).success,
    ).toBe(true);
  });

  it('refuses a failure without a reason', () => {
    expect(
      DRIVE_CHANGE_RESULT.safeParse({
        done: [],
        failed: [{ itemId: A, reason: '' }],
        conflicts: [],
      }).success,
    ).toBe(false);
  });
});

describe('DRIVE_FEED_ROW', () => {
  it('accepts an app change by a person', () => {
    expect(DRIVE_FEED_ROW.safeParse(FEED_ROW).success).toBe(true);
  });

  it('accepts every via and refuses an unknown one', () => {
    for (const via of ['app', 'ai', 'automation', 'share']) {
      expect(DRIVE_FEED_ROW.safeParse({ ...FEED_ROW, via }).success, via).toBe(true);
    }
    expect(DRIVE_FEED_ROW.safeParse({ ...FEED_ROW, via: 'sneakernet' }).success).toBe(false);
  });

  it('gives a scan or outside change no acting person', () => {
    expect(DRIVE_FEED_ROW.safeParse({ ...FEED_ROW, via: 'scan' }).success).toBe(false);
    expect(DRIVE_FEED_ROW.safeParse({ ...FEED_ROW, via: 'outside' }).success).toBe(false);
    expect(
      DRIVE_FEED_ROW.safeParse({ ...FEED_ROW, via: 'outside', actorProfileId: null }).success,
    ).toBe(true);
  });

  it('names the device of a mount or sync change', () => {
    expect(DRIVE_FEED_ROW.safeParse({ ...FEED_ROW, via: 'mount' }).success).toBe(false);
    expect(DRIVE_FEED_ROW.safeParse({ ...FEED_ROW, via: 'sync', deviceId: A }).success).toBe(true);
  });

  it('pages rows with the index id and the next cursor', () => {
    expect(DRIVE_FEED_PAGE.safeParse({ indexId: 'idx', rows: [FEED_ROW], cursor: 1 }).success).toBe(
      true,
    );
    expect(DRIVE_FEED_PAGE.safeParse({ rows: [FEED_ROW], cursor: 1 }).success).toBe(false);
  });
});

describe('DRIVE_CONFLICT', () => {
  const open = {
    id: A,
    rootId: B,
    itemId: C,
    conflictItemId: B,
    relPath: 'a.txt',
    conflictRelPath: 'a.sync-conflict-20261107-100000-laptop.txt',
    hubRev: 3,
    baseRev: 2,
    deviceId: A,
    profileId: null,
    at: AT,
    resolvedAt: null,
    resolution: null,
  };

  it('accepts an open and a resolved conflict', () => {
    expect(DRIVE_CONFLICT.safeParse(open).success).toBe(true);
    expect(
      DRIVE_CONFLICT.safeParse({ ...open, resolvedAt: LATER, resolution: 'keep_both' }).success,
    ).toBe(true);
  });

  it('refuses a resolution without a time and a time without a resolution', () => {
    expect(DRIVE_CONFLICT.safeParse({ ...open, resolution: 'keep_hub' }).success).toBe(false);
    expect(DRIVE_CONFLICT.safeParse({ ...open, resolvedAt: LATER }).success).toBe(false);
  });

  it('knows exactly three resolutions', () => {
    for (const resolution of ['keep_hub', 'keep_client', 'keep_both']) {
      expect(DRIVE_CONFLICT_RESOLVE.safeParse({ conflictId: A, resolution }).success).toBe(true);
    }
    expect(DRIVE_CONFLICT_RESOLVE.safeParse({ conflictId: A, resolution: 'merge' }).success).toBe(
      false,
    );
  });
});

describe('DRIVE_QUERY', () => {
  const query = {
    text: null,
    rootId: null,
    folderId: null,
    kinds: null,
    starred: null,
    duration: null,
    taken: null,
    sort: { field: 'modifiedAt', direction: 'desc' },
    cursor: null,
  };

  it('accepts a query with every filter set', () => {
    expect(
      DRIVE_QUERY.safeParse({
        text: 'plumber',
        rootId: A,
        folderId: B,
        kinds: ['video', 'document'],
        starred: true,
        duration: '10_to_60m',
        taken: { from: '2026-01-01', to: '2026-02-01' },
        sort: { field: 'bytes', direction: 'asc' },
        cursor: 'abc',
      }).success,
    ).toBe(true);
  });

  it('needs every field, so a missing filter is never hidden', () => {
    const { starred: _starred, ...partial } = query;
    expect(DRIVE_QUERY.safeParse(query).success).toBe(true);
    expect(DRIVE_QUERY.safeParse(partial).success).toBe(false);
  });

  it('refuses an unknown duration bucket, kind, sort field and backwards range', () => {
    expect(DRIVE_QUERY.safeParse({ ...query, duration: 'forever' }).success).toBe(false);
    expect(DRIVE_QUERY.safeParse({ ...query, kinds: ['hologram'] }).success).toBe(false);
    expect(DRIVE_QUERY.safeParse({ ...query, kinds: [] }).success).toBe(false);
    expect(
      DRIVE_QUERY.safeParse({ ...query, sort: { field: 'colour', direction: 'asc' } }).success,
    ).toBe(false);
    expect(
      DRIVE_QUERY.safeParse({ ...query, taken: { from: '2026-02-01', to: '2026-01-01' } }).success,
    ).toBe(false);
  });

  it('buckets durations at one, ten and sixty minutes', () => {
    expect(driveDurationBucket(0)).toBe('under_1m');
    expect(driveDurationBucket(59_999)).toBe('under_1m');
    expect(driveDurationBucket(60_000)).toBe('1_to_10m');
    expect(driveDurationBucket(599_999)).toBe('1_to_10m');
    expect(driveDurationBucket(600_000)).toBe('10_to_60m');
    expect(driveDurationBucket(3_599_999)).toBe('10_to_60m');
    expect(driveDurationBucket(3_600_000)).toBe('over_60m');
  });

  it('pages items with a next cursor', () => {
    expect(DRIVE_QUERY_PAGE.safeParse({ items: [ITEM], next: null }).success).toBe(true);
    expect(
      DRIVE_QUERY_PAGE.safeParse({ items: [{ ...ITEM, kind: 'hologram' }], next: null }).success,
    ).toBe(false);
  });
});

describe('DRIVE_RECENT_ENTRY', () => {
  it('never says who opened a file', () => {
    expect(DRIVE_RECENT_ENTRY.safeParse({ kind: 'opened', item: ITEM, at: AT }).success).toBe(true);
    expect(
      DRIVE_RECENT_ENTRY.safeParse({
        kind: 'opened',
        item: ITEM,
        at: AT,
        actorProfileId: C,
      }).success,
    ).toBe(false);
  });

  it('says who added or changed a file and how', () => {
    for (const kind of ['added', 'changed']) {
      expect(
        DRIVE_RECENT_ENTRY.safeParse({
          kind,
          item: ITEM,
          at: AT,
          actorProfileId: null,
          via: 'automation',
          deviceId: null,
        }).success,
        kind,
      ).toBe(true);
    }
    expect(DRIVE_RECENT_ENTRY.safeParse({ kind: 'changed', item: ITEM, at: AT }).success).toBe(
      false,
    );
  });

  it('filters by everything, opened, added or changed only', () => {
    for (const filter of ['everything', 'opened', 'added', 'changed']) {
      expect(DRIVE_RECENT_QUERY.safeParse({ filter, cursor: null }).success, filter).toBe(true);
    }
    expect(DRIVE_RECENT_QUERY.safeParse({ filter: 'starred', cursor: null }).success).toBe(false);
  });
});

describe('DRIVE_STATS', () => {
  const stats = {
    items: 10,
    folders: 2,
    bytes: 100,
    liveBytes: 80,
    versionBytes: 15,
    trashBytes: 5,
    kinds: [{ kind: 'image', items: 4, bytes: 60 }],
    roots: [
      {
        rootId: A,
        items: 10,
        folders: 2,
        bytes: 100,
        kinds: [{ kind: 'image', items: 4, bytes: 60 }],
      },
    ],
    space: { totalBytes: 1000, freeBytes: 400, fsType: 'btrfs' },
    fullInMonths: null,
    purges: [{ month: '2027-03', trashBytes: 5, versionBytes: 0 }],
    growth: null,
  };

  it('accepts the storage half and hides growth with null', () => {
    expect(DRIVE_STATS.safeParse(stats).success).toBe(true);
    expect(
      DRIVE_STATS.safeParse({
        ...stats,
        growth: [{ day: '2026-11-07', items: 10, bytes: 100, added: 1, removed: 0 }],
      }).success,
    ).toBe(true);
  });

  it('counts no folder kind and no unknown kind among stored bytes', () => {
    expect(
      DRIVE_STATS.safeParse({ ...stats, kinds: [{ kind: 'folder', items: 1, bytes: 0 }] }).success,
    ).toBe(false);
  });

  it('refuses free space above the data disk size and a bad purge month', () => {
    expect(
      DRIVE_STATS.safeParse({
        ...stats,
        space: { totalBytes: 10, freeBytes: 11, fsType: 'btrfs' },
      }).success,
    ).toBe(false);
    expect(
      DRIVE_STATS.safeParse({
        ...stats,
        purges: [{ month: '2027-13', trashBytes: 0, versionBytes: 0 }],
      }).success,
    ).toBe(false);
  });

  it('shows history charts only once the library spans two whole months', () => {
    expect(driveHistoryShown('2026-09-07', '2026-11-07')).toBe(true);
    expect(driveHistoryShown('2026-09-07', '2026-11-06')).toBe(false);
    expect(driveHistoryShown('2026-10-01', '2026-11-30')).toBe(false);
    expect(driveHistoryShown('2025-12-31', '2026-02-28')).toBe(false);
    expect(driveHistoryShown('2025-12-15', '2026-02-15')).toBe(true);
    expect(driveHistoryShown('2026-11-07', '2026-11-07')).toBe(false);
  });
});

describe('DRIVE_VERSION', () => {
  const version = {
    id: A,
    itemId: B,
    rev: 2,
    sha256: SHA,
    bytes: 10,
    at: AT,
    purgeAt: '2027-11-07T10:00:00.000Z',
    actorProfileId: C,
    via: 'app',
    deviceId: null,
    addedByProfileId: null,
  };

  it('accepts a version charged to nobody or to a person', () => {
    expect(DRIVE_VERSION.safeParse(version).success).toBe(true);
    expect(DRIVE_VERSION.safeParse({ ...version, addedByProfileId: C }).success).toBe(true);
  });

  it('needs the added-by field, a real hash and a later purge', () => {
    const { addedByProfileId: _added, ...without } = version;
    expect(DRIVE_VERSION.safeParse(without).success).toBe(false);
    expect(DRIVE_VERSION.safeParse({ ...version, sha256: 'xyz' }).success).toBe(false);
    expect(DRIVE_VERSION.safeParse({ ...version, purgeAt: AT }).success).toBe(false);
  });
});

describe('DRIVE_SHARE', () => {
  const share = {
    id: A,
    itemId: B,
    permission: 'view',
    expiresAt: null,
    hasPassword: false,
    createdBy: C,
    revokedAt: null,
    opens: 0,
    downloads: 0,
    lastOpenedAt: null,
  };

  it('accepts a share and refuses an unknown permission or counter below zero', () => {
    expect(DRIVE_SHARE.safeParse(share).success).toBe(true);
    expect(DRIVE_SHARE.safeParse({ ...share, permission: 'edit' }).success).toBe(false);
    expect(DRIVE_SHARE.safeParse({ ...share, opens: -1 }).success).toBe(false);
  });

  it('creates with an optional expiry and password, never a stored hash', () => {
    const create = { itemId: A, permission: 'download', expiresAt: LATER, password: 'pw' };
    expect(DRIVE_SHARE_CREATE.safeParse(create).success).toBe(true);
    expect(DRIVE_SHARE_CREATE.safeParse({ ...create, password: '' }).success).toBe(false);
    expect(DRIVE_SHARE_CREATE.safeParse({ ...create, tokenHash: 'x' }).success).toBe(false);
  });

  it('answers a created share with its link and whether it works off the network', () => {
    expect(
      DRIVE_SHARE_CREATED.safeParse({ share, url: 'https://hub.example/s/abc', public: true })
        .success,
    ).toBe(true);
    expect(DRIVE_SHARE_CREATED.safeParse({ share, url: 'not a url', public: true }).success).toBe(
      false,
    );
  });
});

describe('DRIVE_QUOTA and DRIVE_USAGE', () => {
  it('sets or clears a quota', () => {
    expect(DRIVE_QUOTA.safeParse({ profileId: A, bytes: 100 }).success).toBe(true);
    expect(DRIVE_QUOTA.safeParse({ profileId: A, bytes: null }).success).toBe(false);
    expect(DRIVE_QUOTA_SET.safeParse({ profileId: A, bytes: null }).success).toBe(true);
    expect(DRIVE_QUOTA_SET.safeParse({ profileId: A, bytes: -1 }).success).toBe(false);
  });

  it('counts live, versions and trash for a person or for unattributed files', () => {
    expect(
      DRIVE_USAGE.safeParse({ profileId: A, items: 4, folders: 1, live: 1, versions: 2, trash: 3 })
        .success,
    ).toBe(true);
    expect(
      DRIVE_USAGE.safeParse({
        profileId: null,
        items: 0,
        folders: 0,
        live: 1,
        versions: 0,
        trash: 0,
      }).success,
    ).toBe(true);
    expect(DRIVE_USAGE.safeParse({ profileId: A, live: 1, versions: 2 }).success).toBe(false);
  });
});

describe('DRIVE_UPLOAD', () => {
  const upload = {
    id: A,
    rootId: B,
    target: { kind: 'folder', folderId: C },
    name: 'trip.mov',
    length: 100,
    offset: 40,
    state: 'open',
    failureReason: null,
    profileId: C,
    clientId: A,
    nodeId: null,
    createdAt: AT,
    expiresAt: LATER,
  };

  it('accepts a folder upload and a replace upload with a base rev', () => {
    expect(DRIVE_UPLOAD.safeParse(upload).success).toBe(true);
    expect(
      DRIVE_UPLOAD.safeParse({
        ...upload,
        target: { kind: 'item', itemId: A, baseRev: 3 },
        clientId: null,
        nodeId: B,
      }).success,
    ).toBe(true);
    expect(DRIVE_UPLOAD.safeParse({ ...upload, target: { kind: 'item', itemId: A } }).success).toBe(
      false,
    );
  });

  it('belongs to exactly one client or node', () => {
    expect(DRIVE_UPLOAD.safeParse({ ...upload, clientId: null }).success).toBe(false);
    expect(DRIVE_UPLOAD.safeParse({ ...upload, nodeId: B }).success).toBe(false);
  });

  it('keeps the offset inside the length and the expiry after creation', () => {
    expect(DRIVE_UPLOAD.safeParse({ ...upload, offset: 101 }).success).toBe(false);
    expect(DRIVE_UPLOAD.safeParse({ ...upload, expiresAt: AT }).success).toBe(false);
  });

  it('gives only a failed upload a reason', () => {
    expect(DRIVE_UPLOAD.safeParse({ ...upload, failureReason: 'no space' }).success).toBe(false);
    expect(DRIVE_UPLOAD.safeParse({ ...upload, state: 'failed' }).success).toBe(false);
    expect(
      DRIVE_UPLOAD.safeParse({ ...upload, state: 'failed', failureReason: 'no space' }).success,
    ).toBe(true);
  });
});

describe('health', () => {
  it('describes an idle, running and stopped scrub', () => {
    expect(
      DRIVE_SCRUB_STATE.safeParse({ state: 'idle', lastFinishedAt: null, corrupt: 0 }).success,
    ).toBe(true);
    const progress = { startedAt: AT, checked: 3, total: 10, corrupt: 0 };
    expect(DRIVE_SCRUB_STATE.safeParse({ state: 'running', ...progress }).success).toBe(true);
    expect(DRIVE_SCRUB_STATE.safeParse({ state: 'stopped', ...progress }).success).toBe(true);
    expect(
      DRIVE_SCRUB_STATE.safeParse({ state: 'running', ...progress, checked: 11 }).success,
    ).toBe(false);
    expect(DRIVE_SCRUB_STATE.safeParse({ state: 'paused', ...progress }).success).toBe(false);
  });

  it('reports the library health card facts', () => {
    const health = {
      hashedShare: 0.5,
      verifiedShare: 0.25,
      corrupt: 1,
      rootsTotal: 3,
      rootsUnavailable: 1,
      watcher: 'watching',
      space: { totalBytes: 1000, freeBytes: 100, fsType: 'btrfs' },
      scrub: { state: 'idle', lastFinishedAt: null, corrupt: 1 },
      backup: DRIVE_BACKUP_STATUS.parse({ last: null, lastOkAt: null }),
    };
    expect(DRIVE_HEALTH.safeParse(health).success).toBe(true);
    expect(DRIVE_HEALTH.safeParse({ ...health, rootsUnavailable: 4 }).success).toBe(false);
    expect(DRIVE_HEALTH.safeParse({ ...health, verifiedShare: 1.5 }).success).toBe(false);
    expect(DRIVE_HEALTH.safeParse({ ...health, watcher: 'asleep' }).success).toBe(false);
  });

  it('records a backup report the owner job sends', () => {
    expect(
      DRIVE_BACKUP_STATUS.safeParse({
        last: { at: AT, reporter: 'nightly', bytes: 10, ok: false },
        lastOkAt: null,
      }).success,
    ).toBe(true);
  });
});

describe('DRIVE_SETTINGS', () => {
  const settings = {
    uploadExpiryDays: 7,
    membersMayShare: false,
    duplicatesHashing: true,
    indexingPaused: false,
  };

  it('has no defaults, so a missing setting is refused', () => {
    expect(DRIVE_SETTINGS.safeParse(settings).success).toBe(true);
    const { indexingPaused: _paused, ...without } = settings;
    expect(DRIVE_SETTINGS.safeParse(without).success).toBe(false);
    expect(DRIVE_SETTINGS.safeParse({ ...settings, uploadExpiryDays: 0 }).success).toBe(false);
    expect(DRIVE_SETTINGS.safeParse({ ...settings, extra: true }).success).toBe(false);
  });

  it('updates one or more settings and refuses an empty update', () => {
    expect(DRIVE_SETTINGS_UPDATE.safeParse({ membersMayShare: true }).success).toBe(true);
    expect(DRIVE_SETTINGS_UPDATE.safeParse({}).success).toBe(false);
    expect(DRIVE_SETTINGS_UPDATE.safeParse({ unknown: true }).success).toBe(false);
  });
});
