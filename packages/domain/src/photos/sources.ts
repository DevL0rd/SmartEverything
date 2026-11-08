import { z } from 'zod';
import { COUNT, ID, MOMENT, NAME } from './shared';

export const PHOTO_SOURCES = ['cameras', 'ai'] as const;

export type PhotoSource = (typeof PHOTO_SOURCES)[number];

export const SOURCE_PARAMS = z.strictObject({ source: z.enum(PHOTO_SOURCES) });

export const SOURCE_CHIP = z
  .strictObject({ id: z.string().min(1), name: NAME, count: z.int().nonnegative() })
  .readonly();

export const SOURCE_ITEM = z
  .strictObject({
    itemId: ID,
    chipId: z.string().min(1),
    madeAt: MOMENT,
    kept: z.boolean(),
    name: NAME,
    mime: z.string().min(1),
    bytes: COUNT,
    durationMs: COUNT.nullable(),
  })
  .readonly();

export type SourceItem = z.infer<typeof SOURCE_ITEM>;

export const SOURCE_PAGE = z
  .strictObject({
    chips: z.array(SOURCE_CHIP).readonly(),
    items: z.array(SOURCE_ITEM).readonly(),
    next: z.string().min(1).nullable(),
  })
  .readonly();

export const SOURCE_QUERY = z.strictObject({
  chipId: z.string().min(1).optional(),
  cursor: z.string().min(1).optional(),
});

export const SOURCE_KEEP = z.strictObject({ itemIds: z.array(ID).min(1).readonly() }).readonly();

export const SOURCE_KEEP_RESULT = z.strictObject({ kept: z.int().nonnegative() }).readonly();
