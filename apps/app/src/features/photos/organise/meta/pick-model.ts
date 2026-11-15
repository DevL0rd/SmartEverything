import type { PhotoLocationEdit, PlaceMatch } from '@smarteverything/domain';
import { mapBoxOf, type MapView } from '../../places/map-view';
import {
  fitOf,
  GRID_PER_DEGREE,
  placeOf,
  type FrameSize,
  type GeoPoint,
  type MapPoint,
} from '../../world-map/projection';

export const PICK_ZOOM = 6;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function pointAt(at: MapPoint, view: MapView, frame: FrameSize): GeoPoint {
  const fit = fitOf(mapBoxOf(view, frame), frame);
  const gridX = (at.x - fit.dx) / fit.scale;
  const gridY = (at.y - fit.dy) / fit.scale;
  return {
    lat: clamp(90 - gridY / GRID_PER_DEGREE, -90, 90),
    lon: clamp(gridX / GRID_PER_DEGREE - 180, -180, 180),
  };
}

export function pinAt(point: GeoPoint, view: MapView, frame: FrameSize): MapPoint {
  return placeOf(point, fitOf(mapBoxOf(view, frame), frame));
}

export function viewOn(point: GeoPoint, zoom: number): MapView {
  return { zoom, lat: point.lat, lon: point.lon };
}

export function placeName(place: PlaceMatch): string {
  return [place.name, place.region === place.name ? null : place.region, place.country]
    .filter((part): part is string => part !== null)
    .join(', ');
}

export function locationOfMatch(place: PlaceMatch): PhotoLocationEdit {
  return { latitude: place.latitude, longitude: place.longitude, label: placeName(place) };
}

export function coordinateText(point: GeoPoint): string {
  const lat = `${Math.abs(point.lat).toFixed(4)}° ${point.lat < 0 ? 'S' : 'N'}`;
  const lon = `${Math.abs(point.lon).toFixed(4)}° ${point.lon < 0 ? 'W' : 'E'}`;
  return `${lat}, ${lon}`;
}
