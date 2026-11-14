import { describe, expect, it } from 'vitest';
import {
  API_ENDPOINTS,
  BACKUP_HAVE,
  BACKUP_REGISTER,
  BACKUP_STATE,
  LIBRARY_BUCKET,
  LIBRARY_PAGE,
  LIBRARY_PAGE_QUERY,
  LIBRARY_SCOPE,
  DUPLICATE_GROUP,
  DUPLICATE_KEEP_BEST,
  MEDIA_INFO,
  MEDIA_JOB,
  PHOTOS_ENDPOINTS,
  PHOTO_FLAGS,
  PHOTOS_CLIENT_PREFS,
  PHOTOS_PREF,
  PHOTO_INSIGHTS,
  SOURCE_QUERY,
  PLACE_CLUSTER_QUERY,
  STACK,
  TRIP,
  endpointAccessArea,
  hasPhotoFlag,
  mcpOperationArea,
  matchPath,
  photoFlags,
} from '../../src';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const HASH = 'a'.repeat(64);

const PAGE = {
  month: '2026-07',
  ids: [A, B],
  revs: [1, 2],
  aspect: [1.5, 0.75],
  takenAt: [1_782_000_000_000, 1_782_000_100_000],
  offsetMin: [120, null],
  durationMs: [null, 8000],
  thumbhash: ['YJqGPQw7sFlslqhFafSE+Q6oJ1h2iHB2Rw==', null],
  flags: [photoFlags(['favourite']), photoFlags(['video', 'processing'])],
  next: null,
};

describe('the library columns', () => {
  it('accepts a month whose columns all hold one value per item', () => {
    expect(LIBRARY_PAGE.safeParse(PAGE).success).toBe(true);
  });

  it('refuses a column that is shorter than the ids', () => {
    expect(LIBRARY_PAGE.safeParse({ ...PAGE, aspect: [1.5] }).success).toBe(false);
    expect(LIBRARY_PAGE.safeParse({ ...PAGE, thumbhash: [null] }).success).toBe(false);
  });

  it('refuses unknown flag bits, a flat aspect and extra fields', () => {
    expect(LIBRARY_PAGE.safeParse({ ...PAGE, flags: [64, 0] }).success).toBe(false);
    expect(LIBRARY_PAGE.safeParse({ ...PAGE, aspect: [0, 1] }).success).toBe(false);
    expect(LIBRARY_PAGE.safeParse({ ...PAGE, extra: 1 }).success).toBe(false);
  });

  it('packs and reads flags without confusing them', () => {
    const flags = photoFlags(['live', 'stack']);
    expect(hasPhotoFlag(flags, 'live')).toBe(true);
    expect(hasPhotoFlag(flags, 'stack')).toBe(true);
    expect(hasPhotoFlag(flags, 'video')).toBe(false);
    expect(new Set(Object.values(PHOTO_FLAGS)).size).toBe(Object.keys(PHOTO_FLAGS).length);
  });

  it('keeps empty months out of the buckets', () => {
    expect(LIBRARY_BUCKET.safeParse({ month: '2026-07', count: 3 }).success).toBe(true);
    expect(LIBRARY_BUCKET.safeParse({ month: '2026-07', count: 0 }).success).toBe(false);
    expect(LIBRARY_BUCKET.safeParse({ month: '2026-13', count: 3 }).success).toBe(false);
  });
});

