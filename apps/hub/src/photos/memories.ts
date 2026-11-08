import {
  ApiError,
  type DriveQueryPage,
  type GeoPoint,
  type Memory,
  type YearInReview,
} from '@smarteverything/domain';
import { z } from 'zod';
import { DRIVE_PAGE_SIZE, type DriveActor } from '../drive/service-read';
import type { StoreContext } from '../store/context';
import type { SqlParameters } from '../store/sql';
import { PHOTO_VISIBLE } from './membership';
import { DriveItemsRepository } from '../store/repositories/drive-items';
import { DrivePlacesRepository } from '../store/repositories/drive-places';
import {
  LOCAL_DAY,
  PHOTO_FROM,
  PHOTO_SHOWN,
  dayRange,
  afterCursor,
  encodeCursor,
  visibility,
  type Statement,
} from './timeline';
import {
  TripsReader,
  cameraName,
  dominantPlace,
  longestDayOut,
  mostFavouritedMonth,
  bounds,
  perMonth,
  placeIdOf,
  sameDayYearsAgo,
  shiftDay,
  readDayPlaces,
  readDays,
  type DayPlaces,
  type DayStat,
} from './trips';

export const MEMORY_WINDOW_DAYS = 365;

const WEEK_RADIUS_DAYS = 3;

const BURST_ROW = z.strictObject({
  stack_id: z.string(),
  count: z.int().positive(),
  day: z.string(),
  cover_item_id: z.string(),
});

const FIRST_ROW = z.strictObject({ first: z.string().nullable() });

const ITEM_ROW = z.strictObject({ id: z.string(), taken_at: z.string() });

const COUNT_ROW = z.strictObject({ place_id: z.string(), count: z.int().positive() });

const CAMERA_ROW = z.strictObject({
  make: z.string().nullable(),
  model: z.string().nullable(),
  count: z.int().positive(),
});

const DAY_KEY = z.iso.date();

const YEAR_KEY = z.string().regex(/^\d{4}$/);

const STACK_KEY = z.uuid();

export interface MemoryContext {
  readonly today: string;
  readonly home: GeoPoint | null;
}

export type MemorySpec =
  | { readonly kind: 'days'; readonly fromDay: string; readonly toDay: string }
  | { readonly kind: 'stack'; readonly stackId: string };

function invalidMemory(): ApiError {
  return new ApiError('not_found', 'There is no such memory.');
}

function fail(): never {
  throw invalidMemory();
}

function daysSpec(
  parsed: { readonly success: boolean },
  fromDay: string,
  toDay: string,
): MemorySpec {
  return parsed.success ? { kind: 'days', fromDay, toDay } : fail();
}

export class MemoriesReader {
  private readonly places: DrivePlacesRepository;

  private readonly items: DriveItemsRepository;

  private readonly trips: TripsReader;

  constructor(private readonly context: StoreContext) {
    this.places = new DrivePlacesRepository(context);
    this.items = new DriveItemsRepository(context);
    this.trips = new TripsReader(context);
  }

  private firstYear(): number | null {
    const row = this.context.sql.get(
      FIRST_ROW,
      `select min(taken_at) as first from drive_items
       where kind in ('image', 'video', 'audio') and taken_at is not null`,
    );
    const first = row?.first ?? null;
    return first === null ? null : Number(first.slice(0, 4));
  }

  private anniversaries(actor: DriveActor, today: string, firstYear: number): Memory[] {
    const memories: Memory[] = [];
    const thisYear = Number(today.slice(0, 4));
    for (let ago = 1; ago <= thisYear - firstYear; ago += 1) {
      const day = sameDayYearsAgo(today, ago);
      if (day === null) {
        continue;
      }
      const exact = bounds(readDays(this.context, actor, { fromDay: day, toDay: day }));
      if (exact !== null) {
        memories.push({
          id: `on_this_day:${String(ago)}`,
          kind: 'on_this_day',
          yearsAgo: ago,
          from: day,
          to: day,
          count: exact.count,
          coverItemId: exact.cover,
        });
      }
      const week = this.week(actor, day, ago);
      if (week !== null) {
        memories.push(week);
      }
    }
    return memories;
  }

  private week(actor: DriveActor, day: string, ago: number): Memory | null {
    const from = shiftDay(day, -WEEK_RADIUS_DAYS);
    const to = shiftDay(day, WEEK_RADIUS_DAYS);
    const found = bounds(readDays(this.context, actor, { fromDay: from, toDay: to }));
    return found === null
      ? null
      : {
          id: `this_week:${String(ago)}`,
          kind: 'this_week',
          from,
          to,
          count: found.count,
          coverItemId: found.cover,
        };
  }

