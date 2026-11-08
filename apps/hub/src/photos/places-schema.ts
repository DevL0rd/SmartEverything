import { z } from 'zod';

const ITEM_ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });
const DAY = z.iso.date();
const COUNT = z.int().nonnegative();
const LATITUDE = z.number().min(-90).max(90);
const LONGITUDE = z.number().min(-180).max(180);

export const PHOTO_PLACE = z
  .strictObject({
    id: z.string().min(1),
    name: z.string().min(1),
    admin: z.string().min(1).nullable(),
    country: z.string().regex(/^[A-Z]{2}$/),
    countryName: z.string().min(1),
    lat: LATITUDE,
    lon: LONGITUDE,
  })
  .readonly();

export type PhotoPlace = z.infer<typeof PHOTO_PLACE>;

export const PHOTO_MAP_QUERY = z
  .strictObject({
    zoom: z.coerce.number().int().min(0),
    from: MOMENT.optional(),
    to: MOMENT.optional(),
    south: z.coerce.number().min(-90).max(90).optional(),
    north: z.coerce.number().min(-90).max(90).optional(),
    west: z.coerce.number().min(-180).max(180).optional(),
    east: z.coerce.number().min(-180).max(180).optional(),
  })
  .refine(
    (query) => {
      const given = [query.south, query.north, query.west, query.east].filter(
        (value) => value !== undefined,
      );
      return given.length === 0 || given.length === 4;
    },
    { message: 'give south, north, west and east together or not at all' },
  )
  .refine((query) => query.south === undefined || (query.north ?? 0) >= query.south, {
    message: 'north must not be below south',
  })
  .readonly();

export type PhotoMapQuery = z.infer<typeof PHOTO_MAP_QUERY>;

export const PHOTO_MAP_CLUSTER = z
  .strictObject({
    key: z.string().regex(/^[0-9b-hjkmnp-z]+$/),
    lat: LATITUDE,
    lon: LONGITUDE,
    count: z.int().positive(),
    first: MOMENT.nullable(),
    latest: MOMENT.nullable(),
    coverItemId: ITEM_ID,
    placeName: z.string().min(1).nullable(),
  })
  .readonly();

export type PhotoMapCluster = z.infer<typeof PHOTO_MAP_CLUSTER>;

export const PHOTO_MAP_CLUSTERS = z
  .strictObject({
    zoom: COUNT,
    precision: z.int().min(1).max(12),
    total: COUNT,
    clusters: z.array(PHOTO_MAP_CLUSTER).readonly(),
  })
  .readonly();

export type PhotoMapClusters = z.infer<typeof PHOTO_MAP_CLUSTERS>;

export const PHOTO_MAP_MONTH = z
  .strictObject({ month: z.string().regex(/^\d{4}-\d{2}$/), count: z.int().positive() })
  .readonly();

export const PHOTO_MAP_MONTHS = z
  .strictObject({ months: z.array(PHOTO_MAP_MONTH).readonly() })
  .readonly();

export type PhotoMapMonths = z.infer<typeof PHOTO_MAP_MONTHS>;

export const PHOTO_PLACE_ENTRY = z
  .strictObject({
    place: PHOTO_PLACE,
    count: z.int().positive(),
    latest: MOMENT.nullable(),
    coverItemId: ITEM_ID,
  })
  .readonly();

export const PHOTO_PLACE_COUNTRY = z
  .strictObject({
    country: z.string().regex(/^[A-Z]{2}$/),
    name: z.string().min(1),
    count: z.int().positive(),
    places: z.array(PHOTO_PLACE_ENTRY).readonly(),
  })
  .readonly();

export const PHOTO_PLACE_LIST = z
  .strictObject({ countries: z.array(PHOTO_PLACE_COUNTRY).readonly() })
  .readonly();

export type PhotoPlaceList = z.infer<typeof PHOTO_PLACE_LIST>;

export const PHOTO_PLACE_VISIT = z
  .strictObject({ from: DAY, to: DAY, days: z.int().positive(), count: z.int().positive() })
  .readonly();

export type PhotoPlaceVisit = z.infer<typeof PHOTO_PLACE_VISIT>;

export const PHOTO_PLACE_DETAIL = z
  .strictObject({
    place: PHOTO_PLACE,
    items: COUNT,
    images: COUNT,
    videos: COUNT,
    favourites: COUNT,
    days: COUNT,
    first: MOMENT.nullable(),
    latest: MOMENT.nullable(),
    coverItemId: ITEM_ID.nullable(),
    visits: z.array(PHOTO_PLACE_VISIT).readonly(),
  })
  .readonly();

export type PhotoPlaceDetail = z.infer<typeof PHOTO_PLACE_DETAIL>;

export const PHOTO_PLACE_PARAMS = z.strictObject({ placeId: z.string().min(1) });
