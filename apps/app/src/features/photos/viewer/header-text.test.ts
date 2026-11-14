import { describe, expect, it } from 'vitest';
import { DRIVE_ITEM, type PhotoPlace } from '@smarteverything/domain';
import { desktopHeaderText, phoneHeaderText, type HeaderInput } from './header-text';
import { isMediaItem, type MediaItem } from './info-model';

const TAKEN = '2026-11-07T10:42:00.000Z';

const PLACE: PhotoPlace = {
  id: 1,
  name: 'Alfama',
  admin: 'Lisbon',
  country: 'Portugal',
  countryCode: 'PT',
  lat: 38.71,
  lon: -9.13,
  count: 4,
  coverItemId: null,
};

function item(takenAt: string | null): MediaItem {
  const parsed = DRIVE_ITEM.parse({
    id: '00000000-0000-4000-8000-0000000000a1',
    rootId: '00000000-0000-4000-8000-0000000000b1',
    parentId: null,
    relPath: 'IMG_1.JPG',
    name: 'IMG_1.JPG',
    modifiedAt: TAKEN,
    addedAt: TAKEN,
    openedAt: null,
    starred: false,
    shared: false,
    rev: 1,
    etag: 'e',
    outside: false,
    addedByProfileId: null,
    remoteId: null,
    remoteRev: null,
    mime: 'image/jpeg',
    bytes: 10,
    sha256: null,
    integrity: 'ok',
    thumb: { state: 'ready' },
    takenAt,
    width: null,
    height: null,
    orientation: null,
    camera: null,
    exposure: null,
    place: null,
    kind: 'image',
  });
  if (!isMediaItem(parsed)) throw new TypeError('not media');
  return parsed;
}

function input(patch: Partial<HeaderInput>): HeaderInput {
  return {
    item: item(TAKEN),
    offsetMin: 0,
    place: PLACE,
    day: { position: 3, total: 23 },
    today: '2026-11-07',
    ...patch,
  };
}

describe('viewer header text', () => {
  it('names the place and the position in the day on desktop', () => {
    const text = desktopHeaderText(input({}));
    expect(text.title).toMatch(/2026/);
    expect(text.detail).toBe('Alfama, Portugal · 3 of 23 today');
  });

  it('leaves out the position when the photo is alone that day', () => {
    expect(
      desktopHeaderText(input({ day: { position: 1, total: 1 }, place: null })).detail,
    ).toBeNull();
  });

  it('says that day for a photo from another day', () => {
    const text = desktopHeaderText(input({ today: '2026-11-20' }));
    expect(text.detail).toBe('Alfama, Portugal · 3 of 23 that day');
  });

  it('uses the short day and the nearer place on the phone', () => {
    const text = phoneHeaderText(input({}));
    expect(text.title.startsWith('Today, ')).toBe(true);
    expect(text.detail).toBe('Alfama, Lisbon');
  });

  it('falls back to the file name when the capture time is unknown', () => {
    expect(phoneHeaderText(input({ item: item(null) }))).toEqual({
      title: 'IMG_1.JPG',
      detail: null,
    });
  });
});
