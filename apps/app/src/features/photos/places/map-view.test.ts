import { describe, expect, it } from 'vitest';
import { PLACE_CLUSTER_QUERY } from '@smarteverything/domain';
import {
  boundsOf,
  cardSpot,
  clusterQueryOf,
  geohashBounds,
  inside,
  MAP_WHEEL_PIXELS_PER_STEP,
  MAP_ZOOM_MAX,
  mapBoxOf,
  mapWheelOf,
  pannedBy,
  pinchSteps,
  WORLD_START,
  zoomedAt,
  zoomedBy,
  zoomedInto,
  wheeledAt,
  viewFitting,
  type MapView,
  type WheelState,
} from './map-view';
import { fitOf, GRID_PER_DEGREE, type GeoPoint } from '../world-map/projection';

const FRAME = { width: 960, height: 460 };

describe('map view', () => {
  it('asks for the whole world at the start', () => {
    const query = clusterQueryOf(WORLD_START, FRAME, {});
    expect(query).toEqual({ zoom: 0, west: -180, east: 180, north: 84, south: -58 });
    expect(PLACE_CLUSTER_QUERY.safeParse(query).success).toBe(true);
  });

  it('stops zooming where the hub stops clustering', () => {
    expect(
      PLACE_CLUSTER_QUERY.safeParse({
        ...boundsOf(mapBoxOf(WORLD_START, FRAME)),
        zoom: MAP_ZOOM_MAX,
      }).success,
    ).toBe(true);
    expect(
      PLACE_CLUSTER_QUERY.safeParse({
        ...boundsOf(mapBoxOf(WORLD_START, FRAME)),
        zoom: MAP_ZOOM_MAX + 1,
      }).success,
    ).toBe(false);
    expect(zoomedBy({ ...WORLD_START, zoom: MAP_ZOOM_MAX }, 1).zoom).toBe(MAP_ZOOM_MAX);
    expect(zoomedBy(WORLD_START, -1).zoom).toBe(0);
  });

  it('halves the span with each zoom step around the centre', () => {
    const lisbon = zoomedInto({ ...WORLD_START, zoom: 3 }, { lat: 38.7, lon: -9.1 });
    expect(lisbon).toEqual({ zoom: 4, lat: 38.7, lon: -9.1 });
    const bounds = boundsOf(mapBoxOf(lisbon, FRAME));
    expect(bounds.east - bounds.west).toBeCloseTo(22.5);
    expect(inside({ lat: 38.7, lon: -9.1 }, bounds)).toBe(true);
    expect(inside({ lat: 35.7, lon: 139.7 }, bounds)).toBe(false);
  });

  it('moves the centre against the drag and keeps the whole world still', () => {
    const view = { zoom: 2, lat: 0, lon: 0 };
    const moved = pannedBy(view, 96, 0, FRAME);
    expect(moved.lon).toBeCloseTo(-9);
    expect(moved.lat).toBe(0);
    expect(pannedBy(WORLD_START, 96, 40, FRAME)).toBe(WORLD_START);
  });

  it('turns a pinch into whole zoom steps', () => {
    expect(pinchSteps(2.1)).toBe(1);
    expect(pinchSteps(0.5)).toBe(-1);
    expect(pinchSteps(1.2)).toBe(0);
  });

  it('keeps the cluster card inside the map and flips it near the right edge', () => {
    const card = { width: 300, height: 200 };
    expect(cardSpot({ x: 100, y: 100 }, FRAME, card)).toEqual({ left: 116, top: 12 });
    expect(cardSpot({ x: 800, y: 300 }, FRAME, card)).toEqual({ left: 484, top: 200 });
  });
  it('decodes a geohash cell into its bounds', () => {
    expect(geohashBounds('')).toEqual({ west: -180, east: 180, south: -90, north: 90 });
    expect(geohashBounds('e')).toEqual({ west: -45, east: 0, south: 0, north: 45 });
    const lisbon = geohashBounds('eycs');
    expect(inside({ lat: 38.72, lon: -9.14 }, lisbon)).toBe(true);
    expect(inside({ lat: 41.15, lon: -8.61 }, lisbon)).toBe(false);
  });

  it('zooms the wheel in around the pointer, keeping the place under it still', () => {
    const at = { x: 700, y: 120 };
    const geoAt = (view: MapView): GeoPoint => {
      const fit = fitOf(mapBoxOf(view, FRAME), FRAME);
      return {
        lon: (at.x - fit.dx) / fit.scale / GRID_PER_DEGREE - 180,
        lat: 90 - (at.y - fit.dy) / fit.scale / GRID_PER_DEGREE,
      };
    };
    for (const from of [WORLD_START, { zoom: 3, lat: 40, lon: 10 }]) {
      const next = zoomedAt(from, 2, at, FRAME);
      expect(next.zoom).toBe(from.zoom + 2);
      expect(geoAt(next).lat).toBeCloseTo(geoAt(from).lat);
      expect(geoAt(next).lon).toBeCloseTo(geoAt(from).lon);
    }
  });

  it('returns to the whole world and stops at the deepest zoom', () => {
    const near = { zoom: 2, lat: 40, lon: 10 };
    expect(zoomedAt(near, -5, { x: 10, y: 10 }, FRAME)).toEqual({ ...near, zoom: 0 });
    const deepest = { zoom: MAP_ZOOM_MAX, lat: 40, lon: 10 };
    expect(zoomedAt(deepest, 1, { x: 10, y: 10 }, FRAME)).toBe(deepest);
  });

  it('turns wheel travel into whole zoom steps and keeps the rest for the next turn', () => {
    expect(mapWheelOf(0, -MAP_WHEEL_PIXELS_PER_STEP * 2.5)).toEqual({ steps: 1, pending: 50 });
    expect(mapWheelOf(50, -60)).toEqual({ steps: 1, pending: 10 });
    expect(mapWheelOf(50, 120)).toEqual({ steps: -1, pending: -20 });
  });

  it('zooms one step per wheel notch and keeps the place under the pointer through six notches', () => {
    const at = { x: 540, y: 110 };
    const geoAt = (view: MapView): GeoPoint => {
      const fit = fitOf(mapBoxOf(view, FRAME), FRAME);
      return {
        lon: (at.x - fit.dx) / fit.scale / GRID_PER_DEGREE - 180,
        lat: 90 - (at.y - fit.dy) / fit.scale / GRID_PER_DEGREE,
      };
    };
    const start = geoAt(WORLD_START);
    let state: WheelState = { view: WORLD_START, pending: 0 };
    for (let notch = 0; notch < 6; notch += 1) state = wheeledAt(state, -120, at, FRAME);
    expect(state.view.zoom).toBe(6);
    expect(geoAt(state.view).lat).toBeCloseTo(start.lat);
    expect(geoAt(state.view).lon).toBeCloseTo(start.lon);
  });

  it('fits the photos on start and fills a tall frame instead of letterboxing the world', () => {
    const berlin = { lat: 52.5, lon: 13.4, count: 4000 };
    const paris = { lat: 48.9, lon: 2.4, count: 500 };
    const sydney = { lat: -33.9, lon: 151.2, count: 100 };
    const europe = viewFitting([berlin, paris], FRAME);
    expect(europe.zoom).toBeGreaterThan(2);
    expect(europe.lon).toBeCloseTo(7.9);
    expect(viewFitting([berlin, paris, sydney], { width: 1020, height: 400 })).toEqual(WORLD_START);
    expect(viewFitting([berlin, paris, sydney], FRAME).zoom).toBe(1);
    const tall = { width: 380, height: 560 };
    const world = viewFitting([berlin, paris, sydney], tall);
    expect(world.zoom).toBe(2);
    expect(world.lat).toBeGreaterThan(40);
    expect(viewFitting([berlin], FRAME).zoom).toBe(10);
  });
});
