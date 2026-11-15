import {
  DRIVE_SNIPPET_CLOSE,
  DRIVE_SNIPPET_OPEN,
  type DriveDurationBucket,
  type DriveHit,
  type DriveItem,
  type DriveQuery,
  type DriveQueryPage,
  type DriveSort,
} from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import { found, type StoreContext } from '../store/context';
import { DriveItemsRepository } from '../store/repositories/drive-items';
import { openedAtBy } from '../store/repositories/drive-opens';
import { starredBy } from '../store/repositories/drive-stars';
import { allOf, inList, type SqlFilter } from '../store/sql';
import { accessFilter, type DriveActor } from './access';

export class DriveCursorError extends Error {
  override readonly name = 'DriveCursorError';

  constructor(
    readonly cursor: string,
    override readonly cause?: unknown,
  ) {
    super('The cursor is not one this list issued; start the list again.', { cause });
  }
}

export class DriveFolderRequiredError extends Error {
  override readonly name = 'DriveFolderRequiredError';

  constructor(readonly itemId: string) {
    super(`The item ${itemId} is not a folder, so a search cannot be limited to it.`);
  }
}

export function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeCursor<T>(schema: z.ZodType<T>, cursor: string): T {
  try {
    return schema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
  } catch (cause) {
    throw new DriveCursorError(cursor, cause);
  }
}

const WORD = /[\p{L}\p{N}\p{M}]+/gu;

