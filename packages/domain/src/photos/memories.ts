import { z } from 'zod';
import { COUNT, DAY, ID, MONTH, NAME, PLACE_ID } from './shared';

export const MEMORY_KINDS = [
  'on_this_day',
  'this_week',
  'day_out',
  'burst',
  'trip',
  'year',
] as const;

export type MemoryKind = (typeof MEMORY_KINDS)[number];

const BASE = {
  id: z.string().min(1),
  from: DAY,
  to: DAY,
  count: COUNT.positive(),
  coverItemId: ID,
};

const NAMED_COUNT = z.strictObject({ name: NAME, count: COUNT }).readonly();

const PLACE_COUNT = z.strictObject({ placeId: PLACE_ID, name: NAME, count: COUNT }).readonly();

const DAY_COUNT = z.strictObject({ day: DAY, count: COUNT }).readonly();

export const YEAR_IN_REVIEW = z
  .strictObject({
    year: z.int().min(1900).max(9999),
    perMonth: z
      .array(z.strictObject({ month: MONTH, count: COUNT }).readonly())
      .length(12)
      .readonly(),
    topPlaces: z.array(PLACE_COUNT).readonly(),
    topCameras: z.array(NAMED_COUNT).readonly(),
    mostFavouritedMonth: MONTH.nullable(),
    longestDayOut: z.strictObject({ day: DAY, count: COUNT }).readonly().nullable(),
  })
  .readonly();

export type YearInReview = z.infer<typeof YEAR_IN_REVIEW>;

export const TRIP = z
  .strictObject({
    ...BASE,
    kind: z.literal('trip'),
    placeId: PLACE_ID.nullable(),
    placeName: NAME.nullable(),
    distanceFromHomeKm: z.number().nonnegative().nullable(),
    places: COUNT,
    perDay: z.array(DAY_COUNT).min(1).readonly(),
  })
  .readonly();

export type Trip = z.infer<typeof TRIP>;

export const MEMORY = z
  .discriminatedUnion('kind', [
    z.strictObject({ ...BASE, kind: z.literal('on_this_day'), yearsAgo: z.int().positive() }),
    z.strictObject({ ...BASE, kind: z.literal('this_week') }),
    z.strictObject({
      ...BASE,
      kind: z.literal('day_out'),
      placeId: PLACE_ID.nullable(),
      placeName: NAME.nullable(),
    }),
    z.strictObject({ ...BASE, kind: z.literal('burst'), stackId: ID }),
    TRIP,
    z.strictObject({ ...BASE, kind: z.literal('year'), review: YEAR_IN_REVIEW }),
  ])
  .refine((memory) => memory.from <= memory.to, {
    message: 'from must not be after to',
    path: ['to'],
  })
  .readonly();

export type Memory = z.infer<typeof MEMORY>;

export const MEMORY_PARAMS = z.strictObject({ memoryId: z.string().min(1) });
