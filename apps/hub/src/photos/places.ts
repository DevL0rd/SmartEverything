import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { gunzip, gunzipSync } from 'node:zlib';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { found, type StoreContext } from '../store/context';
import type { StoreReader } from '../store/reader';
import { inSlices } from '../store/slices';
import type { Sql } from '../store/sql';
import { DriveMediaRepository } from '../store/repositories/drive-media';
import {
  DRIVE_PLACE_ROW,
  DrivePlacesRepository,
  type DrivePlaceRow,
} from '../store/repositories/drive-places';
import { SettingsKvRepository } from '../store/repositories/settings-kv';

const gunzipAsync = promisify(gunzip);

const SHIPPED = new URL('places/cities.tsv.gz', import.meta.url);
const CHECKOUT = new URL('../../assets/places/cities.tsv.gz', import.meta.url);

export function placesDatasetPath(): string {
  const found = [SHIPPED, CHECKOUT].find((candidate) => existsSync(candidate));
  return fileURLToPath(found ?? CHECKOUT);
}

const DATASET_SETTING_KEY = 'photos-places';

const DATASET_SETTING = z.strictObject({ sha256: z.string(), count: z.int().nonnegative() });

const WINDOWS = [0.25, 1, 4, 16, 64, 180] as const;

const POLE_FLOOR = 0.05;

const FIELDS = z.tuple([
  z.string().min(1),
  z.string().min(1),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
]);

const LOCATED = z.strictObject({
  item_id: z.string(),
  lat: z.number(),
  lon: z.number(),
});

const POINT = z.strictObject({ lat: z.number().nullable(), lon: z.number().nullable() });

export class PlacesDatasetError extends Error {
  override readonly name = 'PlacesDatasetError';

  constructor(
    readonly line: number,
    cause: unknown,
  ) {
    super(`The places dataset has an unreadable row at line ${String(line)}.`, { cause });
  }
}

function placeOfLine(line: string, index: number): DrivePlaceRow {
  try {
    const [id, name, admin, country, lat, lon] = FIELDS.parse(line.split('\t'));
    return DRIVE_PLACE_ROW.parse({
      id,
      name,
      admin: admin === '' ? null : admin,
      country,
      lat: Number(lat),
      lon: Number(lon),
    });
  } catch (cause) {
    throw new PlacesDatasetError(index + 1, cause);
  }
}

function datasetLines(text: string): readonly (readonly [string, number])[] {
  return text
    .split('\n')
    .map((line, index) => [line, index] as const)
    .filter(([line]) => line !== '');
}

export function parseDataset(bytes: Uint8Array): readonly DrivePlaceRow[] {
  return datasetLines(gunzipSync(bytes).toString('utf8')).map(([line, index]) =>
    placeOfLine(line, index),
  );
}

const longitudeFactor = (lat: number): number =>
  Math.max(Math.cos((lat * Math.PI) / 180), POLE_FLOOR);

const distanceTo = (lat: number, lon: number, place: DrivePlaceRow): number => {
  const across = ((place.lon - lon + 540) % 360) - 180;
  return Math.hypot(across * longitudeFactor(lat), place.lat - lat);
};

const nearestOf = (
  lat: number,
  lon: number,
  places: readonly DrivePlaceRow[],
): DrivePlaceRow | undefined => {
  let best: DrivePlaceRow | undefined;
  let bestDistance = Infinity;
  for (const place of places) {
    const candidate = distanceTo(lat, lon, place);
    if (candidate < bestDistance) {
      best = place;
      bestDistance = candidate;
    }
  }
  return best;
};

const longitudeRanges = (lon: number, span: number): readonly (readonly [number, number])[] => {
  if (span >= 180) return [[-180, 180]];
  const ranges: (readonly [number, number])[] = [
    [Math.max(lon - span, -180), Math.min(lon + span, 180)],
  ];
  if (lon + span > 180) ranges.push([-180, lon + span - 360]);
  if (lon - span < -180) ranges.push([lon - span + 360, 180]);
  return ranges;
};

