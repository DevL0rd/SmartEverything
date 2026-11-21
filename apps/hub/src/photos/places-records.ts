import { z } from 'zod';
import { found, type StoreContext } from '../store/context';
import { storeUnit } from '../store/host/unit';
import { DriveMediaRepository } from '../store/repositories/drive-media';
import { DrivePlacesRepository, type DrivePlaceRow } from '../store/repositories/drive-places';
import { SettingsKvRepository } from '../store/repositories/settings-kv';
import {
  DATASET_SETTING,
  DATASET_SETTING_KEY,
  LOCATED,
  PlaceIndex,
  type LocatedItem,
  type PlacesDataset,
} from './places';

const POINT = z.strictObject({ lat: z.number().nullable(), lon: z.number().nullable() });

export class PlaceRecords {
  private readonly places: DrivePlacesRepository;
  private readonly media: DriveMediaRepository;
  private readonly settings: SettingsKvRepository;
  private readonly index: PlaceIndex;

  constructor(private readonly context: StoreContext) {
    this.places = new DrivePlacesRepository(context);
    this.media = new DriveMediaRepository(context);
    this.settings = new SettingsKvRepository(context);
    this.index = new PlaceIndex(context.sql);
  }

  dataset(): PlacesDataset | undefined {
    const saved = this.settings.read(DATASET_SETTING_KEY);
    return saved === null ? undefined : DATASET_SETTING.parse(saved);
  }

  save(places: readonly DrivePlaceRow[]): void {
    this.context.write(() => {
      for (const place of places) this.places.save(place);
    });
  }

  keep(ids: readonly string[], dataset: PlacesDataset): void {
    this.context.write(() => {
      this.places.keepOnly(ids);
      this.settings.save(DATASET_SETTING_KEY, dataset);
    });
  }

  located(everything: boolean): LocatedItem[] {
    return this.context.sql.all(
      LOCATED,
      `select i.id as item_id, i.place_lat as lat, i.place_lon as lon
       from drive_items i join drive_media m on m.item_id = i.id
       where i.place_lat is not null and ($everything = 1 or m.place_id is null)`,
      { everything: everything ? 1 : 0 },
    );
  }

  assign(itemId: string): string | null {
    const point = found(
      this.context.sql.get(
        POINT,
        'select place_lat as lat, place_lon as lon from drive_items where id = $itemId',
        { itemId },
      ),
      'item',
      itemId,
    );
    const place =
      point.lat === null || point.lon === null
        ? undefined
        : this.index.nearest(point.lat, point.lon);
    this.media.update(itemId, { place_id: place?.id ?? null });
    return place?.id ?? null;
  }

  assignLocated(located: readonly LocatedItem[]): void {
    this.context.write(() => {
      for (const row of located) {
        const place = this.index.nearest(row.lat, row.lon);
        this.media.update(row.item_id, { place_id: place?.id ?? null });
      }
    });
  }

  clearLost(): void {
    this.context.write(() =>
      this.context.sql.run(
        'clear the places of items that lost their location',
        `update drive_media set place_id = null
         where place_id is not null and item_id in (select id from drive_items where place_lat is null)`,
      ),
    );
  }
}

export const PHOTO_PLACES_DATASET_UNIT = storeUnit((store, _input: null) =>
  new PlaceRecords(store.context).dataset(),
);

export const PHOTO_PLACES_SAVE_UNIT = storeUnit(
  (store, input: { readonly places: readonly DrivePlaceRow[] }) => {
    new PlaceRecords(store.context).save(input.places);
  },
);

export const PHOTO_PLACES_KEEP_UNIT = storeUnit(
  (store, input: { readonly ids: readonly string[]; readonly dataset: PlacesDataset }) => {
    new PlaceRecords(store.context).keep(input.ids, input.dataset);
  },
);

export const PHOTO_PLACES_LOCATED_UNIT = storeUnit(
  (store, input: { readonly everything: boolean }) =>
    new PlaceRecords(store.context).located(input.everything),
);

export const PHOTO_PLACE_ASSIGN_UNIT = storeUnit((store, input: { readonly itemId: string }) =>
  new PlaceRecords(store.context).assign(input.itemId),
);

export const PHOTO_PLACES_ASSIGN_LOCATED_UNIT = storeUnit(
  (store, input: { readonly located: readonly LocatedItem[] }) => {
    new PlaceRecords(store.context).assignLocated(input.located);
  },
);

export const PHOTO_PLACES_CLEAR_LOST_UNIT = storeUnit((store, _input: null) => {
  new PlaceRecords(store.context).clearLost();
});
