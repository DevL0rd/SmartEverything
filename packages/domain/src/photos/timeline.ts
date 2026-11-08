import { z } from 'zod';
import { COUNT, ID, MONTH, QUERY_PLACE_ID, THUMBHASH } from './shared';

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

export const PHOTO_TIMELINE_FILTERS = ['all', 'favourites', 'videos', 'screenshots'] as const;

export type PhotoTimelineFilter = (typeof PHOTO_TIMELINE_FILTERS)[number];

export const TIMELINE_SCOPE = z
  .strictObject({
    filter: z.enum(PHOTO_TIMELINE_FILTERS),
    placeId: QUERY_PLACE_ID.optional(),
  })
  .readonly();

export type TimelineScope = z.infer<typeof TIMELINE_SCOPE>;

export const TIMELINE_BUCKET = z.strictObject({ month: MONTH, count: COUNT.positive() }).readonly();

export type TimelineBucket = z.infer<typeof TIMELINE_BUCKET>;

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

export const TIMELINE_PAGE = z
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

export type TimelinePage = z.infer<typeof TIMELINE_PAGE>;

export const TIMELINE_PAGE_QUERY = z.strictObject({
  filter: z.enum(PHOTO_TIMELINE_FILTERS),
  placeId: QUERY_PLACE_ID.optional(),
  cursor: z.string().min(1).optional(),
});
