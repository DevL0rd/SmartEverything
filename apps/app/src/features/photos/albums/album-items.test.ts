import { describe, expect, it } from 'vitest';
import { DRIVE_ITEM, hasPhotoFlag, type DriveItem } from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import { isMedia, mosaicOf, offsetOf, statsOf, tileOfItem, tilesOfItems } from './album-items';

const ROOT = 'a1b2c3d4-0000-4000-8000-000000000001';

function media(
  index: number,
  kind: 'image' | 'video',
  fields: Readonly<Record<string, unknown>>,
): Extract<DriveItem, { readonly kind: 'image' | 'video' }> {
  const item = DRIVE_ITEM.parse({
    id: `a1b2c3d4-0000-4000-8000-0000000001${String(index).padStart(2, '0')}`,
    rootId: ROOT,
    parentId: null,
    relPath: `photo-${String(index)}`,
    name: `photo-${String(index)}`,
    modifiedAt: '2026-11-07T10:00:00Z',
    addedAt: '2026-11-07T10:00:00Z',
    openedAt: null,
    starred: false,
    rev: 1,
    etag: 'e1',
    outside: false,
    addedByProfileId: null,
    remoteId: null,
    remoteRev: null,
    mime: kind === 'image' ? 'image/jpeg' : 'video/mp4',
    bytes: 1_000_000,
    sha256: null,
    integrity: 'ok',
    thumb: { state: 'ready' },
    takenAt: '2026-11-05T09:00:00+01:00',
    width: 4000,
    height: 3000,
    orientation: 1,
    camera: null,
    exposure: null,
    place: null,
    kind,
    ...(kind === 'video' ? { durationMs: 42_000 } : {}),
    ...fields,
  });
  if (!isMedia(item)) throw new Error('Expected a media fixture');
  return item;
}

const PHOTO = media(1, 'image', { starred: true });
const TURNED = media(2, 'image', { orientation: 6, takenAt: '2026-11-03T08:00:00Z' });
const CLIP = media(3, 'video', { thumb: { state: 'none' }, takenAt: '2026-11-07T20:00:00-05:00' });

describe('album items', () => {
  it('reads the wall clock offset of a capture time', () => {
    expect(offsetOf('2026-11-05T09:00:00+01:00')).toBe(60);
    expect(offsetOf('2026-11-07T20:00:00-05:30')).toBe(-330);
    expect(offsetOf('2026-11-03T08:00:00Z')).toBe(0);
  });

  it('turns album items into grid tiles with their marks and aspect', () => {
    const photo = tileOfItem(PHOTO);
    expect(photo.aspect).toBeCloseTo(4 / 3);
    expect(hasPhotoFlag(photo.flags, 'favourite')).toBe(true);
    expect(tilesOfItems([TURNED])[0]?.aspect).toBeCloseTo(3 / 4);
    const clip = tilesOfItems([CLIP])[0];
    expect(clip?.durationMs).toBe(42_000);
    expect(hasPhotoFlag(clip?.flags ?? 0, 'video')).toBe(true);
    expect(hasPhotoFlag(clip?.flags ?? 0, 'processing')).toBe(true);
  });

  it('sums the split, span and size of a fully loaded album', () => {
    expect(statsOf([PHOTO, TURNED, CLIP])).toStrictEqual({
      split: '2 photos · 1 video',
      span: '3 to 7 Nov 2026',
      size: bytes(3_000_000),
    });
    expect(statsOf([]).span).toBeNull();
  });

  it('leads the mosaic with the cover and fills it with other items', () => {
    expect(mosaicOf(CLIP.id, [PHOTO, TURNED, CLIP])).toStrictEqual([CLIP.id, PHOTO.id, TURNED.id]);
    expect(mosaicOf(null, [PHOTO])).toStrictEqual([PHOTO.id]);
    expect(mosaicOf(null, [])).toStrictEqual([]);
  });
});