  private dayOuts(
    days: readonly DayStat[],
    places: readonly DayPlaces[],
    tripped: ReadonlySet<string>,
  ): Memory[] {
    if (days.length === 0) {
      return [];
    }
    const mean = days.reduce((sum, day) => sum + day.count, 0) / days.length;
    return days
      .filter((day) => day.located > 0 && day.count >= mean && !tripped.has(day.day))
      .map((day) => {
        const placeId = dominantPlace(places, day.day, day.day);
        return {
          id: `day_out:${day.day}`,
          kind: 'day_out' as const,
          from: day.day,
          to: day.day,
          count: day.count,
          coverItemId: day.coverItemId,
          placeId: placeId === null ? null : placeIdOf(placeId),
          placeName: placeId === null ? null : (this.places.find(placeId)?.name ?? null),
        };
      })
      .reverse();
  }

  private bursts(actor: DriveActor, fromDay: string, toDay: string): Memory[] {
    const window = dayRange(fromDay, toDay);
    return this.context.sql
      .all(
        BURST_ROW,
        `select s.id as stack_id, count(*) as count, min(${LOCAL_DAY}) as day,
           coalesce(s.cover_item_id, min(i.id)) as cover_item_id
         from drive_stacks s
           join drive_media m on m.stack_id = s.id
           join drive_items i on i.id = m.item_id
           join drive_roots r on r.id = i.root_id
         where s.kind = 'burst' and i.taken_at is not null and ${PHOTO_VISIBLE}${window.text}
         group by s.id having count(*) >= 2
         order by day desc, s.id`,
        { ...visibility(actor), ...window.parameters },
      )
      .map((row) => ({
        id: `burst:${row.stack_id}`,
        kind: 'burst' as const,
        from: row.day,
        to: row.day,
        count: row.count,
        coverItemId: row.cover_item_id,
        stackId: row.stack_id,
      }));
  }

  private recent(actor: DriveActor, today: string, home: GeoPoint | null): Memory[] {
    const range = { fromDay: shiftDay(today, 1 - MEMORY_WINDOW_DAYS), toDay: today };
    const days = readDays(this.context, actor, range);
    const places = readDayPlaces(this.context, actor, range);
    const trips = this.trips.list(actor, home, range);
    const tripped = new Set(
      days
        .filter((day) => trips.some((trip) => day.day >= trip.from && day.day <= trip.to))
        .map((day) => day.day),
    );
    return [
      ...this.dayOuts(days, places, tripped),
      ...this.bursts(actor, range.fromDay, range.toDay),
      ...trips,
    ];
  }

  private topPlaces(actor: DriveActor, year: number): YearInReview['topPlaces'] {
    const window = dayRange(`${String(year)}-01-01`, `${String(year)}-12-31`);
    return this.context.sql
      .all(
        COUNT_ROW,
        `select m.place_id as place_id, count(*) as count from ${PHOTO_FROM}
         where ${PHOTO_SHOWN} and m.place_id is not null${window.text}
         group by m.place_id order by count desc, m.place_id`,
        { ...visibility(actor), ...window.parameters },
      )
      .map((row) => ({
        placeId: placeIdOf(row.place_id),
        name: this.places.byId(row.place_id).name,
        count: row.count,
      }));
  }

