import { z } from 'zod';
import type { Device, DeviceZones, ZoneEvidence } from '../../drive/metadata-zone';
import type { StoreContext } from '../context';
import type { Sql } from '../sql';

const NEIGHBOUR = z.strictObject({ wall_at: z.string(), zone: z.string().min(1) });

const NEAREST = `select wall_at, zone from (
    select wall_at, zone from photo_device_zones
      where camera_make = $make and camera_model = $model and wall_at <= $wallAt and item_id <> $itemId
      order by wall_at desc limit 1)
  union all
  select wall_at, zone from (
    select wall_at, zone from photo_device_zones
      where camera_make = $make and camera_model = $model and wall_at > $wallAt and item_id <> $itemId
      order by wall_at limit 1)`;

export function saveDeviceZone(sql: Sql, itemId: string, evidence: ZoneEvidence): void {
  sql.run(
    'remember the zone of a photo device',
    `insert into photo_device_zones (item_id, camera_make, camera_model, wall_at, zone)
      values ($itemId, $make, $model, $wallAt, $zone)
      on conflict (item_id) do update set camera_make = excluded.camera_make,
        camera_model = excluded.camera_model, wall_at = excluded.wall_at, zone = excluded.zone`,
    {
      itemId,
      make: evidence.make,
      model: evidence.model,
      wallAt: evidence.wallAt,
      zone: evidence.zone,
    },
  );
}

function distanceMs(wallAt: string, other: string): number {
  return Math.abs(Date.parse(`${wallAt}Z`) - Date.parse(`${other}Z`));
}

export class PhotoDeviceZonesRepository implements DeviceZones {
  constructor(private readonly context: StoreContext) {}

  nearest(device: Device, wallAt: string, exceptItemId: string): string | null {
    const rows = this.context.sql.all(NEIGHBOUR, NEAREST, {
      make: device.make,
      model: device.model,
      wallAt,
      itemId: exceptItemId,
    });
    const [first, second] = rows;
    if (first === undefined) return null;
    if (second === undefined) return first.zone;
    return distanceMs(wallAt, first.wall_at) <= distanceMs(wallAt, second.wall_at)
      ? first.zone
      : second.zone;
  }

  keep(itemId: string, evidence: ZoneEvidence | null): void {
    this.context.write(() => {
      if (evidence !== null) {
        saveDeviceZone(this.context.sql, itemId, evidence);
        return;
      }
      this.context.sql.run(
        'forget the zone of a photo device',
        'delete from photo_device_zones where item_id = $itemId',
        { itemId },
      );
    });
  }
}
