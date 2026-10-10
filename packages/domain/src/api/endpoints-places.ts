import { z } from 'zod';
import { PLACE, PLACES } from '../places';
import { NO_BODY, endpoint } from './endpoint';
import { NOTHING } from './primitives';

export const PLACE_AREA_ENDPOINTS = {
  searchPlaces: endpoint({
    method: 'GET',
    path: '/api/places/search',
    access: 'member',
    summary: 'Find towns and cities by name, with their country, region and time zone',
    params: NOTHING,
    query: z.strictObject({
      q: z.string().trim().min(2).max(80),
      count: z.coerce.number().int().min(1).max(10).default(8),
    }),
    body: NO_BODY,
    response: PLACES,
  }),
  locatePlace: endpoint({
    method: 'GET',
    path: '/api/places/reverse',
    access: 'member',
    summary: 'The town or city at a point, with its country, region and time zone',
    params: NOTHING,
    query: z.strictObject({
      latitude: z.coerce.number().min(-90).max(90),
      longitude: z.coerce.number().min(-180).max(180),
    }),
    body: NO_BODY,
    response: z.strictObject({ place: PLACE }),
  }),
} as const;
