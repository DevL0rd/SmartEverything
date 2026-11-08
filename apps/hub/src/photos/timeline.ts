import {
  ApiError,
  PHOTO_FLAGS,
  type PhotoFlag,
  type PhotoTimelineFilter,
  type TimelineBucket,
  type TimelinePage,
  type TimelineScope,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { DriveActor } from '../drive/service-read';
import type { StoreContext } from '../store/context';
import type { SqlParameters } from '../store/sql';

import { PHOTO_VISIBLE } from './membership';

export const TIMELINE_PAGE_SIZE = 2000;

export const OFFSET_PADDING_MS = 86_400_000;

export interface Statement {
  readonly text: string;
  readonly parameters: SqlParameters;
}

export interface ScopeQuery {
  readonly filter: PhotoTimelineFilter;
  readonly placeId?: number | undefined;
}

export interface PageQuery extends ScopeQuery {
  readonly cursor?: string | undefined;
}

export const PHOTO_FROM = `drive_items i
  join drive_roots r on r.id = i.root_id
  left join drive_media m on m.item_id = i.id
  left join drive_stacks s on s.id = m.stack_id`;

export const PHOTO_SHOWN = `i.kind in ('image', 'video', 'audio') and i.kind <> 'audio'
  and i.taken_at is not null and ${PHOTO_VISIBLE}
  and not exists (select 1 from drive_media c where c.motion_clip_id = i.id)
  and (m.stack_id is null or s.cover_item_id = i.id
    or (s.cover_item_id is null
      and i.id = (select min(x.item_id) from drive_media x where x.stack_id = m.stack_id)))`;

const OFFSET_MODIFIER = `coalesce(m.tz_offset_min, 0) || ' minutes'`;

export const LOCAL_DAY = `date(i.taken_at, ${OFFSET_MODIFIER})`;

export const LOCAL_MONTH = `strftime('%Y-%m', i.taken_at, ${OFFSET_MODIFIER})`;

export const LOCAL_SECONDS = `unixepoch(i.taken_at, ${OFFSET_MODIFIER})`;

const SCREENSHOT = `i.kind = 'image' and (lower(i.name) like 'screenshot%' or lower(i.rel_path) like '%screenshots/%')`;

export const FILTER_SQL: Readonly<Record<PhotoTimelineFilter, string>> = {
  all: '',
  favourites: ' and i.starred = 1',
  videos: " and i.kind = 'video'",
  screenshots: ` and ${SCREENSHOT}`,
};

const MEDIA_STATE = `coalesce(case when i.kind = 'video' then m.poster_state else m.preview_state end, 'none')`;

const FLAG_SQL: readonly (readonly [PhotoFlag, string])[] = [
  ['favourite', 'i.starred = 1'],
  ['video', "i.kind = 'video'"],
  ['live', '(m.live_id is not null or m.motion_clip_id is not null)'],
  ['stack', 'm.stack_id is not null'],
  ['processing', `${MEDIA_STATE} = 'none'`],
  ['unreadable', `${MEDIA_STATE} in ('failed', 'unsupported')`],
];

export const FLAGS_SQL = FLAG_SQL.map(
  ([flag, condition]) => `(case when ${condition} then ${String(PHOTO_FLAGS[flag])} else 0 end)`,
).join(' + ');

const NUMBER = z.number().nullable();

const BUCKET_ROW = z.strictObject({ month: z.string(), count: z.int().positive() });

const PAGE_ROW = z.strictObject({
  id: z.string(),
  rev: z.number(),
  width: NUMBER,
  height: NUMBER,
  orientation: NUMBER,
  taken_at: z.string(),
  tz_offset_min: NUMBER,
  duration_ms: NUMBER,
  thumbhash: z.instanceof(Uint8Array).nullable(),
  flags: z.number(),
});

type PageRow = z.output<typeof PAGE_ROW>;

const CURSOR_SEPARATOR = '\n';

const CURSOR_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export function visibility(actor: DriveActor): SqlParameters {
  return { owner: actor.owner ? 1 : 0, profile: actor.profileId };
}

function scopeSql(scope: ScopeQuery): Statement {
  const place = scope.placeId === undefined ? '' : ' and m.place_id = $placeId';
  return {
    text: `${FILTER_SQL[scope.filter]}${place}`,
    parameters: scope.placeId === undefined ? {} : { placeId: String(scope.placeId) },
  };
}

export function bucketsStatement(actor: DriveActor, scope: ScopeQuery): Statement {
  const filter = scopeSql(scope);
  return {
    text: `select ${LOCAL_MONTH} as month, count(*) as count
      from ${PHOTO_FROM}
      where ${PHOTO_SHOWN}${filter.text}
      group by month order by month desc`,
    parameters: { ...visibility(actor), ...filter.parameters },
  };
}

export function monthWindow(month: string): { readonly from: string; readonly to: string } {
  const [year, number] = month.split('-').map(Number);
  if (year === undefined || number === undefined) {
    throw new ApiError('invalid_request', 'The month is not a year and month.');
  }
  return {
    from: new Date(Date.UTC(year, number - 1, 1) - OFFSET_PADDING_MS).toISOString(),
    to: new Date(Date.UTC(year, number, 1) + OFFSET_PADDING_MS).toISOString(),
  };
}

export function dayRange(fromDay: string | null, toDay: string | null): Statement {
  const clauses: string[] = [];
  const parameters: Record<string, string> = {};
  if (fromDay !== null) {
    clauses.push(`i.taken_at >= $windowFrom and ${LOCAL_DAY} >= $fromDay`);
    parameters['windowFrom'] = new Date(Date.parse(fromDay) - OFFSET_PADDING_MS).toISOString();
    parameters['fromDay'] = fromDay;
  }
  if (toDay !== null) {
    clauses.push(`i.taken_at < $windowTo and ${LOCAL_DAY} <= $toDay`);
    parameters['windowTo'] = new Date(Date.parse(toDay) + 2 * OFFSET_PADDING_MS).toISOString();
    parameters['toDay'] = toDay;
  }
  return { text: clauses.map((clause) => ` and ${clause}`).join(''), parameters };
}

export function encodeCursor(takenAt: string, id: string): string {
  return Buffer.from(`${takenAt}${CURSOR_SEPARATOR}${id}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): { readonly takenAt: string; readonly id: string } {
  const [takenAt, id, extra] = Buffer.from(cursor, 'base64url')
    .toString('utf8')
    .split(CURSOR_SEPARATOR);
  if (takenAt === undefined || id === undefined || extra !== undefined || id === '') {
    throw new ApiError('invalid_request', 'The cursor is not one this list gave out.');
  }
  if (!CURSOR_TIME.test(takenAt)) {
    throw new ApiError('invalid_request', 'The cursor is not one this list gave out.');
  }
  return { takenAt, id };
}

export function afterCursor(cursor: string | undefined, direction: '<' | '>'): Statement {
  if (cursor === undefined) {
    return { text: '', parameters: {} };
  }
  const { takenAt, id } = decodeCursor(cursor);
  return {
    text: ` and (i.taken_at ${direction} $afterAt or (i.taken_at = $afterAt and i.id ${direction} $afterId))`,
    parameters: { afterAt: takenAt, afterId: id },
  };
}

export function pageStatement(actor: DriveActor, month: string, query: PageQuery): Statement {
  const filter = scopeSql(query);
  const window = monthWindow(month);
  const after = afterCursor(query.cursor, '<');
  return {
    text: `select i.id, i.rev, i.width, i.height, i.orientation, i.taken_at, m.tz_offset_min,
        i.duration_ms, m.thumbhash, ${FLAGS_SQL} as flags
      from ${PHOTO_FROM}
      where ${PHOTO_SHOWN}${filter.text}
        and i.taken_at >= $windowFrom and i.taken_at < $windowTo
        and ${LOCAL_MONTH} = $month${after.text}
      order by i.taken_at desc, i.id desc
      limit $limit`,
    parameters: {
      ...visibility(actor),
      ...filter.parameters,
      ...after.parameters,
      windowFrom: window.from,
      windowTo: window.to,
      month,
      limit: TIMELINE_PAGE_SIZE + 1,
    },
  };
}

const SIDEWAYS = new Set([5, 6, 7, 8]);

export function aspectOf(row: Pick<PageRow, 'width' | 'height' | 'orientation'>): number {
  if (row.width === null || row.height === null) {
    return 1;
  }
  const sideways = row.orientation !== null && SIDEWAYS.has(row.orientation);
  return sideways ? row.height / row.width : row.width / row.height;
}

export function pageOf(month: string, rows: readonly PageRow[]): TimelinePage {
  const shown = rows.slice(0, TIMELINE_PAGE_SIZE);
  const last = shown.at(-1);
  return {
    month,
    ids: shown.map((row) => row.id),
    revs: shown.map((row) => row.rev),
    aspect: shown.map(aspectOf),
    takenAt: shown.map((row) => Date.parse(row.taken_at)),
    offsetMin: shown.map((row) => row.tz_offset_min),
    durationMs: shown.map((row) => row.duration_ms),
    thumbhash: shown.map((row) =>
      row.thumbhash === null ? null : Buffer.from(row.thumbhash).toString('base64'),
    ),
    flags: shown.map((row) => row.flags),
    next:
      rows.length > TIMELINE_PAGE_SIZE && last !== undefined
        ? encodeCursor(last.taken_at, last.id)
        : null,
  };
}

export class TimelineReader {
  constructor(private readonly context: StoreContext) {}

  buckets(actor: DriveActor, scope: TimelineScope): TimelineBucket[] {
    const statement = bucketsStatement(actor, scope);
    return this.context.sql
      .all(BUCKET_ROW, statement.text, statement.parameters)
      .map((row) => ({ month: row.month, count: row.count }));
  }

  page(actor: DriveActor, month: string, query: PageQuery): TimelinePage {
    const statement = pageStatement(actor, month, query);
    return pageOf(month, this.context.sql.all(PAGE_ROW, statement.text, statement.parameters));
  }
}
