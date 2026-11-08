import { describe, expect, it } from 'vitest';
import { PLACE_CLUSTER_QUERY } from '@smarteverything/domain';
import {
  boundsOf,
  cardSpot,
  clusterQueryOf,
  geohashBounds,
  inside,
  MAP_ZOOM_MAX,
  mapBoxOf,
  pannedBy,
  pinchSteps,
  WORLD_START,
  zoomedBy,
  zoomedInto,
} from './map-view';

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
});
