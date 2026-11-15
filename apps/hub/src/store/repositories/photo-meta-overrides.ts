import { z } from 'zod';
import type { StoreContext } from '../context';
import { inList } from '../sql';

const COLUMNS =
  'item_id, taken_at, tz_offset_min, lat, lon, place_label, location_cleared, set_by, set_at';

const OVERRIDE_COLUMNS = z.strictObject({
  item_id: z.string(),
  taken_at: z.string().nullable(),
  tz_offset_min: z.number().nullable(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  place_label: z.string().nullable(),
  location_cleared: z.number(),
  set_by: z.string().nullable(),
  set_at: z.string(),
});

export interface PhotoMetaOverride {
  readonly itemId: string;
  readonly takenAt: string | null;
  readonly tzOffsetMin: number | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly placeLabel: string | null;
  readonly locationCleared: boolean;
  readonly setBy: string | null;
  readonly setAt: string;
}

const STORED_OVERRIDE = OVERRIDE_COLUMNS.transform((row): PhotoMetaOverride => ({
  itemId: row.item_id,
  takenAt: row.taken_at,
  tzOffsetMin: row.tz_offset_min,
  latitude: row.lat,
  longitude: row.lon,
  placeLabel: row.place_label,
  locationCleared: row.location_cleared === 1,
  setBy: row.set_by,
  setAt: row.set_at,
}));

export type PhotoMetaOverrideWrite = Omit<PhotoMetaOverride, 'setAt'>;

export class PhotoMetaOverridesRepository {
  constructor(private readonly context: StoreContext) {}

  find(itemId: string): PhotoMetaOverride | undefined {
    return this.context.sql.get(
      STORED_OVERRIDE,
      `select ${COLUMNS} from photo_meta_overrides where item_id = $itemId`,
      { itemId },
    );
  }

  forItems(itemIds: readonly string[]): PhotoMetaOverride[] {
    const filter = inList('item_id', 'ids', itemIds);
    return this.context.sql.all(
      STORED_OVERRIDE,
      `select ${COLUMNS} from photo_meta_overrides where ${filter.text} order by item_id`,
      filter.parameters,
    );
  }

  set(override: PhotoMetaOverrideWrite): void {
    this.context.write(() => {
      this.context.sql.run(
        'save the photo metadata override',
        `insert into photo_meta_overrides (${COLUMNS})
          values ($itemId, $takenAt, $tzOffsetMin, $latitude, $longitude, $placeLabel, $locationCleared, $setBy, $now)
          on conflict (item_id) do update set taken_at = excluded.taken_at,
            tz_offset_min = excluded.tz_offset_min, lat = excluded.lat, lon = excluded.lon,
            place_label = excluded.place_label,
            location_cleared = excluded.location_cleared, set_by = excluded.set_by, set_at = excluded.set_at`,
        {
          itemId: override.itemId,
          takenAt: override.takenAt,
          tzOffsetMin: override.tzOffsetMin,
          latitude: override.latitude,
          longitude: override.longitude,
          placeLabel: override.placeLabel,
          locationCleared: override.locationCleared ? 1 : 0,
          setBy: override.setBy,
          now: this.context.now(),
        },
      );
    });
  }

  remove(itemIds: readonly string[]): number {
    const filter = inList('item_id', 'ids', itemIds);
    return this.context.write(() =>
      this.context.sql.run(
        'remove the photo metadata overrides',
        `delete from photo_meta_overrides where ${filter.text}`,
        filter.parameters,
      ),
    );
  }
}
