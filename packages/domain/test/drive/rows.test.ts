import { describe, expect, it } from 'vitest';
import { DRIVE_ALBUM } from '../../src/drive/album';
import { DRIVE_ITEM } from '../../src/drive/item';
import { DRIVE_DATA_SPACE, DRIVE_ROOT } from '../../src/drive/root';
import { SMART_RULE } from '../../src/drive/smart-rule';
import { DRIVE_TRASH_ENTRY } from '../../src/drive/trash';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const AT = '2026-11-07T10:00:00.000Z';
const SHA = 'a'.repeat(64);

const HEALTH = {
  hashedShare: 0.5,
  verifiedShare: 0.25,
  corrupt: 0,
  lastScrubAt: null,
  lastBackupAt: null,
};

const ROOT = {
  id: A,
  scope: 'home',
  ownerProfileId: null,
  indexId: 'idx',
  state: 'ready',
  stateReason: null,
  items: 3,
  folders: 1,
  bytes: 10,
  scannedAt: AT,
  health: HEALTH,
  versions: true,
  skipPatterns: [],
  includeHidden: false,
};

const BASE_ITEM = {
  id: A,
  rootId: B,
  parentId: null,
  relPath: 'a.jpg',
  name: 'a.jpg',
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
};

const IMAGE_ITEM = {
  ...BASE_ITEM,
  kind: 'image',
  mime: 'image/jpeg',
  bytes: 5,
  sha256: SHA,
  integrity: 'unknown',
  thumb: { state: 'none' },
  takenAt: AT,
  width: 10,
  height: 20,
  orientation: 1,
  camera: { make: 'X', model: 'Y', lens: null },
  exposure: { iso: 100, aperture: 2.8, shutter: 0.01, focal: 35 },
  place: { lat: 1, lon: 2 },
};

describe('DRIVE_ITEM', () => {
  it('carries the profile that added the item or null', () => {
    expect(DRIVE_ITEM.safeParse(IMAGE_ITEM).success).toBe(true);
    expect(DRIVE_ITEM.safeParse({ ...IMAGE_ITEM, addedByProfileId: C }).success).toBe(true);
  });

  it('says whether the item is shared and refuses a missing flag', () => {
    expect(DRIVE_ITEM.safeParse({ ...IMAGE_ITEM, shared: true }).success).toBe(true);
    const { shared: _omitted, ...without } = IMAGE_ITEM;
    expect(DRIVE_ITEM.safeParse(without).success).toBe(false);
  });

  it('requires addedByProfileId and refuses a non-uuid', () => {
    const { addedByProfileId: _omitted, ...without } = IMAGE_ITEM;
    expect(DRIVE_ITEM.safeParse(without).success).toBe(false);
    expect(DRIVE_ITEM.safeParse({ ...IMAGE_ITEM, addedByProfileId: 'x' }).success).toBe(false);
  });
});

describe('DRIVE_ROOT', () => {
  it('accepts the shared drive and a personal drive', () => {
    expect(DRIVE_ROOT.safeParse(ROOT).success).toBe(true);
    expect(DRIVE_ROOT.safeParse({ ...ROOT, scope: 'person', ownerProfileId: C }).success).toBe(
      true,
    );
  });

  it('ties the owner to the person scope', () => {
    expect(DRIVE_ROOT.safeParse({ ...ROOT, scope: 'person' }).success).toBe(false);
    expect(DRIVE_ROOT.safeParse({ ...ROOT, ownerProfileId: C }).success).toBe(false);
  });

  it('knows only the states scanning, ready, unresponsive and error', () => {
    for (const state of ['scanning', 'ready', 'unresponsive', 'error']) {
      expect(DRIVE_ROOT.safeParse({ ...ROOT, state }).success, state).toBe(true);
    }
    expect(DRIVE_ROOT.safeParse({ ...ROOT, state: 'offline' }).success).toBe(false);
  });

  it('carries no kind, label, path, read-only flag, sync, volume or Photos flag', () => {
    for (const field of [
      { kind: 'managed' },
      { label: 'Photos' },
      { path: '/data/drive' },
      { readOnly: false },
      { synced: false },
      { sync: null },
      { volume: null },
      { inPhotos: true },
    ]) {
      expect(DRIVE_ROOT.safeParse({ ...ROOT, ...field }).success, Object.keys(field)[0]).toBe(
        false,
      );
    }
  });

  it('refuses unknown fields and missing fields', () => {
    expect(DRIVE_ROOT.safeParse({ ...ROOT, extra: 1 }).success).toBe(false);
    const { includeHidden: _omitted, ...missing } = ROOT;
    expect(DRIVE_ROOT.safeParse(missing).success).toBe(false);
  });
});

