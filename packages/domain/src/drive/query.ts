import { z } from 'zod';
import { DRIVE_ITEM, DRIVE_ITEM_KINDS } from './item';
import { DRIVE_SHORTCUT } from './shortcut';

const ID = z.uuid();
const DAY = z.iso.date();

const MINUTE_MS = 60_000;

export const DRIVE_DURATION_BUCKETS = ['under_1m', '1_to_10m', '10_to_60m', 'over_60m'] as const;

export type DriveDurationBucket = (typeof DRIVE_DURATION_BUCKETS)[number];

export function driveDurationBucket(durationMs: number): DriveDurationBucket {
  if (durationMs < MINUTE_MS) {
    return 'under_1m';
  }
  if (durationMs < 10 * MINUTE_MS) {
    return '1_to_10m';
  }
  if (durationMs < 60 * MINUTE_MS) {
    return '10_to_60m';
  }
  return 'over_60m';
}

export const DRIVE_SORT_FIELDS = [
  'name',
  'modifiedAt',
  'takenAt',
  'addedAt',
  'openedAt',
  'bytes',
] as const;

export const DRIVE_SORT = z
  .strictObject({
    field: z.enum(DRIVE_SORT_FIELDS),
    direction: z.enum(['asc', 'desc']),
  })
  .readonly();

export type DriveSort = z.infer<typeof DRIVE_SORT>;

export const DRIVE_DAY_RANGE = z
  .strictObject({ from: DAY.nullable(), to: DAY.nullable() })
  .refine((range) => range.from === null || range.to === null || range.from <= range.to, {
    message: 'from must not be after to',
    path: ['to'],
  })
  .readonly();

export type DriveDayRange = z.infer<typeof DRIVE_DAY_RANGE>;

export const DRIVE_MATCHES = ['all', 'names'] as const;

export type DriveMatch = (typeof DRIVE_MATCHES)[number];

export const DRIVE_SNIPPET_OPEN = '\u0002';

export const DRIVE_SNIPPET_CLOSE = '\u0003';

export const DRIVE_HIT_PLACES = ['name', 'text', 'image_text'] as const;

export type DriveHitPlace = (typeof DRIVE_HIT_PLACES)[number];

function markersBalance(snippet: string): boolean {
  let open = false;
  for (const character of snippet) {
    if (character === DRIVE_SNIPPET_OPEN) {
      if (open) return false;
      open = true;
    } else if (character === DRIVE_SNIPPET_CLOSE) {
      if (!open) return false;
      open = false;
    }
  }
  return !open;
}

export const DRIVE_HIT = z
  .strictObject({
    itemId: ID,
    where: z.enum(DRIVE_HIT_PLACES),
    snippet: z
      .string()
      .min(1)
      .refine(markersBalance, { message: 'every highlight opens and closes' })
      .nullable(),
  })
  .refine((hit) => (hit.where === 'name') === (hit.snippet === null), {
    message: 'a name hit has no snippet and a text hit has one',
    path: ['snippet'],
  })
  .readonly();

export type DriveHit = z.infer<typeof DRIVE_HIT>;

export const DRIVE_QUERY = z
  .strictObject({
    text: z.string().trim().min(1).nullable(),
    match: z.enum(DRIVE_MATCHES),
    rootId: ID.nullable(),
    folderId: ID.nullable(),
    kinds: z.array(z.enum(DRIVE_ITEM_KINDS)).min(1).readonly().nullable(),
    starred: z.boolean().nullable(),
    duration: z.enum(DRIVE_DURATION_BUCKETS).nullable(),
    taken: DRIVE_DAY_RANGE.nullable(),
    sort: DRIVE_SORT,
    cursor: z.string().min(1).nullable(),
  })
  .readonly();

export type DriveQuery = z.infer<typeof DRIVE_QUERY>;

const QUERY_PAGE_SHAPE = {
  items: z.array(DRIVE_ITEM).readonly(),
  hits: z.array(DRIVE_HIT).readonly(),
  next: z.string().min(1).nullable(),
};

function eachItemHasOneHit(
  page: { items: readonly { id: string }[]; hits: readonly { itemId: string }[] },
  context: z.core.$RefinementCtx,
): void {
  const ids = new Set(page.items.map((item) => item.id));
  const hitIds = new Set(page.hits.map((hit) => hit.itemId));
  if (
    page.hits.length !== page.items.length ||
    hitIds.size !== page.hits.length ||
    page.hits.some((hit) => !ids.has(hit.itemId))
  ) {
    context.addIssue({
      code: 'custom',
      message: 'each returned item has exactly one hit',
      path: ['hits'],
    });
  }
}

export const DRIVE_QUERY_PAGE = z
  .strictObject(QUERY_PAGE_SHAPE)
  .superRefine(eachItemHasOneHit)
  .readonly();

export type DriveQueryPage = z.infer<typeof DRIVE_QUERY_PAGE>;

export const DRIVE_SEARCH_PAGE = z
  .strictObject({ ...QUERY_PAGE_SHAPE, shortcuts: z.array(DRIVE_SHORTCUT).readonly() })
  .superRefine(eachItemHasOneHit)
  .readonly();

export type DriveSearchPage = z.infer<typeof DRIVE_SEARCH_PAGE>;

export const DRIVE_TEXT_SOURCES = ['document', 'image'] as const;

export const DRIVE_TEXT_STATES = ['ok', 'empty', 'failed', 'unsupported'] as const;

export type DriveTextState = (typeof DRIVE_TEXT_STATES)[number];

export const DRIVE_ITEM_TEXT = z
  .strictObject({
    itemId: ID,
    rev: z.int().positive(),
    source: z.enum(DRIVE_TEXT_SOURCES).nullable(),
    state: z.enum(['pending', ...DRIVE_TEXT_STATES]),
    reason: z.string().min(1).nullable(),
    chars: z.int().nonnegative(),
    text: z.string().nullable(),
  })
  .refine((read) => (read.state === 'ok') === (read.text !== null), {
    message: 'only a read that found text carries it',
    path: ['text'],
  })
  .readonly();

export type DriveItemText = z.infer<typeof DRIVE_ITEM_TEXT>;
