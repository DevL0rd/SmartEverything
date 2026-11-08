import { appendTo } from '@smarteverything/domain';
import { z } from 'zod';
import type { DriveActor } from '../drive/service-read';
import { found, type StoreContext } from '../store/context';
import { DrivePlacesRepository, type DrivePlaceRow } from '../store/repositories/drive-places';
import type { SqlParameters } from '../store/sql';
import { PHOTO_VISIBLE } from './membership';
import type {
  PhotoMapClusters,
  PhotoMapMonths,
  PhotoMapQuery,
  PhotoPlace,
  PhotoPlaceDetail,
  PhotoPlaceList,
  PhotoPlaceVisit,
} from './places-schema';

const ALPHABET = '0123456789bcdefghjkmnpqrstuvwxyz';

const GEOHASH_LIMIT = 12;

const MILLIS_PER_DAY = 86_400_000;

const LOCAL_DAY = `date(i.taken_at, coalesce(m.tz_offset_min, 0) || ' minutes')`;

const MOMENT = z.string().min(1);

const CLUSTER_ROW = z.strictObject({
  x: z.number(),
  y: z.number(),
  total: z.int().positive(),
  lat: z.number(),
  lon: z.number(),
  first_at: MOMENT.nullable(),
  latest_at: MOMENT.nullable(),
  cover_item_id: z.string(),
  cover_place_id: z.string().nullable(),
});

const MONTH_ROW = z.strictObject({ month: z.string(), count: z.int().positive() });

const PLACE_COLUMNS = z.strictObject({
  id: z.string(),
  name: z.string(),
  admin: z.string().nullable(),
  country: z.string(),
  lat: z.number(),
  lon: z.number(),
});

const LIST_ROW = PLACE_COLUMNS.extend({
  total: z.int().positive(),
  latest: MOMENT.nullable(),
  cover_item_id: z.string(),
});

const TOTALS_ROW = z.strictObject({
  items: z.int().nonnegative(),
  images: z.int().nonnegative(),
  videos: z.int().nonnegative(),
  favourites: z.int().nonnegative(),
  first_at: MOMENT.nullable(),
  latest_at: MOMENT.nullable(),
  cover_item_id: z.string().nullable(),
});

const DAY_ROW = z.strictObject({ day: z.string(), count: z.int().positive() });

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

export function geohashPrecision(zoom: number): number {
  return Math.min(GEOHASH_LIMIT, Math.floor(zoom / 2) + 1);
}

export function geohashOf(x: number, y: number, precision: number): string {
  const lonBits = Math.ceil((precision * 5) / 2);
  const latBits = Math.floor((precision * 5) / 2);
  let hash = '';
  let value = 0;
  for (let step = 0; step < precision * 5; step += 1) {
    const consumed = Math.floor(step / 2);
    const lonTurn = step % 2 === 0;
    const bit = lonTurn ? (x >> (lonBits - 1 - consumed)) & 1 : (y >> (latBits - 1 - consumed)) & 1;
    value = value * 2 + bit;
    if (step % 5 === 4) {
      hash += ALPHABET.charAt(value);
      value = 0;
    }
  }
  return hash;
}

export function visitsOf(days: readonly { day: string; count: number }[]): PhotoPlaceVisit[] {
  const visits: { from: string; to: string; days: number; count: number }[] = [];
  for (const { day, count } of days) {
    const last = visits.at(-1);
    const gap =
      last === undefined ? Infinity : (Date.parse(day) - Date.parse(last.to)) / MILLIS_PER_DAY;
    if (last !== undefined && gap === 1) {
      last.to = day;
      last.days += 1;
      last.count += count;
    } else {
      visits.push({ from: day, to: day, days: 1, count });
    }
  }
  return visits;
}

function visibility(actor: DriveActor): SqlParameters {
  return { owner: actor.owner ? 1 : 0, profile: actor.profileId };
}