describe('the media info', () => {
  const INFO = {
    itemId: A,
    timeSource: 'exif',
    tzOffsetMin: 540,
    motionClipId: null,
    liveId: null,
    burstId: null,
    stackId: null,
    placeId: 12,
    preview: { state: 'ready' },
    poster: { state: 'none' },
    playable: { state: 'unsupported', reason: 'HEVC 10-bit HDR cannot be remuxed' },
  };

  it('carries a reason for failed and unsupported states only', () => {
    expect(MEDIA_INFO.safeParse(INFO).success).toBe(true);
    expect(MEDIA_INFO.safeParse({ ...INFO, preview: { state: 'unsupported' } }).success).toBe(
      false,
    );
    expect(
      MEDIA_INFO.safeParse({ ...INFO, preview: { state: 'ready', reason: 'x' } }).success,
    ).toBe(false);
  });

  it('ties a job error to the failed state', () => {
    const job = {
      id: A,
      kind: 'preview',
      itemId: B,
      rev: 1,
      state: 'failed',
      attempts: 3,
      error: 'bad data',
      modelVersion: null,
      queuedAt: '2026-11-07T10:00:00Z',
    };
    expect(MEDIA_JOB.safeParse(job).success).toBe(true);
    expect(MEDIA_JOB.safeParse({ ...job, error: null }).success).toBe(false);
    expect(MEDIA_JOB.safeParse({ ...job, state: 'done' }).success).toBe(false);
  });
});

describe('trips', () => {
  const TRIP_BASE = {
    id: 't1',
    from: '2025-07-01',
    to: '2025-07-02',
    count: 4,
    coverItemId: A,
    kind: 'trip',
    placeId: null,
    placeName: null,
    distanceFromHomeKm: null,
    places: 1,
    perDay: [{ day: '2025-07-01', count: 4 }],
  };

  it('accepts a trip with its days and refuses an unknown field or no days', () => {
    expect(TRIP.safeParse(TRIP_BASE).success).toBe(true);
    expect(TRIP.safeParse({ ...TRIP_BASE, perDay: [] }).success).toBe(false);
    expect(TRIP.safeParse({ ...TRIP_BASE, kind: 'burst' }).success).toBe(false);
    expect(TRIP.safeParse({ ...TRIP_BASE, extra: 1 }).success).toBe(false);
  });
});

describe('the library scope', () => {
  it('takes every narrowing and refuses unknown fields', () => {
    const scope = {
      filter: 'videos',
      placeId: 4,
      countryCode: 'PT',
      camera: 'Google Pixel 9',
      albumId: A,
      text: 'beach',
      from: '2026-01-01',
      to: '2026-02-01',
    };
    expect(LIBRARY_SCOPE.safeParse(scope).success).toBe(true);
    expect(LIBRARY_SCOPE.safeParse({ ...scope, tab: 'videos' }).success).toBe(false);
    expect(LIBRARY_SCOPE.safeParse({ filter: 'memories' }).success).toBe(false);
  });

  it('refuses a range that ends before it starts, in the scope and in a page query', () => {
    const range = { filter: 'all', from: '2026-03-01', to: '2026-02-01' };
    expect(LIBRARY_SCOPE.safeParse(range).success).toBe(false);
    expect(LIBRARY_PAGE_QUERY.safeParse({ ...range, cursor: 'c' }).success).toBe(false);
    expect(LIBRARY_PAGE_QUERY.safeParse({ filter: 'all', from: '2026-03-01' }).success).toBe(true);
  });

  it('carries the source text and dates and refuses a backwards range', () => {
    expect(
      SOURCE_QUERY.safeParse({ text: 'door', from: '2026-01-01', to: '2026-01-02' }).success,
    ).toBe(true);
    expect(SOURCE_QUERY.safeParse({ from: '2026-02-01', to: '2026-01-02' }).success).toBe(false);
  });
});

describe('the backup state', () => {
  it('holds the bytes left and the folder once for all devices', () => {
    expect(
      BACKUP_STATE.safeParse({ devices: [], bytesLeft: 0, targetFolder: 'Photos' }).success,
    ).toBe(true);
    expect(BACKUP_STATE.safeParse([]).success).toBe(false);
    expect(BACKUP_STATE.safeParse({ devices: [], bytesLeft: 0 }).success).toBe(false);
  });

  it('keeps the photos preference on its third version without the memories fields', () => {
    expect(PHOTOS_CLIENT_PREFS.photos.version).toBe(3);
    expect(Object.keys(PHOTOS_PREF.shape)).not.toContain('memories');
    expect(Object.keys(PHOTOS_PREF.shape)).toContain('libraryZoom');
  });
});