export function driveMatchOf(text: string): string | null {
  const words = text.match(WORD) ?? [];
  return words.length === 0 ? null : words.map((word) => `"${word}"*`).join(' ');
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export interface DriveSearchDocument {
  readonly itemId: string;
  readonly name: string;
  readonly path: string;
  readonly camera: string;
  readonly albums: string;
  readonly dates: string;
  readonly labels: string;
}

function dateWords(moment: string): string {
  const [year = '', month = ''] = moment.split('-');
  const named = MONTHS[Number(month) - 1];
  return named === undefined ? year : `${year} ${named}`;
}

function cameraWords(item: DriveItem): string {
  if (item.kind !== 'image' && item.kind !== 'video') {
    return '';
  }
  const camera = item.camera;
  return camera === null
    ? ''
    : [camera.make, camera.model, camera.lens].filter((part) => part !== null).join(' ');
}

function directoryOf(relPath: string): string {
  const slash = relPath.lastIndexOf('/');
  return slash < 0 ? '' : relPath.slice(0, slash);
}

export function driveSearchDocument(
  item: DriveItem,
  albumTitles: readonly string[],
  labels: readonly string[] = [],
): DriveSearchDocument {
  const taken = 'takenAt' in item && item.takenAt !== null ? item.takenAt : item.modifiedAt;
  return {
    itemId: item.id,
    name: item.name,
    path: directoryOf(item.relPath),
    camera: cameraWords(item),
    albums: albumTitles.join(' '),
    dates: dateWords(taken),
    labels: labels.join(' '),
  };
}

type SortField = DriveSort['field'];

const SORT_EXPRESSIONS: Readonly<Record<SortField, { text: string; numeric: boolean }>> = {
  name: { text: 'i.name', numeric: false },
  modifiedAt: { text: 'i.modified_at', numeric: false },
  takenAt: { text: "coalesce(i.taken_at, '')", numeric: false },
  addedAt: { text: 'i.added_at', numeric: false },
  openedAt: { text: `coalesce(${openedAtBy('$profile')}, '')`, numeric: false },
  bytes: { text: 'i.bytes', numeric: true },
};

const MINUTE_MS = 60_000;

const DURATION_BOUNDS: Readonly<Record<DriveDurationBucket, readonly [number, number | null]>> = {
  under_1m: [0, MINUTE_MS],
  '1_to_10m': [MINUTE_MS, 10 * MINUTE_MS],
  '10_to_60m': [10 * MINUTE_MS, 60 * MINUTE_MS],
  over_60m: [60 * MINUTE_MS, null],
};

const CURSOR = z.strictObject({ v: z.union([z.string(), z.number()]), id: z.string() });

const HIT_RANKS = ['name', 'text', 'image_text'] as const;

const SORTED_ROW = z.object({
  id: z.string(),
  sort_value: z.union([z.string(), z.number()]),
  hit_rank: z.number().nullable(),
  hit_snippet: z.string().nullable(),
});

const SNIPPET_TOKENS = 16;

const SNIPPET_ELLIPSIS = '…';

function nameHits(): string {
  return `select item_id, 0 as hit_rank, null as hit_snippet
    from drive_items_search where drive_items_search match $match`;
}

function textHits(): string {
  return `select t.item_id as item_id,
      case d.source when 'image' then 2 else 1 end as hit_rank,
      snippet(drive_item_text_search, 1, char(${String(DRIVE_SNIPPET_OPEN.charCodeAt(0))}),
        char(${String(DRIVE_SNIPPET_CLOSE.charCodeAt(0))}), '${SNIPPET_ELLIPSIS}', ${String(SNIPPET_TOKENS)}) as hit_snippet
    from drive_item_text_search t
    join drive_item_text d on d.item_id = t.item_id
    where drive_item_text_search match $match`;
}

function hitsCte(mode: DriveQuery['match']): string {
  const arms = mode === 'names' ? [nameHits()] : [nameHits(), textHits()];
  return `with hits as (
    select item_id, min(hit_rank) as hit_rank, hit_snippet
    from (${arms.join(' union all ')}) group by item_id
  )`;
}

export interface DriveSearchStatement {
  readonly text: string;
  readonly parameters: Record<string, SQLInputValue>;
}

function nextDay(day: string): string {
  const next = new Date(`${day}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

export function durationFilter(bucket: DriveDurationBucket): SqlFilter {
  const [from, to] = DURATION_BOUNDS[bucket];
  return to === null
    ? { text: 'i.duration_ms >= $durationFrom', parameters: { durationFrom: from } }
    : {
        text: 'i.duration_ms >= $durationFrom and i.duration_ms < $durationTo',
        parameters: { durationFrom: from, durationTo: to },
      };
}

function takenFilters(taken: NonNullable<DriveQuery['taken']>): SqlFilter[] {
  return [
    ...(taken.from === null
      ? []
      : [{ text: 'i.taken_at >= $takenFrom', parameters: { takenFrom: taken.from } }]),
    ...(taken.to === null
      ? []
      : [{ text: 'i.taken_at < $takenBefore', parameters: { takenBefore: nextDay(taken.to) } }]),
  ];
}

function folderFilter(folder: DriveItem): SqlFilter {
  return {
    text: 'i.root_id = $folderRoot and i.rel_path >= $folderFrom and i.rel_path < $folderBefore',
    parameters: {
      folderRoot: folder.rootId,
      folderFrom: `${folder.relPath}/`,
      folderBefore: `${folder.relPath}0`,
    },
  };
}

function cursorFilter(query: DriveQuery): SqlFilter[] {
  if (query.cursor === null) {
    return [];
  }
  const field = SORT_EXPRESSIONS[query.sort.field];
  const cursor = decodeCursor(CURSOR, query.cursor);
  if (typeof cursor.v !== (field.numeric ? 'number' : 'string')) {
    throw new DriveCursorError(query.cursor);
  }
  const comparison = query.sort.direction === 'asc' ? '>' : '<';
  return [
    {
      text: `(${field.text}, i.id) ${comparison} ($cursorValue, $cursorId)`,
      parameters: { cursorValue: cursor.v, cursorId: cursor.id },
    },
  ];
}

function plainFilters(query: DriveQuery): SqlFilter[] {
  return [
    ...(query.rootId === null
      ? []
      : [{ text: 'i.root_id = $rootId', parameters: { rootId: query.rootId } }]),
    ...(query.kinds === null ? [] : [inList('i.kind', 'kinds', query.kinds)]),
    ...(query.starred === null
      ? []
      : [{ text: `${query.starred ? '' : 'not '}${starredBy()}`, parameters: {} }]),
    ...(query.duration === null ? [] : [durationFilter(query.duration)]),
    ...(query.taken === null ? [] : takenFilters(query.taken)),
  ];
}

export function driveSearchStatement(
  actor: DriveActor,
  query: DriveQuery,
  folder: DriveItem | null,
  limit: number,
): DriveSearchStatement | null {
  const match = query.text === null ? null : driveMatchOf(query.text);
  if (query.text !== null && match === null) {
    return null;
  }
  const filter = allOf([
    accessFilter(actor),
    ...plainFilters(query),
    ...(folder === null ? [] : [folderFilter(folder)]),
    ...cursorFilter(query),
  ]);
  const sort = SORT_EXPRESSIONS[query.sort.field];
  const direction = query.sort.direction;
  return {
    text: `${match === null ? '' : hitsCte(query.match)}
      select i.id as id, ${sort.text} as sort_value,
        ${match === null ? 'null' : 'h.hit_rank'} as hit_rank,
        ${match === null ? 'null' : 'h.hit_snippet'} as hit_snippet
      from drive_items i
      join drive_roots r on r.id = i.root_id
      ${match === null ? '' : 'join hits h on h.item_id = i.id'}
      where ${filter.text}
      order by ${sort.text} ${direction}, i.id ${direction}
      limit $limit`,
    parameters: { ...filter.parameters, ...(match === null ? {} : { match }), limit: limit + 1 },
  };
}

function hitOf(row: z.infer<typeof SORTED_ROW>): DriveHit {
  const place = HIT_RANKS[row.hit_rank ?? 0] ?? 'name';
  return place === 'name' || row.hit_snippet === null
    ? { itemId: row.id, where: 'name', snippet: null }
    : { itemId: row.id, where: place, snippet: row.hit_snippet };
}

export class DriveSearch {
  private readonly items: DriveItemsRepository;

  constructor(private readonly context: StoreContext) {
    this.items = new DriveItemsRepository(context);
  }

  search(actor: DriveActor, query: DriveQuery, limit: number): DriveQueryPage {
    const statement = driveSearchStatement(actor, query, this.folderOf(actor, query), limit);
    if (statement === null) {
      return { items: [], hits: [], next: null };
    }
    const rows = this.context.sql.all(SORTED_ROW, statement.text, statement.parameters);
    const shown = rows.slice(0, limit);
    const last = shown.at(-1);
    return {
      items: shown.map((row) => this.items.byId(row.id, actor.profileId)),
      hits: shown.map(hitOf),
      next:
        rows.length > limit && last !== undefined
          ? encodeCursor({ v: last.sort_value, id: last.id })
          : null,
    };
  }

  private folderOf(actor: DriveActor, query: DriveQuery): DriveItem | null {
    if (query.folderId === null) {
      return null;
    }
    const folder = found(
      this.items.find(query.folderId, actor.profileId),
      'drive folder',
      query.folderId,
    );
    if (folder.kind !== 'folder') {
      throw new DriveFolderRequiredError(folder.id);
    }
    return folder;
  }
}
