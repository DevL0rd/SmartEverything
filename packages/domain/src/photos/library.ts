import { z } from 'zod';
import { DRIVE_DURATION_BUCKETS } from '../drive/query';
import { COUNT, DAY, ID, MONTH, NAME, QUERY_PLACE_ID, THUMBHASH } from './shared';

export const PHOTO_FLAGS = {
  favourite: 1,
  video: 2,
  live: 4,
  stack: 8,
  processing: 16,
  unreadable: 32,
} as const;

export type PhotoFlag = keyof typeof PHOTO_FLAGS;

const FLAGS_MASK = Object.values(PHOTO_FLAGS).reduce((mask, bit) => mask + bit, 0);

export function hasPhotoFlag(flags: number, flag: PhotoFlag): boolean {
  return (flags & PHOTO_FLAGS[flag]) !== 0;
}

export function photoFlags(flags: readonly PhotoFlag[]): number {
  return flags.reduce((mask, flag) => mask | PHOTO_FLAGS[flag], 0);
}

export const LIBRARY_FILTERS = ['all', 'favourites', 'videos', 'screenshots'] as const;

export type LibraryFilter = (typeof LIBRARY_FILTERS)[number];

const SCOPE_FIELDS = {
  filter: z.enum(LIBRARY_FILTERS),
  placeId: QUERY_PLACE_ID.optional(),
  countryCode: z.string().length(2).optional(),
  camera: NAME.optional(),
  albumId: ID.optional(),
  text: NAME.optional(),
  duration: z.enum(DRIVE_DURATION_BUCKETS).optional(),
  from: DAY.optional(),
  to: DAY.optional(),
};

const DAYS_IN_ORDER = {
  message: 'from must not be after to',
  path: ['to'],
};

function daysInOrder(scope: {
  readonly from?: string | undefined;
  readonly to?: string | undefined;
}): boolean {
  return scope.from === undefined || scope.to === undefined || scope.from <= scope.to;
}

export const LIBRARY_SCOPE = z
  .strictObject(SCOPE_FIELDS)
  .refine(daysInOrder, DAYS_IN_ORDER)
  .readonly();

export type LibraryScope = z.infer<typeof LIBRARY_SCOPE>;

export const LIBRARY_BUCKET = z.strictObject({ month: MONTH, count: COUNT.positive() }).readonly();

export type LibraryBucket = z.infer<typeof LIBRARY_BUCKET>;

const FLAG_VALUE = z.int().min(0).max(FLAGS_MASK);

const COLUMNS = {
  ids: z.array(ID).readonly(),
  revs: z.array(z.int().positive()).readonly(),
  aspect: z.array(z.number().positive()).readonly(),
  takenAt: z.array(z.int()).readonly(),
  offsetMin: z.array(z.int().min(-1440).max(1440).nullable()).readonly(),
  durationMs: z.array(COUNT.nullable()).readonly(),
  thumbhash: z.array(THUMBHASH.nullable()).readonly(),
  flags: z.array(FLAG_VALUE).readonly(),
};

export const LIBRARY_PAGE = z
  .strictObject({
    month: MONTH,
    ...COLUMNS,
    next: z.string().min(1).nullable(),
  })
  .refine(
    (page) =>
      [
        page.revs,
        page.aspect,
        page.takenAt,
        page.offsetMin,
        page.durationMs,
        page.thumbhash,
        page.flags,
      ].every((column) => column.length === page.ids.length),
    { message: 'every column holds one value per item', path: ['ids'] },
  )
  .readonly();

export type LibraryPage = z.infer<typeof LIBRARY_PAGE>;

export const LIBRARY_PAGE_QUERY = z
  .strictObject({ ...SCOPE_FIELDS, cursor: z.string().min(1).optional() })
  .refine(daysInOrder, DAYS_IN_ORDER);
