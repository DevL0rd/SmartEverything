import { describe, expect, it } from 'vitest';
import {
  boxMeets,
  fitOf,
  placeOf,
  project,
  viewAround,
  viewBoxText,
  WORLD_HEIGHT,
  WORLD_VIEW,
  WORLD_WIDTH,
} from './projection';

describe('equirectangular projection', () => {
  it('maps degrees to tenths of a degree from the top left corner', () => {
    expect(project({ lat: 90, lon: -180 })).toEqual({ x: 0, y: 0 });
    expect(project({ lat: -90, lon: 180 })).toEqual({ x: WORLD_WIDTH, y: WORLD_HEIGHT });
    expect(project({ lat: 0, lon: 0 })).toEqual({ x: 1800, y: 900 });
    const lisbon = project({ lat: 38.72, lon: -9.14 });
    expect(lisbon.x).toBeCloseTo(1708.6);
    expect(lisbon.y).toBeCloseTo(512.8);
  });

  it('frames the inhabited latitudes and leaves Antarctica out', () => {
    expect(WORLD_VIEW).toEqual({ x: 0, y: 60, width: 3600, height: 1420 });
    expect(viewBoxText(WORLD_VIEW)).toBe('0 60 3600 1420');
  });

  it('fits the whole view inside a wide frame and centres it', () => {
    const fit = fitOf(WORLD_VIEW, { width: 1000, height: 300 });
    expect(fit.scale).toBeCloseTo(300 / 1420);
    const left = placeOf({ lat: 0, lon: -180 }, fit);
    const right = placeOf({ lat: 0, lon: 180 }, fit);
    expect(left.x + right.x).toBeCloseTo(1000);
    expect(placeOf({ lat: 84, lon: 0 }, fit).y).toBeCloseTo(0);
    expect(placeOf({ lat: -58, lon: 0 }, fit).y).toBeCloseTo(300);
  });

  it('fits the whole view inside a tall frame with sea above and below', () => {
    const fit = fitOf(WORLD_VIEW, { width: 360, height: 640 });
    expect(fit.scale).toBeCloseTo(0.1);
    expect(placeOf({ lat: 0, lon: -180 }, fit).x).toBeCloseTo(0);
    expect(placeOf({ lat: 84, lon: 0 }, fit).y).toBeCloseTo((640 - 142) / 2);
  });

  it('centres a mini map view on its point with the frame aspect', () => {
    const view = viewAround({ lat: 38.72, lon: -9.14 }, 43, { width: 300, height: 200 });
    expect(view.width).toBe(430);
    expect(view.height).toBeCloseTo(286.67, 1);
    expect(view.x + view.width / 2).toBeCloseTo(1708.6);
    expect(view.y + view.height / 2).toBeCloseTo(512.8);
    const fit = fitOf(view, { width: 300, height: 200 });
    const pin = placeOf({ lat: 38.72, lon: -9.14 }, fit);
    expect(pin.x).toBeCloseTo(150);
    expect(pin.y).toBeCloseTo(100);
  });

  it('tells whether a box touches a view', () => {
    const view = { x: 100, y: 100, width: 100, height: 100 };
    expect(boxMeets([150, 150, 160, 160], view)).toBe(true);
    expect(boxMeets([0, 0, 100, 100], view)).toBe(true);
    expect(boxMeets([0, 0, 99, 300], view)).toBe(false);
    expect(boxMeets([120, 201, 130, 260], view)).toBe(false);
  });
});
