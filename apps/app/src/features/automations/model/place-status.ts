import type { Place } from '@smarteverything/domain';
import type { PlaceReading } from './schedule';

export type PlaceStatus =
  | { readonly kind: 'ok' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'zone-differs'; readonly home: string; readonly device: string }
  | { readonly kind: 'no-location' };

export function placeStatus(
  reading: PlaceReading,
  deviceZone: string,
  usesSun: boolean,
): PlaceStatus {
  if (!reading.usable) {
    return { kind: 'invalid' };
  }
  const place: Place = reading.place;
  if (place.timeZone !== deviceZone) {
    return { kind: 'zone-differs', home: place.timeZone, device: deviceZone };
  }
  return usesSun && place.location === null ? { kind: 'no-location' } : { kind: 'ok' };
}
