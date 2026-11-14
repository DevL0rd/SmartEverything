import { describe, expect, it } from 'vitest';
import { DRIVE_ITEM, type DriveItem } from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import {
  addedLine,
  askLabel,
  cameraLine,
  dayCountText,
  exposureChips,
  fileDetail,
  fileLine,
  folderOf,
  isMediaItem,
  isRaw,
  lensLine,
  noPreviewOf,
  offsetText,
  placeLine,
  shutterText,
  showsOriginal,
  takenSourceLine,
  typeLabel,
  wallTimeOf,
  type MediaItem,
} from './info-model';

const AT = '2026-11-07T10:42:18.000Z';

function photo(patch: Partial<Record<string, unknown>> = {}): MediaItem {
  const item: DriveItem = DRIVE_ITEM.parse({
    id: '00000000-0000-4000-8000-0000000000a1',
    rootId: '00000000-0000-4000-8000-0000000000b1',
    parentId: null,
    relPath: 'Camera roll/Alex/2026/2026-11/IMG_4821.HEIC',
    name: 'IMG_4821.HEIC',
    modifiedAt: AT,
    addedAt: AT,
    openedAt: null,
    starred: false,
    shared: false,
    rev: 1,
    etag: 'e1',
    outside: false,
    addedByProfileId: null,
    remoteId: null,
    remoteRev: null,
    mime: 'image/heic',
    bytes: 3_565_158,
    sha256: null,
    integrity: 'ok',
    thumb: { state: 'ready' },
    takenAt: AT,
    width: 4032,
    height: 3024,
    orientation: 1,
    camera: { make: 'Apple', model: 'iPhone 15 Pro', lens: null },
    exposure: { iso: 80, aperture: 1.78, shutter: 0.0008, focal: 24 },
    place: { lat: 38.71, lon: -9.13 },
    kind: 'image',
    ...patch,
  });
  if (!isMediaItem(item)) throw new TypeError('not a media item');
  return item;
}

function video(): MediaItem {
  return photo({ kind: 'video', name: 'clip.mp4', mime: 'video/mp4', durationMs: 4000 });
}

describe('viewer info', () => {
  it('names the camera by its model, or its make when the model is unknown', () => {
    expect(cameraLine({ make: 'Apple', model: 'iPhone 15 Pro', lens: null })).toBe('iPhone 15 Pro');
    expect(cameraLine({ make: 'Sony', model: null, lens: null })).toBe('Sony');
    expect(cameraLine({ make: null, model: null, lens: 'FE 35mm' })).toBeNull();
    expect(cameraLine(null)).toBeNull();
  });

  it('writes the lens and exposure the way photographers read them', () => {
    const item = photo();
    expect(lensLine(item.camera, item.exposure)).toBe('24 mm f/1.78');
    expect(lensLine({ make: null, model: null, lens: 'FE 35mm F1.8' }, null)).toBe('FE 35mm F1.8');
    expect(exposureChips(item.exposure)).toEqual(['ISO 80', '1/1250 s', 'f/1.78']);
    expect(shutterText(2.5)).toBe('2.5 s');
    expect(exposureChips(null)).toEqual([]);
  });

  it('says where the capture time came from with its offset', () => {
    expect(takenSourceLine('exif', 0)).toBe('From the camera · UTC+0');
    expect(takenSourceLine('gps', -330)).toBe('From the GPS clock · UTC−5:30');
    expect(takenSourceLine(null, null)).toBeNull();
    expect(offsetText(60)).toBe('UTC+1');
  });

  it('shows the wall clock of the place the photo was taken', () => {
    const time = wallTimeOf('2026-11-07T23:30:00.000Z', 60);
    expect(time.at.toISOString()).toBe('2026-11-08T00:30:00.000Z');
    expect(time.zone).toBe('UTC');
    expect(wallTimeOf(AT, null).zone).toBeNull();
  });

  it('describes the file, its folder and its type', () => {
    const item = photo();
    expect(fileLine(item)).toBe('IMG_4821.HEIC · 4032 × 3024');
    expect(fileDetail(item)).toBe(`12.2 MP · ${bytes(3_565_158)} · HEIC`);
    expect(folderOf(item.relPath)).toBe('Camera roll/Alex/2026/2026-11');
    expect(folderOf('top.jpg')).toBe('');
    expect(addedLine(item, 'Photos', null)).toMatch(/^Photos · Added \S.*\d$/);
    expect(addedLine(item, 'Photos', 'Alex')).toMatch(/^Photos · Added .+ by Alex$/);
    expect(addedLine(item, null, 'You')).toMatch(/^Added .+ by You$/);
    expect(askLabel(item)).toBe('Ask about this photo');
    expect(askLabel(video())).toBe('Ask about this video');
    expect(fileLine(photo({ width: null, height: null }))).toBe('IMG_4821.HEIC');
  });

  it('knows RAW files and which originals the stage can show', () => {
    const raw = photo({ name: 'DSC09412.ARW', mime: 'image/x-sony-arw' });
    expect(isRaw(raw)).toBe(true);
    expect(typeLabel(raw)).toBe('RAW');
    expect(showsOriginal(raw)).toBe(false);
    expect(showsOriginal(photo({ name: 'a.jpg', mime: 'image/jpeg' }))).toBe(true);
    expect(showsOriginal(photo())).toBe(false);
  });

  it('draws the RAW aperture mark and says the original is kept when no preview can be made', () => {
    const raw = noPreviewOf(photo({ name: 'DSC09412.ARW', mime: 'image/x-sony-arw' }));
    expect(raw.icon).toBe('aperture');
    expect(raw.text).toBe(
      'The hub cannot make a preview for this RAW file yet. The original is kept as it is.',
    );
    const other = noPreviewOf(photo());
    expect(other.icon).toBe('image');
    expect(other.text).toBe(
      'The hub cannot make a preview for this file. The original is kept as it is.',
    );
  });

  it('writes the place and the position in the day', () => {
    expect(
      placeLine({
        id: 1,
        name: 'Alfama',
        admin: 'Lisbon',
        country: 'Portugal',
        countryCode: 'PT',
        lat: 38.71,
        lon: -9.13,
        count: 4,
        coverItemId: null,
      }),
    ).toBe('Alfama, Lisbon, Portugal');
    expect(dayCountText(3, 23, true)).toBe('3 of 23 today');
    expect(dayCountText(1, 2, false)).toBe('1 of 2 that day');
  });
});