describe('the insights', () => {
  const INSIGHTS = {
    range: 'last_12_months',
    items: 10,
    bytes: 1000,
    kinds: [{ kind: 'screenshot', items: 2, bytes: 100 }],
    growth: null,
    cameras: [{ make: 'Google', model: 'Pixel 9', items: 8 }],
    lenses: [],
    roots: [{ rootId: A, photos: 8, videos: 2, photoBytes: 800, videoBytes: 200 }],
    largestVideos: [{ itemId: B, bytes: 200, durationMs: null }],
    videoTotals: { items: 2, bytes: 200, durationMs: 90_000, longestMs: 60_000 },
    durationBuckets: [{ bucket: 'under_1m', items: 2, bytes: 200 }],
    hoursAddedPerMonth: null,
    busiestDays: [{ day: '2026-07-04', items: 6 }],
    perDay: [{ day: '2026-07-04', items: 6 }],
    weekdayByHour: [{ weekday: 6, hour: 14, items: 6 }],
    seasonByHour: [{ season: 'summer', hour: 14, items: 6 }],
    places: { places: 1, countries: [{ countryCode: 'PT', country: 'Portugal', items: 6 }] },
    backupCoverage: [{ deviceId: C, name: 'Pixel', backedUp: 8, total: 9 }],
  };

  it('returns counts only while there is no history for the growth charts', () => {
    const parsed = PHOTO_INSIGHTS.parse(INSIGHTS);
    expect(parsed.growth).toBeNull();
    expect(parsed.hoursAddedPerMonth).toBeNull();
    expect(
      PHOTO_INSIGHTS.safeParse({
        ...INSIGHTS,
        growth: [{ month: '2026-06', kind: 'video', items: 1, bytes: 10 }],
        hoursAddedPerMonth: [{ month: '2026-06', hours: 0.5 }],
      }).success,
    ).toBe(true);
  });

  it('splits screenshots and RAW from photos and refuses an unknown kind', () => {
    const kinds = ['photo', 'screenshot', 'raw', 'video'].map((kind) => ({
      kind,
      items: 1,
      bytes: 1,
    }));
    expect(PHOTO_INSIGHTS.safeParse({ ...INSIGHTS, kinds }).success).toBe(true);
    expect(
      PHOTO_INSIGHTS.safeParse({ ...INSIGHTS, kinds: [{ kind: 'gif', items: 1, bytes: 1 }] })
        .success,
    ).toBe(false);
  });

  it('refuses a backup coverage above the phone total and an hour out of range', () => {
    expect(
      PHOTO_INSIGHTS.safeParse({
        ...INSIGHTS,
        backupCoverage: [{ deviceId: C, name: 'Pixel', backedUp: 10, total: 9 }],
      }).success,
    ).toBe(false);
    expect(
      PHOTO_INSIGHTS.safeParse({
        ...INSIGHTS,
        weekdayByHour: [{ weekday: 6, hour: 24, items: 1 }],
      }).success,
    ).toBe(false);
  });
});

