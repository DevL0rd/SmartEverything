import { describe, expect, it } from 'vitest';
import { DRIVE_ITEM } from '@smarteverything/domain';
import { isMedia, restText, STRIP_SIZE, stripOf, type MemoryMedia } from './items';

function media(index: number): MemoryMedia {
  const item = DRIVE_ITEM.parse({
    id: `a1b2c3d4-0000-4000-8000-0000000001${String(index).padStart(2, '0')}`,
    rootId: 'a1b2c3d4-0000-4000-8000-000000000001',
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
    mime: 'image/jpeg',
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
    kind: 'image',
  });
  if (!isMedia(item)) throw new Error('The fixture is not a photo');
  return item;
}

const ITEMS = Array.from({ length: 8 }, (_, index) => media(index));

describe('the on this day strip', () => {
  it('shows the photos after the cover, as many as the drawn strip holds', () => {
    const cover = ITEMS[3]?.id ?? '';
    const strip = stripOf(ITEMS, cover);
    expect(strip).toHaveLength(STRIP_SIZE);
    expect(strip.map((item) => item.id)).not.toContain(cover);
    expect(strip[0]?.id).toBe(ITEMS[0]?.id);
  });

  it('counts the photos the strip and cover leave out', () => {
    expect(restText(40, 4)).toBe('+35');
    expect(restText(1_240, 4)).toBe('+1,235');
    expect(restText(5, 4)).toBeNull();
    expect(restText(3, 2)).toBeNull();
  });

  it('draws no strip for a memory with only its cover loaded', () => {
    expect(stripOf(ITEMS.slice(0, 1), ITEMS[0]?.id ?? '')).toEqual([]);
  });
});
