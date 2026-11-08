import type { DriveItem, DuplicateGroup, DuplicateStats } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { bytes } from '../../../format/number';
import {
  SOURCE_COLOURS,
  copiesOf,
  copyLabelOf,
  groupLineOf,
  groupSourcesOf,
  itemLineOf,
  keepAllConfirmOf,
  keptLabelOf,
  libraryShareOf,
  sourceLabelsOf,
  sourceOf,
  sourceSegmentsOf,
  summaryOf,
} from './model';

const ROOT_PHONE = '00000000-0000-4000-8000-000000000001';
const ROOT_IMPORT = '00000000-0000-4000-8000-000000000002';

function image(
  id: string,
  name: string,
  overrides: Partial<{
    width: number | null;
    height: number | null;
    bytes: number;
    rootId: string;
  }> = {},
): Extract<DriveItem, { readonly kind: 'image' }> {
  return {
    kind: 'image',
    id,
    rootId: overrides.rootId ?? ROOT_PHONE,
    parentId: null,
    relPath: name,
    name,
    modifiedAt: '2026-04-19T21:00:00.000Z',
    addedAt: '2026-04-19T21:00:00.000Z',
    openedAt: null,
    starred: false,
    rev: 1,
    etag: 'e1',
    outside: false,
    addedByProfileId: null,
    remoteId: null,
    remoteRev: null,
    mime: 'image/jpeg',
    bytes: overrides.bytes ?? 18_200_000,
    sha256: 'a'.repeat(64),
    integrity: 'ok',
    thumb: { state: 'ready' },
    takenAt: '2026-04-19T20:00:00.000Z',
    width: overrides.width === undefined ? 8000 : overrides.width,
    height: overrides.height === undefined ? 6000 : overrides.height,
    orientation: null,
    camera: null,
    exposure: null,
    place: null,
  };
}

const STATS: DuplicateStats = {
  groups: 37,
  extraCopies: 112,
  bytesBack: 6_200_000_000,
  sources: [
    { rootId: ROOT_PHONE, label: 'Phone backup', copies: 52, bytes: 4_000_000_000 },
    { rootId: ROOT_IMPORT, label: 'Google import', copies: 36, bytes: 2_000_000_000 },
  ],
};

describe('duplicate copy text', () => {
  it('names groups and copies in the confirm and keeps all copies as the safe answer', () => {
    const request = keepAllConfirmOf(STATS);
    expect(request.title).toBe('Keep best in all 37 groups?');
    expect(request.confirmLabel).toBe('Keep best in 37 groups');
    expect(request.cancelLabel).toBe('Keep all copies');
    expect(request.body).toContain('112 copies move to Recently deleted.');
    expect(request.body).toContain(bytes(STATS.bytesBack));
    expect(request.body).toContain('a year after today');
    expect(request.body).toContain('Albums and favourites move to the photo you keep');
    expect(request.tone).toBeUndefined();
  });

  it('speaks of one group and one copy in the singular', () => {
    const one = { ...STATS, groups: 1, extraCopies: 1 };
    expect(keepAllConfirmOf(one).title).toBe('Keep best in the 1 group?');
    expect(keepAllConfirmOf(one).body).toContain('1 copy moves');
    expect(summaryOf(one)).toBe('1 group · 1 extra copy');
    expect(summaryOf(STATS)).toBe('37 groups · 112 extra copies');
  });

  it('gives the space share of the library only when the library size is known', () => {
    expect(libraryShareOf(9, 1000)).toEqual({ total: `of ${bytes(1000)}`, share: 0.009 });
    expect(libraryShareOf(9, undefined)).toBeNull();
    expect(libraryShareOf(9, 0)).toBeNull();
  });

  it('says when Keep best moved nothing because the copies are read-only', () => {
    expect(keptLabelOf({ trashed: 0, reclaimedBytes: 0 })).toContain('read-only');
    expect(keptLabelOf({ trashed: 2, reclaimedBytes: 2048 })).toContain('2 copies moved');
  });
});