describe('stacks, duplicates, backup and the map', () => {
  it('keeps a stack cover inside the stack', () => {
    const stack = { id: A, kind: 'raw_jpeg', coverItemId: B, itemIds: [B, C] };
    expect(STACK.safeParse(stack).success).toBe(true);
    expect(STACK.safeParse({ ...stack, coverItemId: A }).success).toBe(false);
    expect(STACK.safeParse({ ...stack, itemIds: [B] }).success).toBe(false);
  });

  it('asks keep best for named groups or all, never both or neither', () => {
    expect(DUPLICATE_KEEP_BEST.safeParse({ scope: 'all' }).success).toBe(true);
    expect(DUPLICATE_KEEP_BEST.safeParse({ scope: 'groups', sha256s: [HASH] }).success).toBe(true);
    expect(DUPLICATE_KEEP_BEST.safeParse({ scope: 'groups', sha256s: [] }).success).toBe(false);
    expect(DUPLICATE_KEEP_BEST.safeParse({ scope: 'all', sha256s: [HASH] }).success).toBe(false);
    expect(DUPLICATE_GROUP.safeParse({ sha256: HASH }).success).toBe(false);
  });

  it('registers a phone and asks which hashes the hub has', () => {
    const settings = {
      enabled: true,
      folders: ['Camera'],
      wifiOnly: true,
      chargingOnly: false,
      includeVideos: true,
    };
    expect(
      BACKUP_REGISTER.safeParse({ deviceId: 'abc', name: 'Pixel', platform: 'android', settings })
        .success,
    ).toBe(true);
    expect(
      BACKUP_REGISTER.safeParse({ deviceId: 'abc', name: 'Pixel', platform: 'android' }).success,
    ).toBe(false);
    expect(
      BACKUP_HAVE.safeParse({ deviceId: 'abc', assets: [{ localId: '1', sha256: HASH }] }).success,
    ).toBe(true);
    expect(BACKUP_HAVE.safeParse({ deviceId: 'abc', assets: [] }).success).toBe(false);
  });

  it('refuses a map view with the south edge above the north edge', () => {
    const view = { zoom: '3', west: '-10', south: '30', east: '10', north: '50' };
    expect(PLACE_CLUSTER_QUERY.safeParse(view).success).toBe(true);
    expect(PLACE_CLUSTER_QUERY.safeParse({ ...view, south: '60' }).success).toBe(false);
    expect(
      PLACE_CLUSTER_QUERY.safeParse({
        ...view,
        from: '2026-02-01T00:00:00Z',
        to: '2026-01-01T00:00:00Z',
      }).success,
    ).toBe(false);
  });
});

describe('the Photos endpoints', () => {
  const entries = Object.entries(PHOTOS_ENDPOINTS);

  it('reuse no name or method and path of an existing endpoint', () => {
    const taken = new Set(
      Object.entries(API_ENDPOINTS)
        .filter(([name]) => !(name in PHOTOS_ENDPOINTS))
        .map(([, e]) => `${e.method} ${e.path}`),
    );
    for (const [name, endpoint] of entries) {
      expect(taken.has(`${endpoint.method} ${endpoint.path}`), name).toBe(false);
    }
    expect(new Set(entries.map(([, e]) => `${e.method} ${e.path}`)).size).toBe(entries.length);
  });

  it('answers each path with exactly one endpoint', () => {
    for (const [name, endpoint] of entries) {
      const sample = endpoint.path
        .replace(':month', '2026-07')
        .replace(':placeId', '4')
        .replace(':source', 'ai')
        .replace(/:\w+/g, A);
      const hits = entries.filter(
        ([, other]) => other.method === endpoint.method && matchPath(other.path, sample) !== null,
      );
      expect(
        hits.map(([hit]) => hit),
        name,
      ).toStrictEqual([name]);
    }
  });

  it('sit in the Photos & Drive area and let a member reach them', () => {
    for (const [name, endpoint] of entries) {
      expect(endpoint.path.startsWith('/api/drive/photos/'), name).toBe(true);
      expect(endpoint.access, name).toBe('member');
      expect(mcpOperationArea(endpoint), name).toBe('drive');
      expect(endpointAccessArea(endpoint), name).toBe('drive');
    }
  });

  it('reads the month from the path and numbers from the query string', () => {
    expect(PHOTOS_ENDPOINTS.readLibraryPage.params.safeParse({ month: '2026-07' }).success).toBe(
      true,
    );
    expect(PHOTOS_ENDPOINTS.readLibraryPage.params.safeParse({ month: 'July' }).success).toBe(
      false,
    );
    expect(
      PHOTOS_ENDPOINTS.readLibraryBuckets.query.parse({ filter: 'videos', placeId: '12' }),
    ).toStrictEqual({ filter: 'videos', placeId: 12 });
    expect(PHOTOS_ENDPOINTS.listPhotoSource.params.safeParse({ source: 'tv' }).success).toBe(false);
  });
});
