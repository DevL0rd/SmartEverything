import {
  ApiError,
  PHOTO_INSIGHTS,
  type PhotoInsightRange,
  type PhotoInsights,
} from '@smarteverything/domain';
import type { z } from 'zod';
import type { DriveActor } from '../drive/access';
import { DRIVE_PAGE_SIZE } from '../drive/page-size';
import { homeLocation, homeZone } from '../automations/world-v3/zone';
import type { StoreContext } from '../store/context';
import { storeUnit } from '../store/host/unit';
import type { HostStore } from '../store/host/host-store';
import {
  CAMERA_ROW,
  CLOCK_ROW,
  COUNTRY_ROW,
  COVERAGE_ROW,
  DAY_ROW,
  DURATION_ROW,
  HOURS_ROW,
  LARGEST_ROW,
  LENS_ROW,
  MONTH_KIND_ROW,
  RANKING_LENGTH,
  ROOT_ROW,
  busiestOf,
  durationBucketsOf,
  growthOf,
  historyMonths,
  placesOf,
  rangeFrom,
  seasonByHour,
  totalsOf,
  twelveMonthsFrom,
  videoTotalsOf,
  weekdayByHour,
  localDay,
  type InsightsContext,
} from './insights-shapes';
import {
  FILTER_SQL,
  LOCAL_DAY,
  LOCAL_MONTH,
  LOCAL_SECONDS,
  PHOTO_FROM,
  PHOTO_SHOWN,
  dayRange,
  visibility,
  type Statement,
} from './library';

export const RAW_EXTENSIONS = [
  'dng',
  'cr2',
  'cr3',
  'nef',
  'nrw',
  'arw',
  'orf',
  'rw2',
  'raf',
  'srw',
  'pef',
] as const;

const HOUR_MS = 3_600_000;

const SCREENSHOT_SQL = FILTER_SQL.screenshots.replace(/^ and /, '');

const RAW_SQL = RAW_EXTENSIONS.map((extension) => `lower(i.name) like '%.${extension}'`).join(
  ' or ',
);

const KIND_SQL = `case when i.kind = 'video' then 'video' when ${RAW_SQL} then 'raw'
  when ${SCREENSHOT_SQL} then 'screenshot' else 'photo' end`;

const LARGEST_CURSOR = /^(\d+):([0-9a-f-]{36})$/;

const BUSIEST_CURSOR = /^(\d+):(\d{4}-\d{2}-\d{2})$/;

export interface RankingPage<T> {
  readonly items: readonly T[];
  readonly next: string | null;
}

function invalidCursor(): ApiError {
  return new ApiError('invalid_request', 'The cursor is not one this list gave out.');
}

function cursorOf(cursor: string | undefined, pattern: RegExp): readonly [number, string] | null {
  if (cursor === undefined) return null;
  const match = pattern.exec(cursor);
  if (match === null) throw invalidCursor();
  return [Number(match[1]), match[2] ?? ''];
}

interface Scope {
  readonly where: string;
  readonly parameters: Statement['parameters'];
}

function scopeOf(actor: DriveActor, range: PhotoInsightRange, today: string): Scope {
  const window = dayRange(rangeFrom(range, today), null);
  return {
    where: `${PHOTO_SHOWN}${window.text}`,
    parameters: { ...visibility(actor), ...window.parameters },
  };
}

export class InsightsReader {
  constructor(private readonly context: StoreContext) {}

  read(actor: DriveActor, range: PhotoInsightRange, at: InsightsContext): PhotoInsights {
    const scope = scopeOf(actor, range, at.today);
    const monthly = this.monthly(scope);
    const days = this.days(scope);
    const months = historyMonths(days);
    const kinds = totalsOf(monthly);
    const durations = this.durations(scope);
    const clock = this.clock(scope);
    const calendarFrom = twelveMonthsFrom(at.today);
    return PHOTO_INSIGHTS.parse({
      range,
      items: kinds.reduce((sum, one) => sum + one.items, 0),
      bytes: kinds.reduce((sum, one) => sum + one.bytes, 0),
      kinds,
      growth: months === null ? null : growthOf(monthly, months),
      cameras: this.cameras(scope),
      lenses: this.lenses(scope),
      roots: this.roots(scope),
      largestVideos: this.largestVideos(scope),
      videoTotals: videoTotalsOf(kinds, durations),
      durationBuckets: durationBucketsOf(durations),
      hoursAddedPerMonth: months === null ? null : this.hoursAdded(scope, months),
      busiestDays: busiestOf(days),
      perDay: days.filter((one) => one.day >= calendarFrom),
      weekdayByHour: weekdayByHour(clock),
      seasonByHour: seasonByHour(clock, at.home),
      places: placesOf(this.countries(scope)),
      backupCoverage: this.coverage(actor),
    });
  }

