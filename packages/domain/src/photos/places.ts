import { z } from 'zod';
import { COUNT, ID, LATITUDE, LONGITUDE, MOMENT, NAME, PLACE_ID, QUERY_PLACE_ID } from './shared';

export const PHOTO_PLACE = z
  .strictObject({
    id: PLACE_ID,
    name: NAME,
    admin: NAME.nullable(),
    country: NAME,
    countryCode: z.string().length(2),
    lat: LATITUDE,
    lon: LONGITUDE,
    count: COUNT,
    coverItemId: ID.nullable(),
  })
  .readonly();

export type PhotoPlace = z.infer<typeof PHOTO_PLACE>;

export const PLACE_COUNTRY = z
  .strictObject({
    countryCode: z.string().length(2),
    country: NAME,
    count: COUNT,
    coverItemId: ID.nullable(),
    places: z.array(PHOTO_PLACE).readonly(),
  })
  .readonly();

export type PlaceCountry = z.infer<typeof PLACE_COUNTRY>;

export const PLACE_CLUSTER = z
  .strictObject({
    geohash: z.string().regex(/^[0-9b-hjkmnp-z]+$/),
    lat: LATITUDE,
    lon: LONGITUDE,
    count: COUNT.positive(),
    coverItemId: ID,
    placeId: PLACE_ID.nullable(),
  })
  .readonly();

export type PlaceCluster = z.infer<typeof PLACE_CLUSTER>;

export const PLACE_CLUSTER_QUERY = z
  .strictObject({
    zoom: z.coerce.number().int().min(0).max(24),
    west: z.coerce.number().min(-180).max(180),
    south: z.coerce.number().min(-90).max(90),
    east: z.coerce.number().min(-180).max(180),
    north: z.coerce.number().min(-90).max(90),
    from: MOMENT.optional(),
    to: MOMENT.optional(),
  })
  .refine((query) => query.south <= query.north, {
    message: 'south must not be above north',
    path: ['north'],
  })
  .refine(
    (query) =>
      query.from === undefined ||
      query.to === undefined ||
      Date.parse(query.from) <= Date.parse(query.to),
    {
      message: 'from must not be after to',
      path: ['to'],
    },
  );

export type PlaceClusterQuery = z.infer<typeof PLACE_CLUSTER_QUERY>;

export const PLACE_PARAMS = z.strictObject({ placeId: QUERY_PLACE_ID });
