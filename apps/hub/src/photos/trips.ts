import type { GeoPoint, Trip, YearInReview } from '@smarteverything/domain';
import { z } from 'zod';
import type { DriveActor } from '../drive/service-read';
import type { StoreContext } from '../store/context';
import { DrivePlacesRepository } from '../store/repositories/drive-places';
import {
  LOCAL_DAY,
  LOCAL_SECONDS,
  PHOTO_FROM,
  PHOTO_SHOWN,
  dayRange,
  visibility,
  type Statement,
} from './timeline';

export const TRIP_GAP_DAYS = 1;

export const TRIP_MIN_DAYS = 2;

export const AWAY_KM = 50;

const DAY_MS = 86_400_000;

const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'] as const;

const EARTH_RADIUS_KM = 6371;

export interface DayStat {
  readonly day: string;
  readonly count: number;
  readonly located: number;
  readonly lat: number | null;
  readonly lon: number | null;
  readonly favourites: number;
  readonly firstSeconds: number;
  readonly lastSeconds: number;
  readonly coverItemId: string;
}

export interface DayPlaces {
  readonly day: string;
  readonly placeId: string;
  readonly count: number;
}

export interface DayRangeQuery {
  readonly fromDay: string | null;
  readonly toDay: string | null;
}

const DAY_ROW = z.strictObject({
  day: z.string(),
  count: z.int().positive(),
  located: z.int().nonnegative(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  favourites: z.int().nonnegative(),
  first_seconds: z.number(),
  last_seconds: z.number(),
  cover_item_id: z.string(),
});

const DAY_PLACE_ROW = z.strictObject({
  day: z.string(),
  place_id: z.string(),
  count: z.int().positive(),
});

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function distanceKm(from: GeoPoint, to: GeoPoint): number {
  const latitude = radians(to.latitude - from.latitude);
  const longitude = radians(to.longitude - from.longitude);
  const a =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(longitude / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

function dayNumber(day: string): number {
  return Math.round(Date.parse(day) / DAY_MS);
}

export function placeIdOf(id: string): number {
  const value = Number(id);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`The place ${id} has no numeric id for the photos contract.`);
  }
  return value;
}

export function daysStatement(actor: DriveActor, range: DayRangeQuery): Statement {
  const window = dayRange(range.fromDay, range.toDay);
  return {
    text: `with shown as (
         select i.id, i.starred, i.place_lat, i.place_lon, ${LOCAL_DAY} as day,
           ${LOCAL_SECONDS} as seconds,
           row_number() over (
             partition by ${LOCAL_DAY} order by i.starred desc, i.taken_at, i.id
           ) as rank
         from ${PHOTO_FROM}
         where ${PHOTO_SHOWN}${window.text}
       )
       select day, count(*) as count, count(place_lat) as located, avg(place_lat) as lat,
         avg(place_lon) as lon, sum(starred) as favourites, min(seconds) as first_seconds,
         max(seconds) as last_seconds, max(case when rank = 1 then id end) as cover_item_id
       from shown group by day order by day`,
    parameters: { ...visibility(actor), ...window.parameters },
  };
}

export function readDays(
  context: StoreContext,
  actor: DriveActor,
  range: DayRangeQuery,
): DayStat[] {
  const statement = daysStatement(actor, range);
  return context.sql.all(DAY_ROW, statement.text, statement.parameters).map((row) => ({
    day: row.day,
    count: row.count,
    located: row.located,
    lat: row.lat,
    lon: row.lon,
    favourites: row.favourites,
    firstSeconds: row.first_seconds,
    lastSeconds: row.last_seconds,
    coverItemId: row.cover_item_id,
  }));
}

export function readDayPlaces(
  context: StoreContext,
  actor: DriveActor,
  range: DayRangeQuery,
): DayPlaces[] {
  const window = dayRange(range.fromDay, range.toDay);
  return context.sql
    .all(
      DAY_PLACE_ROW,
      `select ${LOCAL_DAY} as day, m.place_id as place_id, count(*) as count
       from ${PHOTO_FROM}
       where ${PHOTO_SHOWN} and m.place_id is not null${window.text}
       group by day, m.place_id`,
      { ...visibility(actor), ...window.parameters },
    )
    .map((row) => ({ day: row.day, placeId: row.place_id, count: row.count }));
}

export function dominantPlace(
  places: readonly DayPlaces[],
  from: string,
  to: string,
): string | null {
  const totals = new Map<string, number>();
  for (const entry of places) {
    if (entry.day >= from && entry.day <= to) {
      totals.set(entry.placeId, (totals.get(entry.placeId) ?? 0) + entry.count);
    }
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return ranked[0]?.[0] ?? null;
}

function clustersOf(located: readonly DayStat[]): DayStat[][] {
  const clusters: DayStat[][] = [];
  for (const day of located) {
    const current = clusters.at(-1);
    const previous = current?.at(-1);
    const joins =
      current !== undefined &&
      previous !== undefined &&
      dayNumber(day.day) - dayNumber(previous.day) <= TRIP_GAP_DAYS + 1;
    if (joins) {
      current.push(day);
    } else {
      clusters.push([day]);
    }
  }
  return clusters;
}

function centroidOf(cluster: readonly DayStat[]): GeoPoint | null {
  const located = cluster.reduce((sum, day) => sum + day.located, 0);
  if (located === 0) {
    return null;
  }
  const weighted = (pick: (day: DayStat) => number | null): number =>
    cluster.reduce((sum, day) => sum + (pick(day) ?? 0) * day.located, 0) / located;
  return { latitude: weighted((day) => day.lat), longitude: weighted((day) => day.lon) };
}

export interface TripDraft {
  readonly from: string;
  readonly to: string;
  readonly count: number;
  readonly coverItemId: string;
  readonly centroid: GeoPoint;
  readonly distanceFromHomeKm: number | null;
}

export function tripDrafts(days: readonly DayStat[], home: GeoPoint | null): TripDraft[] {
  const located = days.filter((day) => day.located > 0);
  return clustersOf(located)
    .filter((cluster) => cluster.length >= TRIP_MIN_DAYS)
    .flatMap((cluster) => {
      const centroid = centroidOf(cluster);
      const first = cluster[0];
      const last = cluster.at(-1);
      if (centroid === null || first === undefined || last === undefined) {
        return [];
      }
      const distance = home === null ? null : Math.round(distanceKm(home, centroid) * 10) / 10;
      if (distance !== null && distance < AWAY_KM) {
        return [];
      }
      const inside = days.filter((day) => day.day >= first.day && day.day <= last.day);
      const cover = [...cluster].sort((a, b) => b.count - a.count || a.day.localeCompare(b.day))[0];
      return [
        {
          from: first.day,
          to: last.day,
          count: inside.reduce((sum, day) => sum + day.count, 0),
          coverItemId: cover?.coverItemId ?? first.coverItemId,
          centroid,
          distanceFromHomeKm: distance,
        },
      ];
    });
}

export function placeCount(places: readonly DayPlaces[], from: string, to: string): number {
  return new Set(
    places.filter((entry) => entry.day >= from && entry.day <= to).map((entry) => entry.placeId),
  ).size;
}

export function perDayOf(days: readonly DayStat[], from: string, to: string): Trip['perDay'] {
  const counts = new Map(days.map((day) => [day.day, day.count]));
  return Array.from({ length: dayNumber(to) - dayNumber(from) + 1 }, (_, offset) => {
    const day = shiftDay(from, offset);
    return { day, count: counts.get(day) ?? 0 };
  });
}

export function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(day) + days * DAY_MS).toISOString().slice(0, 10);
}

