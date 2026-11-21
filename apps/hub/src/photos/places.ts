import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { sha256Hex } from '../drive/digest';
import { fsCode } from '../fs-code';
import type { StoreHost } from '../store/host/host';
import type { Sql } from '../store/sql';
import { DRIVE_PLACE_ROW, type DrivePlaceRow } from '../store/repositories/drive-places';

const gunzipAsync = promisify(gunzip);

const SHIPPED = new URL('places/cities.tsv.gz', import.meta.url);
const CHECKOUT = new URL('../../assets/places/cities.tsv.gz', import.meta.url);

async function present(candidate: URL): Promise<boolean> {
  try {
    await access(candidate);
    return true;
  } catch (cause) {
    if (fsCode(cause) === 'ENOENT') return false;
    throw cause;
  }
}

export async function placesDatasetPath(): Promise<string> {
  for (const candidate of [SHIPPED, CHECKOUT]) {
    if (await present(candidate)) return fileURLToPath(candidate);
  }
  throw new Error(
    `The places dataset is missing: neither ${fileURLToPath(SHIPPED)} nor ${fileURLToPath(CHECKOUT)} exists.`,
  );
}

export const DATASET_SETTING_KEY = 'photos-places';

export const DATASET_SETTING = z.strictObject({
  sha256: z.string(),
  count: z.int().nonnegative(),
});

export type PlacesDataset = z.output<typeof DATASET_SETTING>;

const SAVE_BATCH = 2048;

const ASSIGN_BATCH = 512;
const CLEAR_BATCH = 512;

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

export const LOCATED = z.strictObject({
  item_id: z.string(),
  lat: z.number(),
  lon: z.number(),
});

export type LocatedItem = z.output<typeof LOCATED>;

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

const NEWLINE = 0x0a;

function* datasetLines(text: Buffer): Generator<readonly [string, number]> {
  let start = 0;
  let index = 0;
  while (start < text.length) {
    const found = text.indexOf(NEWLINE, start);
    const end = found === -1 ? text.length : found;
    if (end > start) yield [text.toString('utf8', start, end), index] as const;
    start = end + 1;
    index += 1;
  }
}

export async function parseDataset(bytes: Uint8Array): Promise<readonly DrivePlaceRow[]> {
  return Array.from(datasetLines(await gunzipAsync(bytes)), ([line, index]) =>
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

export interface PlacesStore {
  readonly dataset: () => Promise<PlacesDataset | undefined>;
  readonly save: (places: readonly DrivePlaceRow[]) => Promise<void>;
  readonly keep: (ids: readonly string[], dataset: PlacesDataset) => Promise<void>;
  readonly located: (everything: boolean) => Promise<LocatedItem[]>;
  readonly assign: (itemId: string) => Promise<string | null>;
  readonly assignLocated: (located: readonly LocatedItem[]) => Promise<void>;
  readonly lost: () => Promise<string[]>;
  readonly clearLost: (itemIds: readonly string[]) => Promise<void>;
}

export function hostedPlaces(host: StoreHost): PlacesStore {
  return {
    dataset: () => host.read('photoPlacesDataset', null),
    save: (places) => host.write('photoPlacesSave', { places }),
    keep: (ids, dataset) => host.write('photoPlacesKeep', { ids, dataset }),
    located: (everything) => host.read('photoPlacesLocated', { everything }),
    assign: (itemId) => host.write('photoPlaceAssign', { itemId }),
    assignLocated: (located) => host.write('photoPlacesAssignLocated', { located }),
    lost: () => host.read('photoPlacesLost', null),
    clearLost: (itemIds) => host.write('photoPlacesClearLost', { itemIds }),
  };
}

export interface PlacesServiceOptions {
  readonly store: PlacesStore;
  readonly datasetPath: () => Promise<string>;
  readonly log: Logger;
}

export interface DatasetLoad {
  readonly places: number;
  readonly replaced: boolean;
}

export class PlacesService {
  constructor(private readonly options: PlacesServiceOptions) {}

  async load(): Promise<DatasetLoad> {
    const loading = this.options.log.operation('photos.places_loading');
    const bytes = await readFile(await this.options.datasetPath());
    const sha256 = await sha256Hex(bytes);
    const saved = await this.options.store.dataset();
    const replaced = saved?.sha256 !== sha256;
    const count = saved?.sha256 === sha256 ? saved.count : await this.replaceDataset(bytes, sha256);
    const assigned = await this.assignPending(replaced);
    loading.succeeded({ places: count, replaced, assigned });
    return { places: count, replaced };
  }

  private async replaceDataset(bytes: Uint8Array, sha256: string): Promise<number> {
    const { store } = this.options;
    const ids: string[] = [];
    let batch: DrivePlaceRow[] = [];
    for (const [line, index] of datasetLines(await gunzipAsync(bytes))) {
      const place = placeOfLine(line, index);
      batch.push(place);
      ids.push(place.id);
      if (batch.length === SAVE_BATCH) {
        await store.save(batch);
        batch = [];
      }
    }
    if (batch.length > 0) await store.save(batch);
    await store.keep(ids, { sha256, count: ids.length });
    return ids.length;
  }

  assign(itemId: string): Promise<string | null> {
    return this.options.store.assign(itemId);
  }

  async assignPending(everything: boolean): Promise<number> {
    const { store } = this.options;
    const located = await store.located(everything);
    for (let start = 0; start < located.length; start += ASSIGN_BATCH) {
      await store.assignLocated(located.slice(start, start + ASSIGN_BATCH));
    }
    const lost = await store.lost();
    for (let start = 0; start < lost.length; start += CLEAR_BATCH) {
      await store.clearLost(lost.slice(start, start + CLEAR_BATCH));
    }
    return located.length;
  }
}
