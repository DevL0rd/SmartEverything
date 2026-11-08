import { hasPhotoFlag, type DriveItem, type DriveThumb } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';

const stored = vi.hoisted(() => new Map<string, unknown>([['photoSearches', []]]));

vi.mock('../../../store/local-prefs', () => ({
  setLocalPref: (key: string, value: unknown): void => {
    stored.set(key, value);
  },
  useLocalPref: (key: string): unknown => stored.get(key),
}));

const { notedRecent, readRecent, RECENT_KEPT, withoutRecent } = await import('./recent');
const { offsetMinOf, resultCountText, resultMetaText, resultSummaryOf, tilesOfItems } =
  await import('./results');
const { noResultsTitleOf, wholeAppQueryOf } = await import('./no-results');

const READY: DriveThumb = { state: 'ready' };

const BASE: Omit<
  Extract<DriveItem, { readonly kind: 'image' }>,
  'id' | 'kind' | 'bytes' | 'takenAt'
> = {
  rootId: '7a1d4c56-3e1b-4d2a-9f0e-5b6c7d8e9f01',
  parentId: null,
  relPath: 'Camera roll/a.jpg',
  name: 'a.jpg',
  modifiedAt: '2026-05-01T10:00:00.000Z',
  addedAt: '2026-05-01T10:00:00.000Z',
  openedAt: null,
  starred: false,
  rev: 3,
  etag: 'e',
  outside: false,
  addedByProfileId: null,
  remoteId: null,
  remoteRev: null,
  mime: 'image/jpeg',
  sha256: null,
  integrity: 'ok' as const,
  thumb: READY,
  width: 4000,
  height: 3000,
  orientation: 1,
  camera: null,
  exposure: null,
  place: null,
};

function photo(id: string, extra: Partial<typeof BASE> = {}): DriveItem {
  return {
    ...BASE,
    ...extra,
    id,
    kind: 'image',
    bytes: 2_000_000,
    takenAt: '2026-05-01T12:00:00+01:00',
  };
}

function video(id: string, durationMs: number): DriveItem {
  return {
    ...BASE,
    id,
    kind: 'video',
    bytes: 50_000_000,
    takenAt: null,
    durationMs,
    mime: 'video/mp4',
  };
}

const A = '1b1e4c56-3e1b-4d2a-9f0e-5b6c7d8e9f01';
const B = '2b1e4c56-3e1b-4d2a-9f0e-5b6c7d8e9f01';
const C = '3b1e4c56-3e1b-4d2a-9f0e-5b6c7d8e9f01';

describe('search results on the media grid', () => {
  it('turns drive items into tiles with aspect, wall time, marks and processing state', () => {
    const [tile, turned, pending] = tilesOfItems([
      photo(A, { starred: true }),
      photo(B, { orientation: 6 }),
      photo(C, { thumb: { state: 'none' } }),
    ]);
    expect(tile).toMatchObject({ id: A, rev: 3, aspect: 4 / 3, offsetMin: 60, local: false });
    expect(hasPhotoFlag(tile?.flags ?? 0, 'favourite')).toBe(true);
    expect(turned?.aspect).toBe(3 / 4);
    expect(hasPhotoFlag(pending?.flags ?? 0, 'processing')).toBe(true);
  });

  it('uses the modified time for a video without a capture time and marks it as a video', () => {
    const [tile] = tilesOfItems([video(A, 90_000)]);
    expect(tile?.takenAt).toBe(Date.parse(BASE.modifiedAt));
    expect(tile?.durationMs).toBe(90_000);
    expect(hasPhotoFlag(tile?.flags ?? 0, 'video')).toBe(true);
  });

  it('reads the offset of a capture time', () => {
    expect(offsetMinOf('2026-05-01T12:00:00Z')).toBe(0);
    expect(offsetMinOf('2026-05-01T12:00:00-05:30')).toBe(-330);
  });

  it('sums count, length and size, and says when more results are still to load', () => {
    const items = [video(A, 3_600_000), video(B, 720_000)];
    const done = resultSummaryOf(items, true);
    expect(resultCountText(done)).toBe('2 videos');
    expect(resultMetaText(done)).toContain('1 h 12 min');
    expect(resultCountText(resultSummaryOf([...items, photo(C)], false))).toBe(
      '3+ photos and videos',
    );
    expect(resultMetaText(resultSummaryOf([photo(C)], true))).not.toContain('min');
  });
});

describe('the no results state', () => {
  it('names what was searched and hands the words to the app search', () => {
    const search = {
      tokens: [{ kind: 'country' as const, countryCode: 'PT', label: 'Portugal' }],
      text: 'red bicycle',
    };
    expect(noResultsTitleOf(search)).toBe('Nothing matches “Portugal · red bicycle”');
    expect(wholeAppQueryOf(search)).toBe('Portugal red bicycle');
  });
});

describe('recent photo searches', () => {
  const tokyo = { tokens: [], text: 'Tokyo night' };
  const year = {
    tokens: [{ kind: 'date' as const, from: '2026-01-01', to: '2026-12-31', label: '2026' }],
    text: '',
  };

  it('keeps the newest first without repeats and forgets one on request', () => {
    const list = notedRecent(notedRecent(notedRecent([], tokyo), year), {
      ...tokyo,
      text: 'tokyo NIGHT ',
    });
    expect(list.map((entry) => entry.title)).toStrictEqual(['tokyo NIGHT', '2026']);
    expect(withoutRecent(list, list[0]?.key ?? '').map((entry) => entry.title)).toStrictEqual([
      '2026',
    ]);
  });

  it('keeps as many as the app search keeps', () => {
    const many = Array.from({ length: RECENT_KEPT + 2 }, (_, index) => ({
      tokens: [],
      text: `q${String(index)}`,
    }));
    const kept = many.reduce<ReturnType<typeof notedRecent>>(
      (list, input) => notedRecent(list, input),
      [],
    );
    expect(kept.length).toBe(RECENT_KEPT);
  });

  it('reads saved searches back and skips unreadable ones', () => {
    const saved = [JSON.stringify(year), '{"tokens":[{"kind":"nope"}],"text":""}', 'not json'];
    expect(readRecent(saved).map((entry) => entry.title)).toStrictEqual(['2026']);
  });
});