describe('DRIVE_DATA_SPACE', () => {
  it('holds the data folder disk and refuses free space above its size', () => {
    const space = { totalBytes: 100, freeBytes: 40, fsType: 'btrfs' };
    expect(DRIVE_DATA_SPACE.safeParse(space).success).toBe(true);
    expect(DRIVE_DATA_SPACE.safeParse({ ...space, freeBytes: 101 }).success).toBe(false);
    expect(DRIVE_DATA_SPACE.safeParse({ ...space, fsType: '' }).success).toBe(false);
    expect(DRIVE_DATA_SPACE.safeParse({ ...space, mountId: '1' }).success).toBe(false);
  });
});

describe('DRIVE_ITEM', () => {
  it('accepts every kind', () => {
    const file = {
      ...BASE_ITEM,
      mime: 'x/y',
      bytes: 1,
      sha256: null,
      integrity: 'ok',
      thumb: { state: 'none' },
    };
    expect(DRIVE_ITEM.safeParse(IMAGE_ITEM).success).toBe(true);
    expect(
      DRIVE_ITEM.safeParse({ ...BASE_ITEM, kind: 'folder', childCount: 2, bytes: 3 }).success,
    ).toBe(true);
    expect(DRIVE_ITEM.safeParse({ ...IMAGE_ITEM, kind: 'video', durationMs: 5 }).success).toBe(
      true,
    );
    expect(
      DRIVE_ITEM.safeParse({ ...file, kind: 'audio', takenAt: null, durationMs: null }).success,
    ).toBe(true);
    expect(DRIVE_ITEM.safeParse({ ...file, kind: 'document' }).success).toBe(true);
    expect(DRIVE_ITEM.safeParse({ ...file, kind: 'other' }).success).toBe(true);
  });

  it('refuses media fields on a document and a missing duration on a video', () => {
    expect(DRIVE_ITEM.safeParse({ ...IMAGE_ITEM, kind: 'document' }).success).toBe(false);
    expect(DRIVE_ITEM.safeParse({ ...IMAGE_ITEM, kind: 'video' }).success).toBe(false);
  });

  it('keeps thumb failure reasons and refuses unknown states', () => {
    expect(
      DRIVE_ITEM.safeParse({ ...IMAGE_ITEM, thumb: { state: 'unsupported', reason: 'HEIC' } })
        .success,
    ).toBe(true);
    expect(DRIVE_ITEM.safeParse({ ...IMAGE_ITEM, thumb: { state: 'failed' } }).success).toBe(false);
    expect(DRIVE_ITEM.safeParse({ ...IMAGE_ITEM, thumb: { state: 'pending' } }).success).toBe(
      false,
    );
  });

  it('refuses an unknown integrity, a bad hash and a zero revision', () => {
    expect(DRIVE_ITEM.safeParse({ ...IMAGE_ITEM, integrity: 'bad' }).success).toBe(false);
    expect(DRIVE_ITEM.safeParse({ ...IMAGE_ITEM, sha256: 'xyz' }).success).toBe(false);
    expect(DRIVE_ITEM.safeParse({ ...IMAGE_ITEM, rev: 0 }).success).toBe(false);
  });
});