  largestVideosPage(
    actor: DriveActor,
    range: PhotoInsightRange,
    cursor: string | undefined,
    at: InsightsContext,
  ): RankingPage<PhotoInsights['largestVideos'][number]> {
    const scope = scopeOf(actor, range, at.today);
    const after = cursorOf(cursor, LARGEST_CURSOR);
    const rows = this.context.sql.all(
      LARGEST_ROW,
      `select i.id, i.bytes, i.duration_ms from ${PHOTO_FROM}
       where ${scope.where} and i.kind = 'video'
         and ($afterBytes is null or i.bytes < $afterBytes
           or (i.bytes = $afterBytes and i.id > $afterId))
       order by i.bytes desc, i.id limit $limit`,
      {
        ...scope.parameters,
        afterBytes: after?.[0] ?? null,
        afterId: after?.[1] ?? null,
        limit: DRIVE_PAGE_SIZE + 1,
      },
    );
    const shown = rows.slice(0, DRIVE_PAGE_SIZE);
    const last = shown.at(-1);
    return {
      items: shown.map((row) => ({
        itemId: row.id,
        bytes: row.bytes,
        durationMs: row.duration_ms,
      })),
      next:
        rows.length > DRIVE_PAGE_SIZE && last !== undefined
          ? `${String(last.bytes)}:${last.id}`
          : null,
    };
  }

  busiestDaysPage(
    actor: DriveActor,
    range: PhotoInsightRange,
    cursor: string | undefined,
    at: InsightsContext,
  ): RankingPage<PhotoInsights['busiestDays'][number]> {
    const scope = scopeOf(actor, range, at.today);
    const after = cursorOf(cursor, BUSIEST_CURSOR);
    const rows = this.context.sql.all(
      DAY_ROW,
      `select ${LOCAL_DAY} as day, count(*) as items
       from ${PHOTO_FROM} where ${scope.where} group by day
       having ($afterItems is null or count(*) < $afterItems
         or (count(*) = $afterItems and day > $afterDay))
       order by items desc, day limit $limit`,
      {
        ...scope.parameters,
        afterItems: after?.[0] ?? null,
        afterDay: after?.[1] ?? null,
        limit: DRIVE_PAGE_SIZE + 1,
      },
    );
    const shown = rows.slice(0, DRIVE_PAGE_SIZE);
    const last = shown.at(-1);
    return {
      items: shown,
      next:
        rows.length > DRIVE_PAGE_SIZE && last !== undefined
          ? `${String(last.items)}:${last.day}`
          : null,
    };
  }

  private monthly(scope: Scope): z.output<typeof MONTH_KIND_ROW>[] {
    return this.context.sql.all(
      MONTH_KIND_ROW,
      `select ${LOCAL_MONTH} as month, ${KIND_SQL} as kind, count(*) as items,
         coalesce(sum(i.bytes), 0) as bytes
       from ${PHOTO_FROM} where ${scope.where} group by 1, 2`,
      scope.parameters,
    );
  }

  private days(scope: Scope): z.output<typeof DAY_ROW>[] {
    return this.context.sql.all(
      DAY_ROW,
      `select ${LOCAL_DAY} as day, count(*) as items
       from ${PHOTO_FROM} where ${scope.where} group by day order by day`,
      scope.parameters,
    );
  }

  private clock(scope: Scope): z.output<typeof CLOCK_ROW>[] {
    const local = `datetime(${LOCAL_SECONDS}, 'unixepoch')`;
    return this.context.sql.all(
      CLOCK_ROW,
      `select strftime('%m', ${local}) as month, strftime('%w', ${local}) as weekday,
         strftime('%H', ${local}) as hour, count(*) as items
       from ${PHOTO_FROM} where ${scope.where} group by month, weekday, hour`,
      scope.parameters,
    );
  }

  private cameras(scope: Scope): PhotoInsights['cameras'] {
    return this.context.sql.all(
      CAMERA_ROW,
      `select i.camera_make as make, i.camera_model as model, count(*) as items
       from ${PHOTO_FROM}
       where ${scope.where} and (i.camera_make is not null or i.camera_model is not null)
       group by make, model order by items desc, make, model`,
      scope.parameters,
    );
  }

  private lenses(scope: Scope): PhotoInsights['lenses'] {
    return this.context.sql.all(
      LENS_ROW,
      `select i.camera_lens as name, count(*) as items from ${PHOTO_FROM}
       where ${scope.where} and i.camera_lens is not null
       group by 1 order by items desc, 1`,
      scope.parameters,
    );
  }

