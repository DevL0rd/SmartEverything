import type { PlaceClusterQuery } from '@smarteverything/domain';
import {
  fitOf,
  GRID_PER_DEGREE,
  viewAround,
  WORLD_VIEW,
  type FrameSize,
  type GeoPoint,
  type MapBox,
  type MapPoint,
} from '../world-map/projection';

export const MAP_ZOOM_MAX = 24;
const LAT_EDGE = 85;
const WORLD_SPAN = 360;

export interface MapView {
  readonly zoom: number;
  readonly lat: number;
  readonly lon: number;
}

export interface MapBounds {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
}

export interface TimeWindow {
  readonly from?: string;
  readonly to?: string;
}

export const WORLD_START: MapView = {
  zoom: 0,
  lat: 90 - (WORLD_VIEW.y + WORLD_VIEW.height / 2) / GRID_PER_DEGREE,
  lon: 0,
};

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function spanOf(zoom: number): number {
  return WORLD_SPAN / 2 ** zoom;
}

export function mapBoxOf(view: MapView, frame: FrameSize): MapBox {
  return view.zoom === 0 ? WORLD_VIEW : viewAround(view, spanOf(view.zoom), frame);
}

export function boundsOf(box: MapBox): MapBounds {
  const lonOf = (x: number): number => clamp(x / GRID_PER_DEGREE - 180, -180, 180);
  const latOf = (y: number): number => clamp(90 - y / GRID_PER_DEGREE, -90, 90);
  return {
    west: lonOf(box.x),
    east: lonOf(box.x + box.width),
    north: latOf(box.y),
    south: latOf(box.y + box.height),
  };
}

export function clusterQueryOf(
  view: MapView,
  frame: FrameSize,
  window: TimeWindow,
): PlaceClusterQuery {
  return { zoom: view.zoom, ...boundsOf(mapBoxOf(view, frame)), ...window };
}

const FIT_ROOM = 1.4;
export const FIT_ZOOM_MOST = 10;

export function fillZoomOf(frame: FrameSize): number {
  const needed = (spanOf(0) * GRID_PER_DEGREE * frame.height) / (frame.width * WORLD_VIEW.height);
  return needed <= 1 ? 0 : Math.ceil(Math.log2(needed));
}

export interface WeightedPoint extends GeoPoint {
  readonly count: number;
}

function weightedCentre(points: readonly WeightedPoint[]): GeoPoint {
  const total = points.reduce((sum, point) => sum + point.count, 0);
  return {
    lat: points.reduce((sum, point) => sum + point.lat * point.count, 0) / total,
    lon: points.reduce((sum, point) => sum + point.lon * point.count, 0) / total,
  };
}

export function viewFitting(points: readonly WeightedPoint[], frame: FrameSize): MapView {
  if (points.length === 0) throw new Error('The map has no places to fit');
  const lats = points.map((point) => point.lat);
  const lons = points.map((point) => point.lon);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const west = Math.min(...lons);
  const east = Math.max(...lons);
  const needed = Math.max(east - west, ((north - south) * frame.width) / frame.height) * FIT_ROOM;
  const fits = needed === 0 ? FIT_ZOOM_MOST : Math.floor(Math.log2(WORLD_SPAN / needed));
  const fill = fillZoomOf(frame);
  const zoom = clamp(fits, fill, FIT_ZOOM_MOST);
  if (zoom === 0) return WORLD_START;
  const centre =
    fits < fill ? weightedCentre(points) : { lat: (north + south) / 2, lon: (east + west) / 2 };
  return { zoom, lat: clamp(centre.lat, -LAT_EDGE, LAT_EDGE), lon: centre.lon };
}

export function zoomedBy(view: MapView, by: number): MapView {
  return { ...view, zoom: clamp(view.zoom + by, 0, MAP_ZOOM_MAX) };
}

export function zoomedInto(view: MapView, point: GeoPoint): MapView {
  return { zoom: clamp(view.zoom + 1, 0, MAP_ZOOM_MAX), lat: point.lat, lon: point.lon };
}

export function pannedBy(view: MapView, dx: number, dy: number, frame: FrameSize): MapView {
  if (view.zoom === 0) return view;
  const perPixel = 1 / (fitOf(mapBoxOf(view, frame), frame).scale * GRID_PER_DEGREE);
  return {
    zoom: view.zoom,
    lat: clamp(view.lat + dy * perPixel, -LAT_EDGE, LAT_EDGE),
    lon: clamp(view.lon - dx * perPixel, -180, 180),
  };
}