  private topCameras(actor: DriveActor, year: number): YearInReview['topCameras'] {
    const window = dayRange(`${String(year)}-01-01`, `${String(year)}-12-31`);
    const totals = new Map<string, number>();
    const rows = this.context.sql.all(
      CAMERA_ROW,
      `select i.camera_make as make, i.camera_model as model, count(*) as count from ${PHOTO_FROM}
       where ${PHOTO_SHOWN}${window.text}
       group by i.camera_make, i.camera_model`,
      { ...visibility(actor), ...window.parameters },
    );
    for (const row of rows) {
      const name = cameraName(row.make, row.model);
      if (name !== null) {
        totals.set(name, (totals.get(name) ?? 0) + row.count);
      }
    }
    return [...totals.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  private years(actor: DriveActor, today: string, firstYear: number): Memory[] {
    const memories: Memory[] = [];
    for (let year = Number(today.slice(0, 4)) - 1; year >= firstYear; year -= 1) {
      const range = { fromDay: `${String(year)}-01-01`, toDay: `${String(year)}-12-31` };
      const days = readDays(this.context, actor, range);
      const found = bounds(days);
      if (found !== null) {
        memories.push({
          id: `year:${String(year)}`,
          kind: 'year',
          from: range.fromDay,
          to: range.toDay,
          count: found.count,
          coverItemId: found.cover,
          review: {
            year,
            perMonth: perMonth(year, days),
            topPlaces: this.topPlaces(actor, year),
            topCameras: this.topCameras(actor, year),
            mostFavouritedMonth: mostFavouritedMonth(year, days),
            longestDayOut: longestDayOut(days),
          },
        });
      }
    }
    return memories;
  }

  list(actor: DriveActor, { today, home }: MemoryContext): Memory[] {
    const firstYear = this.firstYear();
    if (firstYear === null) {
      return [];
    }
    return [
      ...this.anniversaries(actor, today, firstYear),
      ...this.recent(actor, today, home),
      ...this.years(actor, today, firstYear),
    ];
  }

  private specOf(
    actor: DriveActor,
    memoryId: string,
    today: string,
    home: GeoPoint | null,
  ): MemorySpec {
    const separator = memoryId.indexOf(':');
    const kind = memoryId.slice(0, separator);
    const key = memoryId.slice(separator + 1);
    switch (kind) {
      case 'on_this_day':
      case 'this_week':
        return this.anniversarySpec(kind, key, today);
      case 'day_out':
        return daysSpec(DAY_KEY.safeParse(key), key, key);
      case 'burst':
        return STACK_KEY.safeParse(key).success ? { kind: 'stack', stackId: key } : fail();
      case 'year':
        return daysSpec(YEAR_KEY.safeParse(key), `${key}-01-01`, `${key}-12-31`);
      case 'trip':
        return this.tripSpec(actor, memoryId, home);
      default:
        throw invalidMemory();
    }
  }

  private tripSpec(actor: DriveActor, memoryId: string, home: GeoPoint | null): MemorySpec {
    const trip = this.trips
      .list(actor, home, { fromDay: null, toDay: null })
      .find((entry) => entry.id === memoryId);
    return trip === undefined ? fail() : { kind: 'days', fromDay: trip.from, toDay: trip.to };
  }

  private anniversarySpec(kind: string, key: string, today: string): MemorySpec {
    const day = /^[1-9]\d*$/.test(key) ? sameDayYearsAgo(today, Number(key)) : null;
    if (day === null) {
      throw invalidMemory();
    }
    return kind === 'on_this_day'
      ? { kind: 'days', fromDay: day, toDay: day }
      : {
          kind: 'days',
          fromDay: shiftDay(day, -WEEK_RADIUS_DAYS),
          toDay: shiftDay(day, WEEK_RADIUS_DAYS),
        };
  }

  memoryItems(
    actor: DriveActor,
    memoryId: string,
    { today, home }: MemoryContext,
    cursor: string | undefined,
  ): DriveQueryPage {
    const spec = this.specOf(actor, memoryId, today, home);
    const after = afterCursor(cursor, '>');
    const rows = this.context.sql.all(ITEM_ROW, ...this.itemsStatement(actor, spec, after));
    const shown = rows.slice(0, DRIVE_PAGE_SIZE);
    const last = shown.at(-1);
    return {
      items: shown.map((row) => this.items.byId(row.id)),
      next:
        rows.length > DRIVE_PAGE_SIZE && last !== undefined
          ? encodeCursor(last.taken_at, last.id)
          : null,
    };
  }

  private itemsStatement(
    actor: DriveActor,
    spec: MemorySpec,
    after: Statement,
  ): readonly [string, SqlParameters] {
    const tail = `${after.text} order by i.taken_at, i.id limit $limit`;
    const limit = DRIVE_PAGE_SIZE + 1;
    if (spec.kind === 'stack') {
      return [
        `select i.id, i.taken_at from drive_media m
           join drive_items i on i.id = m.item_id join drive_roots r on r.id = i.root_id
         where m.stack_id = $stackId and i.taken_at is not null and ${PHOTO_VISIBLE}${tail}`,
        { ...visibility(actor), ...after.parameters, stackId: spec.stackId, limit },
      ];
    }
    const window = dayRange(spec.fromDay, spec.toDay);
    return [
      `select i.id, i.taken_at from ${PHOTO_FROM} where ${PHOTO_SHOWN}${window.text}${tail}`,
      { ...visibility(actor), ...window.parameters, ...after.parameters, limit },
    ];
  }
}
