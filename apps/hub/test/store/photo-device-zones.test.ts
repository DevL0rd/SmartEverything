import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PHOTO_ZONELESS_TIMES_MIGRATION } from '../../src/store/migrations/photo-zoneless-times';
import { DriveMediaRepository } from '../../src/store/repositories/drive-media';
import { PhotoDeviceZonesRepository } from '../../src/store/repositories/photo-device-zones';
import { NOW, photo, photoFixture, SHARED_ROOT, type PhotoFixture } from './photo-fixture';

const PHONE = { make: 'Google', model: 'Pixel 8' };

let fixture: PhotoFixture;
let zones: PhotoDeviceZonesRepository;

beforeEach(() => {
  fixture = photoFixture();
  zones = new PhotoDeviceZonesRepository(fixture.context);
});

afterEach(() => {
  fixture.database.close();
});

interface Seed {
  readonly n: number;
  readonly takenAt: string;
  readonly offsetMin: number | null;
  readonly place?: { readonly lat: number; readonly lon: number };
  readonly timeSource?: 'metadata' | 'manual';
}

function seeded(seed: Seed): string {
  const itemId = photo(fixture.database, { n: seed.n, root: SHARED_ROOT, takenAt: seed.takenAt });
  fixture.database
    .prepare(
      'update drive_items set camera_make = ?, camera_model = ?, place_lat = ?, place_lon = ? where id = ?',
    )
    .run(PHONE.make, PHONE.model, seed.place?.lat ?? null, seed.place?.lon ?? null, itemId);
  new DriveMediaRepository(fixture.context).save({
    item_id: itemId,
    time_source: seed.timeSource ?? 'metadata',
    tz_offset_min: seed.offsetMin,
    preview_state: 'none',
    preview_reason: null,
    poster_state: 'none',
    poster_reason: null,
    playable_state: 'none',
    playable_reason: null,
    motion_clip_id: null,
    live_id: null,
    burst_id: null,
    stem_key: null,
    stack_id: null,
    place_id: null,
  });
  return itemId;
}

function remembered(): readonly unknown[] {
  return fixture.database
    .prepare('select item_id, wall_at, zone from photo_device_zones order by wall_at')
    .all()
    .map((row) => ({ ...row }));
}

describe('the zones remembered per photo device', () => {
  it('gives the zone of the nearest photo of the same device, never the photo itself', () => {
    const early = seeded({ n: 1, takenAt: '2025-01-01T10:00:00+07:00', offsetMin: 420 });
    const late = seeded({ n: 2, takenAt: '2025-01-05T10:00:00-05:00', offsetMin: -300 });
    zones.keep(early, { ...PHONE, wallAt: '2025-01-01T10:00:00', zone: '+07:00' });
    zones.keep(late, { ...PHONE, wallAt: '2025-01-05T10:00:00', zone: 'America/New_York' });
    expect(zones.nearest(PHONE, '2025-01-02T09:00:00', 'other')).toBe('+07:00');
    expect(zones.nearest(PHONE, '2025-01-04T09:00:00', 'other')).toBe('America/New_York');
    expect(zones.nearest(PHONE, '2025-01-05T10:00:00', late)).toBe('+07:00');
    expect(zones.nearest({ make: 'Google', model: 'Pixel 9' }, '2025-01-02T09:00:00', 'x')).toBe(
      null,
    );
    zones.keep(early, null);
    expect(zones.nearest(PHONE, '2025-01-02T09:00:00', 'other')).toBe('America/New_York');
  });

  it('remembers the zones of the photos already read, from their GPS place or their own offset', () => {
    const gps = seeded({
      n: 1,
      takenAt: '2025-03-09T03:30:00-04:00',
      offsetMin: -240,
      place: { lat: 40.7128, lon: -74.006 },
    });
    const offset = seeded({ n: 2, takenAt: '2025-06-14T09:30:15.5+07:00', offsetMin: 420 });
    seeded({ n: 3, takenAt: '2025-06-15T02:30:00Z', offsetMin: 0 });
    seeded({ n: 4, takenAt: '2025-06-16T09:00:00+02:00', offsetMin: 120, timeSource: 'manual' });
    fixture.database.prepare('delete from photo_device_zones').run();
    expect(PHOTO_ZONELESS_TIMES_MIGRATION.backfill?.(fixture.context.sql, NOW)).toEqual({
      photos: 3,
      remembered: 2,
    });
    expect(remembered()).toEqual([
      { item_id: gps, wall_at: '2025-03-09T03:30:00', zone: 'America/New_York' },
      { item_id: offset, wall_at: '2025-06-14T09:30:15', zone: '+07:00' },
    ]);
  });
});