  private roots(scope: Scope): PhotoInsights['roots'] {
    return this.context.sql
      .all(
        ROOT_ROW,
        `select r.id as root_id,
           coalesce(sum(i.kind = 'image'), 0) as photos,
           coalesce(sum(i.kind = 'video'), 0) as videos,
           coalesce(sum(case when i.kind = 'image' then i.bytes else 0 end), 0) as photo_bytes,
           coalesce(sum(case when i.kind = 'video' then i.bytes else 0 end), 0) as video_bytes
         from ${PHOTO_FROM} where ${scope.where} group by r.id, r.scope order by r.scope, r.id`,
        scope.parameters,
      )
      .map((row) => ({
        rootId: row.root_id,
        photos: row.photos,
        videos: row.videos,
        photoBytes: row.photo_bytes,
        videoBytes: row.video_bytes,
      }));
  }

  private largestVideos(scope: Scope): PhotoInsights['largestVideos'] {
    return this.context.sql
      .all(
        LARGEST_ROW,
        `select i.id, i.bytes, i.duration_ms from ${PHOTO_FROM}
         where ${scope.where} and i.kind = 'video'
         order by i.bytes desc, i.id limit $ranking`,
        { ...scope.parameters, ranking: RANKING_LENGTH },
      )
      .map((row) => ({ itemId: row.id, bytes: row.bytes, durationMs: row.duration_ms }));
  }

  private durations(scope: Scope): z.output<typeof DURATION_ROW>[] {
    return this.context.sql.all(
      DURATION_ROW,
      `select i.duration_ms as duration_ms, count(*) as items, coalesce(sum(i.bytes), 0) as bytes
       from ${PHOTO_FROM}
       where ${scope.where} and i.kind = 'video' and i.duration_ms is not null
       group by i.duration_ms`,
      scope.parameters,
    );
  }

  private hoursAdded(
    scope: Scope,
    months: readonly string[],
  ): NonNullable<PhotoInsights['hoursAddedPerMonth']> {
    const rows = this.context.sql.all(
      HOURS_ROW,
      `select ${LOCAL_MONTH} as month, coalesce(sum(i.duration_ms), 0) as duration_ms
       from ${PHOTO_FROM} where ${scope.where} and i.kind = 'video' group by month`,
      scope.parameters,
    );
    return months.map((month) => ({
      month,
      hours: (rows.find((row) => row.month === month)?.duration_ms ?? 0) / HOUR_MS,
    }));
  }

  private countries(scope: Scope): z.output<typeof COUNTRY_ROW>[] {
    return this.context.sql
      .all(
        COUNTRY_ROW,
        `select p.country as code, count(*) as items, count(distinct p.id) as places
         from ${PHOTO_FROM} join drive_places p on p.id = m.place_id
         where ${scope.where} group by p.country`,
        scope.parameters,
      )
      .toSorted((a, b) => b.items - a.items || a.code.localeCompare(b.code));
  }

  private coverage(actor: DriveActor): PhotoInsights['backupCoverage'] {
    return this.context.sql
      .all(
        COVERAGE_ROW,
        `select d.id, d.name, count(a.local_id) as total,
           coalesce(sum(a.state = 'verified'), 0) as backed_up
         from drive_backup_devices d
           left join drive_backup_assets a on a.backup_device_id = d.id
         where d.profile_id = $profile group by d.id order by d.name, d.id`,
        { profile: actor.profileId },
      )
      .map((row) => ({
        deviceId: row.id,
        name: row.name,
        backedUp: row.backed_up,
        total: row.total,
      }));
  }
}

function insightsContext(store: HostStore): InsightsContext {
  return { today: localDay(store.now(), homeZone(store)), home: homeLocation(store) };
}

export interface InsightsQuery {
  readonly actor: DriveActor;
  readonly range: PhotoInsightRange;
}

export interface RankingQuery extends InsightsQuery {
  readonly cursor: string | undefined;
}

export const PHOTO_INSIGHTS_UNIT = storeUnit((store, input: InsightsQuery) =>
  new InsightsReader(store.context).read(input.actor, input.range, insightsContext(store)),
);

export const PHOTO_LARGEST_VIDEOS_UNIT = storeUnit((store, input: RankingQuery) =>
  new InsightsReader(store.context).largestVideosPage(
    input.actor,
    input.range,
    input.cursor,
    insightsContext(store),
  ),
);

export const PHOTO_BUSIEST_DAYS_UNIT = storeUnit((store, input: RankingQuery) =>
  new InsightsReader(store.context).busiestDaysPage(
    input.actor,
    input.range,
    input.cursor,
    insightsContext(store),
  ),
);