export function zoomedAt(view: MapView, by: number, at: MapPoint, frame: FrameSize): MapView {
  const zoom = clamp(view.zoom + by, 0, MAP_ZOOM_MAX);
  if (zoom === view.zoom) return view;
  if (zoom === 0) return { ...view, zoom };
  const fit = fitOf(mapBoxOf(view, frame), frame);
  const perPixel = (spanOf(zoom) * GRID_PER_DEGREE) / frame.width;
  const x = (at.x - fit.dx) / fit.scale + (frame.width / 2 - at.x) * perPixel;
  const y = (at.y - fit.dy) / fit.scale + (frame.height / 2 - at.y) * perPixel;
  return {
    zoom,
    lat: clamp(90 - y / GRID_PER_DEGREE, -LAT_EDGE, LAT_EDGE),
    lon: clamp(x / GRID_PER_DEGREE - 180, -180, 180),
  };
}

export const MAP_WHEEL_PIXELS_PER_STEP = 100;

export interface MapWheel {
  readonly steps: number;
  readonly pending: number;
}

export function mapWheelOf(pending: number, pixels: number): MapWheel {
  const kept = Math.sign(pending) === Math.sign(-pixels) ? pending : 0;
  const total = kept - pixels;
  const whole = Math.trunc(total / MAP_WHEEL_PIXELS_PER_STEP);
  return {
    steps: Math.sign(whole),
    pending: total - whole * MAP_WHEEL_PIXELS_PER_STEP,
  };
}

export interface WheelState {
  readonly view: MapView;
  readonly pending: number;
}

export function wheeledAt(
  state: WheelState,
  pixels: number,
  at: MapPoint,
  frame: FrameSize,
): WheelState {
  const next = mapWheelOf(state.pending, pixels);
  const view = next.steps === 0 ? state.view : zoomedAt(state.view, next.steps, at, frame);
  return { view, pending: next.pending };
}

export function pinchSteps(scale: number): number {
  return scale > 0 ? Math.round(Math.log2(scale)) : 0;
}

export function inside(point: GeoPoint, bounds: MapBounds): boolean {
  return (
    point.lat >= bounds.south &&
    point.lat <= bounds.north &&
    point.lon >= bounds.west &&
    point.lon <= bounds.east
  );
}

const GEOHASH_ALPHABET = '0123456789bcdefghjkmnpqrstuvwxyz';
const GEOHASH_BITS = [16, 8, 4, 2, 1] as const;

interface Span {
  readonly low: number;
  readonly high: number;
}

function halve(span: Span, upper: boolean): Span {
  const mid = (span.low + span.high) / 2;
  return upper ? { low: mid, high: span.high } : { low: span.low, high: mid };
}

export function geohashBounds(hash: string): MapBounds {
  let lon: Span = { low: -180, high: 180 };
  let lat: Span = { low: -90, high: 90 };
  let lonTurn = true;
  for (const char of hash) {
    const value = GEOHASH_ALPHABET.indexOf(char);
    for (const bit of GEOHASH_BITS) {
      const upper = (value & bit) !== 0;
      if (lonTurn) lon = halve(lon, upper);
      else lat = halve(lat, upper);
      lonTurn = !lonTurn;
    }
  }
  return { west: lon.low, east: lon.high, south: lat.low, north: lat.high };
}

export interface CardSize {
  readonly width: number;
  readonly height: number;
}

export interface CardSpot {
  readonly left: number;
  readonly top: number;
}

const CARD_GAP = 16;
const CARD_PAD = 12;

export function cardSpot(at: { x: number; y: number }, frame: FrameSize, card: CardSize): CardSpot {
  const right = at.x + CARD_GAP;
  const flipped = right + card.width > frame.width - CARD_PAD;
  const left = flipped ? at.x - CARD_GAP - card.width : right;
  const most = (edge: number, size: number): number => Math.max(CARD_PAD, edge - size - CARD_PAD);
  return {
    left: clamp(left, CARD_PAD, most(frame.width, card.width)),
    top: clamp(at.y - card.height / 2, CARD_PAD, most(frame.height, card.height)),
  };
}