describe('copy sources', () => {
  it('colours each source with the categorical tokens in order, without a cap', () => {
    const many: DuplicateStats = {
      ...STATS,
      sources: Array.from({ length: SOURCE_COLOURS.length + 2 }, (_, index) => ({
        rootId: `00000000-0000-4000-8000-0000000001${String(index).padStart(2, '0')}`,
        label: `Source ${String(index)}`,
        copies: index + 1,
        bytes: 1,
      })),
    };
    const segments = sourceSegmentsOf(many);
    expect(segments).toHaveLength(SOURCE_COLOURS.length + 2);
    expect(segments.slice(0, 3).map((segment) => segment.colour)).toEqual([
      'viz-6',
      'viz-3',
      'viz-5',
    ]);
    expect(segments[SOURCE_COLOURS.length]?.colour).toBe('viz-6');
    expect(segments[1]).toMatchObject({ label: 'Source 1', value: 2 });
  });

  it('labels each copy with the folder it came from', () => {
    const labels = sourceLabelsOf(STATS);
    expect(
      sourceOf(
        image('00000000-0000-4000-8000-0000000000a1', 'a.jpg', { rootId: ROOT_IMPORT }),
        labels,
      ),
    ).toBe('Google import');
    expect(
      sourceOf(
        {
          ...image('00000000-0000-4000-8000-0000000000a1', 'a.jpg'),
          relPath: '2025/2025-11/a.jpg',
        },
        labels,
      ),
    ).toBe('Phone backup/2025/2025-11');
    expect(
      sourceOf(image('00000000-0000-4000-8000-0000000000a1', 'a.jpg'), sourceLabelsOf(undefined)),
    ).toBeNull();
  });
});

describe('copy lines', () => {
  it('shows megapixels and size for photos, resolution for videos and the type otherwise', () => {
    expect(itemLineOf(image('00000000-0000-4000-8000-0000000000a1', 'x.jpg'))).toBe(
      `48 MP · ${bytes(18_200_000)}`,
    );
    expect(
      itemLineOf(
        image('00000000-0000-4000-8000-0000000000a1', 'DSC09412.ARW', {
          width: null,
          height: null,
          bytes: 49_200_000,
        }),
      ),
    ).toBe(`ARW · ${bytes(49_200_000)}`);
    const video: DriveItem = {
      ...image('00000000-0000-4000-8000-0000000000a2', 'walk.mp4'),
      kind: 'video',
      width: 3840,
      height: 2160,
      durationMs: 1000,
    };
    expect(itemLineOf(video)).toBe(`4K · ${bytes(18_200_000)}`);
    const hd: DriveItem = { ...video, width: 1920, height: 1080 };
    expect(itemLineOf(hd)).toBe(`1080p · ${bytes(18_200_000)}`);
  });
});

function groupOf(items: readonly DriveItem[], keeper: DriveItem): DuplicateGroup {
  return {
    sha256: 'a'.repeat(64),
    bytes: 18_200_000,
    keeperItemId: keeper.id,
    reclaimableBytes: 36_400_000,
    items,
  };
}

describe('duplicate groups', () => {
  const keeper = image('00000000-0000-4000-8000-0000000000b1', 'PXL_20251107_1842.jpg');
  const imported = image('00000000-0000-4000-8000-0000000000b2', 'IMG-WA0003.jpg', {
    rootId: ROOT_IMPORT,
  });
  const again = image('00000000-0000-4000-8000-0000000000b3', 'IMG-WA0003 (2).jpg', {
    rootId: ROOT_IMPORT,
  });

  it('puts the suggested keeper first and keeps the other copies in order', () => {
    const group = groupOf([imported, keeper, again], keeper);
    expect(copiesOf(group).map((item) => item.id)).toEqual([keeper.id, imported.id, again.id]);
  });

  it('counts the copies and the space a group saves', () => {
    expect(groupLineOf(groupOf([imported, keeper, again], keeper))).toBe(
      `3 copies · saves ${bytes(36_400_000)}`,
    );
  });

  it('names each source once, keeper first, joined in plain words', () => {
    const labels = sourceLabelsOf(STATS);
    expect(groupSourcesOf(groupOf([imported, keeper, again], keeper), labels)).toBe(
      'Phone backup and Google import',
    );
    expect(groupSourcesOf(groupOf([imported, again], imported), labels)).toBe('Google import');
    expect(
      groupSourcesOf(groupOf([keeper, imported], keeper), sourceLabelsOf(undefined)),
    ).toBeNull();
  });

  it('reads each copy aloud with its role, name, size and source', () => {
    const labels = sourceLabelsOf(STATS);
    expect(copyLabelOf(keeper, true, labels)).toBe(
      `Keep, PXL_20251107_1842.jpg, 48 MP · ${bytes(18_200_000)}, Phone backup`,
    );
    expect(copyLabelOf(imported, false, sourceLabelsOf(undefined))).toBe(
      `Copy, IMG-WA0003.jpg, 48 MP · ${bytes(18_200_000)}`,
    );
  });
});