function placeOf(row: DrivePlaceRow): PhotoPlace {
  return {
    id: row.id,
    name: row.name,
    admin: row.admin,
    country: row.country,
    countryName: regionNames.of(row.country) ?? row.country,
    lat: row.lat,
    lon: row.lon,
  };
}

function mapFilter(query: PhotoMapQuery): { text: string; parameters: SqlParameters } {
  const clauses: string[] = [];
  const parameters: Record<string, string | number> = {};
  if (query.from !== undefined) {
    clauses.push('unixepoch(i.taken_at) >= unixepoch($from)');
    parameters['from'] = query.from;
  }
  if (query.to !== undefined) {
    clauses.push('unixepoch(i.taken_at) <= unixepoch($to)');
    parameters['to'] = query.to;
  }
  if (
    query.south !== undefined &&
    query.north !== undefined &&
    query.west !== undefined &&
    query.east !== undefined
  ) {
    clauses.push('i.place_lat between $south and $north');
    clauses.push(
      query.west > query.east
        ? '(i.place_lon >= $west or i.place_lon <= $east)'
        : 'i.place_lon between $west and $east',
    );
    Object.assign(parameters, {
      south: query.south,
      north: query.north,
      west: query.west,
      east: query.east,
    });
  }
  return { text: clauses.map((clause) => ` and ${clause}`).join(''), parameters };
}

export class PlaceQueries {
  private readonly places: DrivePlacesRepository;

  constructor(private readonly context: StoreContext) {
    this.places = new DrivePlacesRepository(context);
  }

  clusters(actor: DriveActor, query: PhotoMapQuery): PhotoMapClusters {
    const precision = geohashPrecision(query.zoom);
    const lonCells = 2 ** Math.ceil((precision * 5) / 2);
    const latCells = 2 ** Math.floor((precision * 5) / 2);
    const filter = mapFilter(query);
    const rows = this.context.sql.all(
      CLUSTER_ROW,
      `with cells as (
         select i.id, i.taken_at, i.place_lat as lat, i.place_lon as lon, m.place_id,
           min(cast((i.place_lon + 180.0) / 360.0 * $lonCells as integer), $lonCells - 1) as x,
           min(cast((i.place_lat + 90.0) / 180.0 * $latCells as integer), $latCells - 1) as y
         from drive_items i
           join drive_roots r on r.id = i.root_id
           left join drive_media m on m.item_id = i.id
         where i.place_lat is not null and ${PHOTO_VISIBLE}${filter.text}
       ), ranked as (
         select *,
           row_number() over (partition by x, y order by unixepoch(taken_at) desc nulls last, id) as newest,
           row_number() over (partition by x, y order by unixepoch(taken_at) asc nulls last, id) as oldest
         from cells
       )
       select x, y, count(*) as total, avg(lat) as lat, avg(lon) as lon,
         max(case when oldest = 1 then taken_at end) as first_at,
         max(case when newest = 1 then taken_at end) as latest_at,
         max(case when newest = 1 then id end) as cover_item_id,
         max(case when newest = 1 then place_id end) as cover_place_id
       from ranked group by x, y order by total desc, x, y`,
      { ...visibility(actor), ...filter.parameters, lonCells, latCells },
    );
    const clusters = rows.map((row) => ({
      key: geohashOf(row.x, row.y, precision),
      lat: row.lat,
      lon: row.lon,
      count: row.total,
      first: row.first_at,
      latest: row.latest_at,
      coverItemId: row.cover_item_id,
      placeName:
        row.cover_place_id === null ? null : (this.places.find(row.cover_place_id)?.name ?? null),
    }));
    return {
      zoom: query.zoom,
      precision,
      total: clusters.reduce((sum, cluster) => sum + cluster.count, 0),
      clusters,
    };
  }

