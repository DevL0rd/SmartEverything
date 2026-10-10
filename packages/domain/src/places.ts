import { z } from 'zod';

export const PLACE_NAME = z.string().trim().min(1).max(120);

export const PLACE = z.strictObject({
  name: z.string().min(1).max(120),
  region: z.string().min(1).max(120).nullable(),
  country: z.string().min(1).max(120).nullable(),
  countryCode: z.string().length(2).nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timeZone: z.string().min(1).nullable(),
});

export type PlaceMatch = z.infer<typeof PLACE>;

export const PLACES = z.strictObject({ places: z.array(PLACE).max(10) });

export type Places = z.infer<typeof PLACES>;

export function placeLabel(place: Pick<PlaceMatch, 'name' | 'region' | 'country'>): string {
  const parts = [place.name, place.region === place.name ? null : place.region, place.country];
  return parts.filter((part) => part !== null).join(', ');
}

export function shortPlaceLabel(place: Pick<PlaceMatch, 'name' | 'country'>): string {
  return place.country === null ? place.name : `${place.name}, ${place.country}`;
}