export class PlaceIndex {
  constructor(private readonly sql: Sql) {}

  nearest(lat: number, lon: number): DrivePlaceRow | undefined {
    for (const radius of WINDOWS) {
      const first = nearestOf(lat, lon, this.within(lat, lon, radius));
      if (first === undefined) continue;
      const found = distanceTo(lat, lon, first);
      return found <= radius ? first : nearestOf(lat, lon, this.within(lat, lon, found));
    }
    return undefined;
  }

  private within(lat: number, lon: number, radius: number): readonly DrivePlaceRow[] {
    const span = radius / longitudeFactor(lat);
    return longitudeRanges(lon, span).flatMap(([west, east]) =>
      this.sql.all(
        DRIVE_PLACE_ROW,
        `select p.id, p.name, p.admin, p.country, p.lat, p.lon
         from drive_places_rt r join drive_places p on p.rowid = r.rid
         where r.minlat <= $north and r.maxlat >= $south and r.minlon <= $east and r.maxlon >= $west`,
        { north: lat + radius, south: lat - radius, east, west },
      ),
    );
  }
}

export interface PlacesServiceOptions {
  readonly context: StoreContext;
  readonly reader: Pick<StoreReader, 'all'>;
  readonly datasetPath: string;
  readonly log: Logger;
}

export interface DatasetLoad {
  readonly places: number;
  readonly replaced: boolean;
}

export class PlacesService {
  private readonly places: DrivePlacesRepository;
  private readonly media: DriveMediaRepository;
  private readonly settings: SettingsKvRepository;
  private readonly index: PlaceIndex;

  constructor(private readonly options: PlacesServiceOptions) {
    this.places = new DrivePlacesRepository(options.context);
    this.media = new DriveMediaRepository(options.context);
    this.settings = new SettingsKvRepository(options.context);
    this.index = new PlaceIndex(options.context.sql);
  }

  async load(): Promise<DatasetLoad> {
    const loading = this.options.log.operation('photos.places_loading');
    const bytes = await readFile(this.options.datasetPath);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const saved = this.savedDataset();
    const replaced = saved?.sha256 !== sha256;
    const count = saved?.sha256 === sha256 ? saved.count : await this.replaceDataset(bytes, sha256);
    const assigned = await this.assignPending(replaced);
    loading.succeeded({ places: count, replaced, assigned });
    return { places: count, replaced };
  }

  private async replaceDataset(bytes: Uint8Array, sha256: string): Promise<number> {
    const lines = datasetLines((await gunzipAsync(bytes)).toString('utf8'));
    const ids: string[] = [];
    await inSlices(this.options.context, lines, ([line, index]) => {
      const place = placeOfLine(line, index);
      this.places.save(place);
      ids.push(place.id);
    });
    this.options.context.write(() => {
      this.places.keepOnly(ids);
      this.settings.save(DATASET_SETTING_KEY, { sha256, count: ids.length });
    });
    return ids.length;
  }

  assign(itemId: string): string | null {
    const point = found(
      this.options.context.sql.get(
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

  async assignPending(everything: boolean): Promise<number> {
    const { context } = this.options;
    const located = await this.options.reader.all(
      LOCATED,
      `select i.id as item_id, i.place_lat as lat, i.place_lon as lon
       from drive_items i join drive_media m on m.item_id = i.id
       where i.place_lat is not null and ($everything = 1 or m.place_id is null)`,
      { everything: everything ? 1 : 0 },
    );
    await inSlices(context, located, (row) => {
      const place = this.index.nearest(row.lat, row.lon);
      this.media.update(row.item_id, { place_id: place?.id ?? null });
    });
    context.write(() =>
      context.sql.run(
        'clear the places of items that lost their location',
        `update drive_media set place_id = null
         where place_id is not null and item_id in (select id from drive_items where place_lat is null)`,
      ),
    );
    return located.length;
  }

  private savedDataset(): z.output<typeof DATASET_SETTING> | undefined {
    const saved = this.settings.read(DATASET_SETTING_KEY);
    return saved === null ? undefined : DATASET_SETTING.parse(saved);
  }
}
