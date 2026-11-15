import type { FileLocation, FilePlace } from '../../files';
import { COMPUTER_TRASH_PLACE } from '../source/computer-abilities';
import { placeOfPath } from '../source/computer-crumbs';
import { pathOfLocation } from '../source/computer-ops';
import { isWithin, normalPath, segmentsOf } from '../source/computer-path';

const TRASH_LOCATION: FileLocation = { place: COMPUTER_TRASH_PLACE, folder: null };

function placeHolding(path: string, places: readonly FilePlace[]): FilePlace | null {
  return places.reduce<FilePlace | null>((best, place) => {
    if (place.kind === 'trash' || !isWithin(path, place.key)) return best;
    if (best === null) return place;
    return segmentsOf(place.key).length > segmentsOf(best.key).length ? place : best;
  }, null);
}

export function locationOfPath(path: string, places: readonly FilePlace[]): FileLocation {
  const clean = normalPath(path);
  const place = placeHolding(clean, places);
  if (place === null) return placeOfPath(clean);
  return { place: place.key, folder: clean === place.key ? null : clean };
}

export function locationOfParam(
  param: string | undefined,
  places: readonly FilePlace[],
  home: string | null,
): FileLocation | null {
  if (param === COMPUTER_TRASH_PLACE) return TRASH_LOCATION;
  const path = param === undefined || param.trim() === '' ? home : param;
  return path === null ? null : locationOfPath(path, places);
}

export function paramOfLocation(location: FileLocation): string {
  return location.place === COMPUTER_TRASH_PLACE ? COMPUTER_TRASH_PLACE : pathOfLocation(location);
}