export function sameDayYearsAgo(today: string, years: number): string | null {
  const year = Number(today.slice(0, 4)) - years;
  const target = `${String(year).padStart(4, '0')}${today.slice(4)}`;
  return new Date(Date.parse(target)).toISOString().slice(0, 10) === target ? target : null;
}

export function perMonth(year: number, days: readonly DayStat[]): YearInReview['perMonth'] {
  return MONTHS.map((month) => {
    const key = `${String(year)}-${month}`;
    return {
      month: key,
      count: days.filter((day) => day.day.startsWith(key)).reduce((sum, day) => sum + day.count, 0),
    };
  });
}

export function mostFavouritedMonth(year: number, days: readonly DayStat[]): string | null {
  const totals = perMonth(year, days).map((entry) => ({
    month: entry.month,
    favourites: days
      .filter((day) => day.day.startsWith(entry.month))
      .reduce((sum, day) => sum + day.favourites, 0),
  }));
  const top = totals.sort(
    (a, b) => b.favourites - a.favourites || a.month.localeCompare(b.month),
  )[0];
  return top !== undefined && top.favourites > 0 ? top.month : null;
}

export function longestDayOut(days: readonly DayStat[]): { day: string; count: number } | null {
  const span = (day: DayStat): number => day.lastSeconds - day.firstSeconds;
  const top = days
    .filter((day) => day.located > 0)
    .sort((a, b) => span(b) - span(a) || a.day.localeCompare(b.day))[0];
  return top === undefined ? null : { day: top.day, count: top.count };
}

export function cameraName(make: string | null, model: string | null): string | null {
  if (model === null) {
    return make;
  }
  return make === null || model.startsWith(make) ? model : `${make} ${model}`;
}

export function bounds(days: readonly DayStat[]): { count: number; cover: string } | null {
  const top = [...days].sort((a, b) => b.count - a.count || a.day.localeCompare(b.day))[0];
  return top === undefined
    ? null
    : { count: days.reduce((sum, day) => sum + day.count, 0), cover: top.coverItemId };
}

export function tripId(from: string): string {
  return `trip:${from}`;
}

export class TripsReader {
  private readonly places: DrivePlacesRepository;

  constructor(private readonly context: StoreContext) {
    this.places = new DrivePlacesRepository(context);
  }

  list(actor: DriveActor, home: GeoPoint | null, range: DayRangeQuery): Trip[] {
    const days = readDays(this.context, actor, range);
    const drafts = tripDrafts(days, home);
    if (drafts.length === 0) {
      return [];
    }
    const dayPlaces = readDayPlaces(this.context, actor, range);
    return drafts
      .map((draft) => {
        const placeId = dominantPlace(dayPlaces, draft.from, draft.to);
        return {
          id: tripId(draft.from),
          kind: 'trip' as const,
          from: draft.from,
          to: draft.to,
          count: draft.count,
          coverItemId: draft.coverItemId,
          placeId: placeId === null ? null : placeIdOf(placeId),
          placeName: placeId === null ? null : (this.places.find(placeId)?.name ?? null),
          distanceFromHomeKm: draft.distanceFromHomeKm,
          places: placeCount(dayPlaces, draft.from, draft.to),
          perDay: perDayOf(days, draft.from, draft.to),
        };
      })
      .sort((a, b) => b.from.localeCompare(a.from));
  }
}
