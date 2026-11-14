import { z } from 'zod';
import { COUNT, DAY, ID, NAME, PLACE_ID } from './shared';

const DAY_COUNT = z.strictObject({ day: DAY, count: COUNT }).readonly();

export const TRIP = z
  .strictObject({
    id: z.string().min(1),
    from: DAY,
    to: DAY,
    count: COUNT.positive(),
    coverItemId: ID,
    kind: z.literal('trip'),
    placeId: PLACE_ID.nullable(),
    placeName: NAME.nullable(),
    distanceFromHomeKm: z.number().nonnegative().nullable(),
    places: COUNT,
    perDay: z.array(DAY_COUNT).min(1).readonly(),
  })
  .readonly();

export type Trip = z.infer<typeof TRIP>;
