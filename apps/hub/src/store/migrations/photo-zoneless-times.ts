import type { LogPayload } from '@smarteverything/logging';
import { z } from 'zod';
import { zoneEvidence } from '../../drive/metadata-zone';
import { saveDeviceZone } from '../repositories/photo-device-zones';
import type { Sql } from '../sql';
import type { Migration } from './migration';

const DATED_PHOTO = z.strictObject({
  id: z.string(),
  taken_at: z.string(),
  camera_make: z.string(),
  camera_model: z.string(),
  place_lat: z.number().nullable(),
  place_lon: z.number().nullable(),
  tz_offset_min: z.int().nullable(),
});

function rememberDeviceZones(sql: Sql): LogPayload {
  const photos = sql.all(
    DATED_PHOTO,
    `select i.id, i.taken_at, i.camera_make, i.camera_model, i.place_lat, i.place_lon, m.tz_offset_min
      from drive_items i join drive_media m on m.item_id = i.id
      where i.kind = 'image' and m.time_source = 'metadata' and i.taken_at is not null
        and i.camera_make is not null and i.camera_model is not null`,
  );
  let remembered = 0;
  for (const photo of photos) {
    const evidence = zoneEvidence({
      takenAt: { iso: photo.taken_at, offsetMin: photo.tz_offset_min, source: 'metadata' },
      place:
        photo.place_lat === null || photo.place_lon === null
          ? null
          : { lat: photo.place_lat, lon: photo.place_lon },
      camera: { make: photo.camera_make, model: photo.camera_model, lens: null },
    });
    if (evidence === null) continue;
    saveDeviceZone(sql, photo.id, evidence);
    remembered += 1;
  }
  return { photos: photos.length, remembered };
}

export const PHOTO_ZONELESS_TIMES_MIGRATION: Migration = {
  version: 235,
  name: 'photo-zoneless-times',
  statements: [
    `update drive_items set taken_at = null
      where kind in ('image', 'video') and id in (
        select m.item_id from drive_media m join drive_items i on i.id = m.item_id
          where (m.time_source = 'metadata' and m.tz_offset_min is null)
            or (m.time_source = 'modified' and i.mime = 'image/gif'))`,
    `create table photo_device_zones (
      item_id text primary key references drive_items (id) on delete cascade,
      camera_make text not null check (length(camera_make) > 0),
      camera_model text not null check (length(camera_model) > 0),
      wall_at text not null check (length(wall_at) = 19 and datetime(wall_at) is not null),
      zone text not null check (length(zone) > 0)
    ) strict`,
    'create index photo_device_zones_by_device on photo_device_zones (camera_make, camera_model, wall_at)',
  ],
  backfill: rememberDeviceZones,
};