describe('SMART_RULE and DRIVE_ALBUM', () => {
  const RULE = {
    match: 'all',
    rules: [
      { kind: 'item_kind', itemKinds: ['image'] },
      { kind: 'date_range', field: 'takenAt', from: '2026-07-01', to: null },
    ],
  };
  const ALBUM = {
    id: A,
    title: 'July',
    surface: 'drive',
    scope: 'home',
    ownerProfileId: null,
    coverItemId: null,
    itemCount: 0,
    createdAt: AT,
    updatedAt: AT,
  };

  it('accepts a rule and refuses empty, unknown and malformed ones', () => {
    expect(SMART_RULE.safeParse(RULE).success).toBe(true);
    expect(SMART_RULE.safeParse({ match: 'all', rules: [] }).success).toBe(false);
    expect(SMART_RULE.safeParse({ match: 'all', rules: [{ kind: 'colour' }] }).success).toBe(false);
    expect(SMART_RULE.safeParse({ match: 'some', rules: RULE.rules }).success).toBe(false);
    expect(
      SMART_RULE.safeParse({
        match: 'any',
        rules: [{ kind: 'date_range', field: 'takenAt', from: 'July', to: null }],
      }).success,
    ).toBe(false);
  });

  it('separates manual and smart albums', () => {
    expect(DRIVE_ALBUM.safeParse({ ...ALBUM, kind: 'manual' }).success).toBe(true);
    expect(DRIVE_ALBUM.safeParse({ ...ALBUM, kind: 'smart', rule: RULE }).success).toBe(true);
    expect(DRIVE_ALBUM.safeParse({ ...ALBUM, kind: 'smart' }).success).toBe(false);
    expect(DRIVE_ALBUM.safeParse({ ...ALBUM, kind: 'manual', rule: RULE }).success).toBe(false);
  });

  it('names the surface and refuses a missing or unknown one', () => {
    expect(DRIVE_ALBUM.safeParse({ ...ALBUM, kind: 'manual', surface: 'photos' }).success).toBe(
      true,
    );
    expect(DRIVE_ALBUM.safeParse({ ...ALBUM, kind: 'manual', surface: 'files' }).success).toBe(
      false,
    );
    const { surface: _surface, ...bare } = ALBUM;
    expect(DRIVE_ALBUM.safeParse({ ...bare, kind: 'manual' }).success).toBe(false);
  });

  it('ties the owner to the person scope', () => {
    expect(DRIVE_ALBUM.safeParse({ ...ALBUM, kind: 'manual', scope: 'person' }).success).toBe(
      false,
    );
    expect(
      DRIVE_ALBUM.safeParse({ ...ALBUM, kind: 'manual', scope: 'person', ownerProfileId: C })
        .success,
    ).toBe(true);
  });
});

describe('DRIVE_TRASH_ENTRY', () => {
  const ENTRY = {
    itemId: A,
    rootId: B,
    name: 'a.jpg',
    originalRelPath: 'x/a.jpg',
    trashRelPath: 'ab/a.jpg',
    isFolder: false,
    bytes: 5,
    deletedAt: AT,
    purgeAt: '2027-11-07T10:00:00.000Z',
    deletedBy: null,
    addedByProfileId: null,
  };

  it('accepts an entry whose purge date follows the deletion', () => {
    expect(DRIVE_TRASH_ENTRY.safeParse(ENTRY).success).toBe(true);
  });

  it('requires the charged profile as a uuid or null', () => {
    const { addedByProfileId: _omitted, ...without } = ENTRY;
    expect(DRIVE_TRASH_ENTRY.safeParse(without).success).toBe(false);
    expect(DRIVE_TRASH_ENTRY.safeParse({ ...ENTRY, addedByProfileId: C }).success).toBe(true);
    expect(DRIVE_TRASH_ENTRY.safeParse({ ...ENTRY, addedByProfileId: 'x' }).success).toBe(false);
  });

  it('refuses a purge date at or before the deletion and unknown fields', () => {
    expect(DRIVE_TRASH_ENTRY.safeParse({ ...ENTRY, purgeAt: AT }).success).toBe(false);
    expect(DRIVE_TRASH_ENTRY.safeParse({ ...ENTRY, extra: 1 }).success).toBe(false);
  });
});