  months(actor: DriveActor): PhotoMapMonths {
    const rows = this.context.sql.all(
      MONTH_ROW,
      `select strftime('%Y-%m', i.taken_at, coalesce(m.tz_offset_min, 0) || ' minutes') as month,
         count(*) as count
       from drive_items i
         join drive_roots r on r.id = i.root_id
         left join drive_media m on m.item_id = i.id
       where i.place_lat is not null and i.taken_at is not null and ${PHOTO_VISIBLE}
       group by month order by month`,
      visibility(actor),
    );
    return { months: rows };
  }

  list(actor: DriveActor): PhotoPlaceList {
    const rows = this.context.sql.all(
      LIST_ROW,
      `with located as (
         select m.place_id, i.id, i.taken_at,
           row_number() over (partition by m.place_id order by unixepoch(i.taken_at) desc nulls last, i.id) as newest
         from drive_media m
           join drive_items i on i.id = m.item_id
           join drive_roots r on r.id = i.root_id
         where m.place_id is not null and ${PHOTO_VISIBLE}
       )
       select p.id, p.name, p.admin, p.country, p.lat, p.lon, count(*) as total,
         max(case when newest = 1 then taken_at end) as latest,
         max(case when newest = 1 then l.id end) as cover_item_id
       from located l join drive_places p on p.id = l.place_id
       group by p.id order by total desc, p.name, p.id`,
      visibility(actor),
    );
    const byCountry = new Map<string, (typeof rows)[number][]>();
    for (const row of rows) appendTo(byCountry, row.country, row);
    const countries = [...byCountry.entries()]
      .map(([country, entries]) => ({
        country,
        name: regionNames.of(country) ?? country,
        count: entries.reduce((sum, entry) => sum + entry.total, 0),
        places: entries.map((entry) => ({
          place: placeOf(entry),
          count: entry.total,
          latest: entry.latest,
          coverItemId: entry.cover_item_id,
        })),
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return { countries };
  }

  detail(actor: DriveActor, placeId: string): PhotoPlaceDetail {
    const place = this.places.byId(placeId);
    const parameters = { ...visibility(actor), placeId };
    const totals = this.totals(parameters, placeId);
    const days = this.days(parameters);
    return {
      place: placeOf(place),
      items: totals.items,
      images: totals.images,
      videos: totals.videos,
      favourites: totals.favourites,
      days: days.length,
      first: totals.first_at,
      latest: totals.latest_at,
      coverItemId: totals.cover_item_id,
      visits: visitsOf(days),
    };
  }

  private totals(parameters: SqlParameters, placeId: string): z.output<typeof TOTALS_ROW> {
    return found(
      this.context.sql.get(
        TOTALS_ROW,
        `with at_place as (
           select i.id, i.kind, i.starred, i.taken_at,
             row_number() over (order by unixepoch(i.taken_at) desc nulls last, i.id) as newest,
             row_number() over (order by unixepoch(i.taken_at) asc nulls last, i.id) as oldest
           from drive_media m
             join drive_items i on i.id = m.item_id
             join drive_roots r on r.id = i.root_id
           where m.place_id = $placeId and ${PHOTO_VISIBLE}
         )
         select count(*) as items,
           count(case when kind = 'image' then 1 end) as images,
           count(case when kind = 'video' then 1 end) as videos,
           count(case when starred = 1 then 1 end) as favourites,
           max(case when oldest = 1 then taken_at end) as first_at,
           max(case when newest = 1 then taken_at end) as latest_at,
           max(case when newest = 1 then id end) as cover_item_id
         from at_place`,
        parameters,
      ),
      'place statistics',
      placeId,
    );
  }

  private days(parameters: SqlParameters): z.output<typeof DAY_ROW>[] {
    return this.context.sql.all(
      DAY_ROW,
      `select ${LOCAL_DAY} as day, count(*) as count
       from drive_media m
         join drive_items i on i.id = m.item_id
         join drive_roots r on r.id = i.root_id
       where m.place_id = $placeId and i.taken_at is not null and ${PHOTO_VISIBLE}
       group by day order by day`,
      parameters,
    );
  }
}
