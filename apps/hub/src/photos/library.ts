import {
  ApiError,
  PHOTO_FLAGS,
  type LibraryBucket,
  type LibraryPage,
  type LibraryScope,
  type PhotoFlag,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { DriveActor } from '../drive/access';
import type { StoreContext } from '../store/context';
import { starredBy } from '../store/repositories/drive-stars';
import type { SqlParameters } from '../store/sql';
import {
  AlbumScopes,
  LOCAL_MONTH,
  OFFSET_PADDING_MS,
  narrowing,
  type Statement,
} from './library-scope';
import { LIBRARY_VISIBLE, PHOTO_VISIBLE, photoVisible } from './membership';
import { isSearching } from './people/scope';

export {
  FILTER_SQL,
  LOCAL_DAY,
  LOCAL_MONTH,
  LOCAL_SECONDS,
  OFFSET_PADDING_MS,
  dayRange,
  type Statement,
} from './library-scope';

export const LIBRARY_PAGE_SIZE = 2000;

export interface PageQuery extends LibraryScope {
  readonly cursor?: string | undefined;
  readonly meaningIds?: readonly string[] | undefined;
}

export const PHOTO_FROM = `drive_items i
  join drive_roots r on r.id = i.root_id
  left join drive_media m on m.item_id = i.id
  left join drive_stacks s on s.id = m.stack_id`;

function shownFor(visible: string): string {
  return `i.kind in ('image', 'video', 'audio') and i.kind <> 'audio'
  and i.taken_at is not null and ${visible}
  and not exists (select 1 from drive_media c where c.motion_clip_id = i.id)
  and (m.stack_id is null or s.cover_item_id = i.id
    or (s.cover_item_id is null
      and i.id = (select min(x.item_id) from drive_media x where x.stack_id = m.stack_id)))`;
}

export const PHOTO_SHOWN = shownFor(LIBRARY_VISIBLE);

export const PHOTO_SEARCHED = shownFor(PHOTO_VISIBLE);

export function shownBy(scope: LibraryScope): string {
  return isSearching(scope) ? PHOTO_SEARCHED : PHOTO_SHOWN;
}

const MEDIA_STATE = `coalesce(case when i.kind = 'video' then m.poster_state else m.preview_state end, 'none')`;

const FLAG_SQL: readonly (readonly [PhotoFlag, string])[] = [
  ['favourite', starredBy()],
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
  return photoVisible(actor).parameters;
}

export function bucketsStatement(
  actor: DriveActor,
  scope: LibraryScope,
  albums: AlbumScopes,
  meaning: readonly string[] = [],
): Statement {
  const filter = narrowing(actor, scope, albums, meaning);
  return {
    text: `select ${LOCAL_MONTH} as month, count(*) as count
      from ${PHOTO_FROM}
      where ${shownBy(scope)}${filter.text}
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

export function pageStatement(
  actor: DriveActor,
  month: string,
  query: PageQuery,
  albums: AlbumScopes,
): Statement {
  const filter = narrowing(actor, query, albums, query.meaningIds);
  const window = monthWindow(month);
  const after = afterCursor(query.cursor, '<');
  return {
    text: `select i.id, i.rev, i.width, i.height, i.orientation, i.taken_at, m.tz_offset_min,
        i.duration_ms, m.thumbhash, ${FLAGS_SQL} as flags
      from ${PHOTO_FROM}
      where ${shownBy(query)}${filter.text}
        and i.taken_at >= $monthFrom and i.taken_at < $monthTo
        and ${LOCAL_MONTH} = $month${after.text}
      order by i.taken_at desc, i.id desc
      limit $limit`,
    parameters: {
      ...visibility(actor),
      ...filter.parameters,
      ...after.parameters,
      monthFrom: window.from,
      monthTo: window.to,
      month,
      limit: LIBRARY_PAGE_SIZE + 1,
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

export function pageOf(month: string, rows: readonly PageRow[]): LibraryPage {
  const shown = rows.slice(0, LIBRARY_PAGE_SIZE);
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
      rows.length > LIBRARY_PAGE_SIZE && last !== undefined
        ? encodeCursor(last.taken_at, last.id)
        : null,
  };
}

export class LibraryReader {
  private readonly albums: AlbumScopes;

  constructor(
    private readonly context: StoreContext,
    timeZone: () => string,
  ) {
    this.albums = new AlbumScopes(context, timeZone);
  }

  buckets(
    actor: DriveActor,
    scope: LibraryScope,
    meaning: readonly string[] = [],
  ): LibraryBucket[] {
    const statement = bucketsStatement(actor, scope, this.albums, meaning);
    return this.context.sql
      .all(BUCKET_ROW, statement.text, statement.parameters)
      .map((row) => ({ month: row.month, count: row.count }));
  }

  page(
    actor: DriveActor,
    month: string,
    query: PageQuery,
    meaning: readonly string[] = [],
  ): LibraryPage {
    const statement = pageStatement(actor, month, { ...query, meaningIds: meaning }, this.albums);
    return pageOf(month, this.context.sql.all(PAGE_ROW, statement.text, statement.parameters));
  }
}
