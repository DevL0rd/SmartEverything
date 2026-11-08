import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { found, type StoreContext } from '../store/context';
import { DriveMediaRepository } from '../store/repositories/drive-media';
import {
  DRIVE_PLACE_ROW,
  DrivePlacesRepository,
  type DrivePlaceRow,
} from '../store/repositories/drive-places';
import { SettingsKvRepository } from '../store/repositories/settings-kv';

const DATASET_SETTING_KEY = 'photos-places';

const DATASET_SETTING = z.strictObject({ sha256: z.string(), count: z.int().nonnegative() });

const WINDOWS = [0.25, 1, 4, 16, 64, 180] as const;

const POLE_FLOOR = 0.05;

const WRITE_BATCH = 1000;

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

const COUNT = z.strictObject({ total: z.int().nonnegative() });

export class PlacesDatasetError extends Error {
  override readonly name = 'PlacesDatasetError';

  constructor(
    readonly line: number,
    cause: unknown,
  ) {
    super(`The places dataset has an unreadable row at line ${String(line)}.`, { cause });
  }
}

export function parseDataset(bytes: Uint8Array): readonly DrivePlaceRow[] {
  const lines = gunzipSync(bytes).toString('utf8').split('\n');
  return lines.flatMap((line, index) => {
    if (line === '') return [];
    try {
      const [id, name, admin, country, lat, lon] = FIELDS.parse(line.split('\t'));
      return [
        DRIVE_PLACE_ROW.parse({
          id,
          name,
          admin: admin === '' ? null : admin,
          country,
          lat: Number(lat),
          lon: Number(lon),
        }),
      ];
    } catch (cause) {
      throw new PlacesDatasetError(index + 1, cause);
    }
  });
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
  private database = new DatabaseSync(':memory:');
  private window: StatementSync | undefined;

  replace(places: readonly DrivePlaceRow[]): void {
    this.database.close();
    this.database = new DatabaseSync(':memory:');
    this.database.exec(
      `create table place (rid integer primary key, id text not null, name text not null, admin text,
         country text not null, lat real not null, lon real not null);
       create virtual table place_rt using rtree(rid, minlat, maxlat, minlon, maxlon);`,
    );
    const insertPlace = this.database.prepare('insert into place values (?, ?, ?, ?, ?, ?, ?)');
    const insertBox = this.database.prepare('insert into place_rt values (?, ?, ?, ?, ?)');
    this.database.exec('begin');
    for (const [index, place] of places.entries()) {
      const rid = index + 1;
      insertPlace.run(rid, place.id, place.name, place.admin, place.country, place.lat, place.lon);
      insertBox.run(rid, place.lat, place.lat, place.lon, place.lon);
    }
    this.database.exec('commit');
    this.window = this.database.prepare(
      `select p.id, p.name, p.admin, p.country, p.lat, p.lon
       from place_rt r join place p on p.rid = r.rid
       where r.minlat <= ? and r.maxlat >= ? and r.minlon <= ? and r.maxlon >= ?`,
    );
  }

  get size(): number {
    const row = COUNT.parse(this.database.prepare('select count(*) as total from place').get());
    return row.total;
  }

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
    const window = this.window;
    if (window === undefined) return [];
    const span = radius / longitudeFactor(lat);
    return longitudeRanges(lon, span).flatMap(([west, east]) =>
      window.all(lat + radius, lat - radius, east, west).map((row) => DRIVE_PLACE_ROW.parse(row)),
    );
  }
}

export interface PlacesServiceOptions {
  readonly context: StoreContext;
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
  private readonly index = new PlaceIndex();

  constructor(private readonly options: PlacesServiceOptions) {
    this.places = new DrivePlacesRepository(options.context);
    this.media = new DriveMediaRepository(options.context);
    this.settings = new SettingsKvRepository(options.context);
  }

  async load(): Promise<DatasetLoad> {
    const loading = this.options.log.operation('photos.places_loading');
    const bytes = readFileSync(this.options.datasetPath);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const rows = parseDataset(bytes);
    const saved = this.savedDataset();
    const replaced = saved?.sha256 !== sha256;
    if (replaced) {
      this.places.replaceAll(rows);
      this.settings.save(DATASET_SETTING_KEY, { sha256, count: rows.length });
    }
    this.index.replace(rows);
    const assigned = await this.assignPending(replaced);
    loading.succeeded({ places: rows.length, replaced, assigned });
    return { places: rows.length, replaced };
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
    const located = context.sql.all(
      LOCATED,
      `select i.id as item_id, i.place_lat as lat, i.place_lon as lon
       from drive_items i join drive_media m on m.item_id = i.id
       where i.place_lat is not null and ($everything = 1 or m.place_id is null)`,
      { everything: everything ? 1 : 0 },
    );
    for (let start = 0; start < located.length; start += WRITE_BATCH) {
      context.write(() => {
        for (const row of located.slice(start, start + WRITE_BATCH)) {
          const place = this.index.nearest(row.lat, row.lon);
          this.media.update(row.item_id, { place_id: place?.id ?? null });
        }
      });
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
    }
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
