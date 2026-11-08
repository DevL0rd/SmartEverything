import { describe, expect, it } from 'vitest';
import type { HomeMapAutoFactsFn } from '../src/home-map-auto-place-types';
import { HOME_MAP_FLOOR_ID } from '../src/home-map-elements';
import { homeMapPolygonArea } from '../src/home-map-geometry';
import type { HomeMapPlacement } from '../src/home-map-placement';
import {
  HOME_MAP_CAMERA_FOV_DEFAULT,
  homeMapAvailablePanModes,
  homeMapBlockingSegments,
  homeMapCameraDefaults,
  homeMapCameraDirection,
  homeMapCameraView,
  homeMapCameraVisibility,
  homeMapOpeningSeeThrough,
  type HomeMapPtzState,
  type HomeMapVisibilityInput,
  type HomeMapVisibilityOpening,
  type HomeMapVisibilityWall,
} from '../src/home-map-visibility';

const FOOTPRINT = { w: 0.1, d: 0.1, h: 0.1 };

const facts =
  (
    fov: { hDeg: number; vDeg: number; rangeM: number; exact: boolean } | undefined,
  ): HomeMapAutoFactsFn =>
  () => ({ mount: 'wall', defaultHeightM: 2, footprint: FOOTPRINT, ...(fov ? { fov } : {}) });

const wall = (
  id: string,
  from: [number, number],
  to: [number, number],
  extra: { kind?: HomeMapVisibilityWall['kind']; height?: number | null } = {},
): HomeMapVisibilityWall => ({
  id,
  from: { x: from[0], y: from[1] },
  to: { x: to[0], y: to[1] },
  kind: extra.kind ?? 'solid',
  height: extra.height ?? null,
});

const box = (): readonly HomeMapVisibilityWall[] => [
  wall('s', [0, 0], [10, 0]),
  wall('e', [10, 0], [10, 10]),
  wall('n', [10, 10], [0, 10]),
  wall('w', [0, 10], [0, 0]),
];

const PLACEMENT_ID = '8f5c2f8e-1b1d-4a3b-9a55-0c3d6f1e2a10';

const placement = (
  mode: 'fixed' | 'presets' | 'live',
  overrides: Partial<HomeMapPlacement> = {},
): HomeMapPlacement => ({
  deviceId: PLACEMENT_ID,
  floorId: HOME_MAP_FLOOR_ID.parse('floor-1'),
  at: { x: 2, y: 5 },
  rotation: 0,
  height: 2.2,
  tilt: 20,
  mount: 'wall',
  auto: false,
  camera: {
    hfovDeg: 90,
    vfovDeg: 50,
    rangeM: 20,
    fovSource: 'exact',
    pan: { mode, yawDeg: 0, presets: { 'Position 1': { yawDeg: 90, tiltDeg: 10 } } },
    showCone: true,
  },
  ...overrides,
});

const NO_PTZ: HomeMapPtzState = { preset: null, live: null, moveUncertain: false };

describe('field of view defaults', () => {
  it('takes an exact model fov from the facts and marks it exact', () => {
    const camera = homeMapCameraDefaults(
      facts({ hDeg: 110, vDeg: 62, rangeM: 6, exact: true }),
      'cam',
      45,
    );
    expect(camera).toMatchObject({ hfovDeg: 110, vfovDeg: 62, rangeM: 6, fovSource: 'exact' });
    expect(camera.pan).toEqual({ mode: 'fixed', yawDeg: 45, presets: {} });
  });

  it('keeps a model fov that is not exact as estimated', () => {
    const camera = homeMapCameraDefaults(
      facts({ hDeg: 90, vDeg: 50, rangeM: 5, exact: false }),
      'cam',
      0,
    );
    expect(camera).toMatchObject({ hfovDeg: 90, fovSource: 'estimated' });
  });

  it('falls back to the generic 100 by 56 degrees and 8 m, estimated, when nothing knows the model', () => {
    const camera = homeMapCameraDefaults(facts(undefined), 'cam', 0);
    expect(camera).toMatchObject({ ...HOME_MAP_CAMERA_FOV_DEFAULT, fovSource: 'estimated' });
    expect(HOME_MAP_CAMERA_FOV_DEFAULT).toEqual({ hfovDeg: 100, vfovDeg: 56, rangeM: 8 });
  });
});

describe('pan modes offered', () => {
  it('never offers live for a model without a proven reported angle', () => {
    expect(homeMapAvailablePanModes({ model: 'xiaomi.camera.083ae2', presets: true })).toEqual([
      'fixed',
      'presets',
    ]);
    expect(homeMapAvailablePanModes({ model: 'chuangmi.camera.ipc009', presets: false })).toEqual([
      'fixed',
    ]);
  });
});

describe('camera direction', () => {
  it('fixed uses the stored yaw and the placement tilt, known until a move is uncertain', () => {
    expect(homeMapCameraDirection(placement('fixed'), NO_PTZ)).toEqual({
      yawDeg: 0,
      tiltDeg: 20,
      known: true,
    });
    expect(
      homeMapCameraDirection(placement('fixed'), { ...NO_PTZ, moveUncertain: true })?.known,
    ).toBe(false);
  });

  it('presets use the angles stored for the current preset value', () => {
    expect(
      homeMapCameraDirection(placement('presets'), { ...NO_PTZ, preset: 'Position 1' }),
    ).toEqual({
      yawDeg: 90,
      tiltDeg: 10,
      known: true,
    });
  });

  it('presets are unknown with no current preset, an unstored preset, or after an uncertain move', () => {
    expect(homeMapCameraDirection(placement('presets'), NO_PTZ)?.known).toBe(false);
    expect(
      homeMapCameraDirection(placement('presets'), { ...NO_PTZ, preset: 'Other' })?.known,
    ).toBe(false);
    expect(
      homeMapCameraDirection(placement('presets'), {
        preset: 'Position 1',
        live: null,
        moveUncertain: true,
      })?.known,
    ).toBe(false);
  });

  it('live follows the reported angle and is unknown when none is reported', () => {
    expect(
      homeMapCameraDirection(placement('live'), { ...NO_PTZ, live: { yawDeg: 33, tiltDeg: 5 } }),
    ).toEqual({ yawDeg: 33, tiltDeg: 5, known: true });
    expect(homeMapCameraDirection(placement('live'), NO_PTZ)?.known).toBe(false);
  });

  it('has no direction for a placement without a camera', () => {
    expect(homeMapCameraDirection(placement('fixed', { camera: null }), NO_PTZ)).toBeNull();
  });
});

describe('visibility polygon', () => {
  const input = (overrides: Partial<HomeMapVisibilityInput> = {}): HomeMapVisibilityInput => ({
    at: { x: 2, y: 5 },
    yawDeg: 0,
    hfovDeg: 90,
    rangeM: 20,
    heightM: 2.2,
    walls: box(),
    ...overrides,
  });

  it('stops at the far wall of the room instead of the range', () => {
    const polygon = homeMapCameraVisibility(input());
    const xs = polygon.map((p) => p.x);
    expect(Math.max(...xs)).toBeCloseTo(10, 6);
    expect(polygon.every((p) => p.x <= 10 + 1e-6 && p.y >= -1e-6 && p.y <= 10 + 1e-6)).toBe(true);
    expect(polygon[0]).toEqual({ x: 2, y: 5 });
  });

  it('is the exact wedge area when no wall is in range', () => {
    const polygon = homeMapCameraVisibility(
      input({ walls: [], rangeM: 4, hfovDeg: 90, arcStepDeg: 1 }),
    );
    const sector = (Math.PI / 4) * 16;
    expect(homeMapPolygonArea({ outer: polygon, holes: [] })).toBeCloseTo(sector, 0);
  });

  it('is shadowed behind a wall that blocks part of the view', () => {
    const walls = [...box(), wall('p', [6, 4], [6, 6])];
    const polygon = homeMapCameraVisibility(input({ walls, hfovDeg: 20 }));
    expect(polygon.slice(1).every((p) => Math.abs(p.x - 6) < 1e-6)).toBe(true);
  });

  it('sees through glass, railings and low half walls but not solid or tall half walls', () => {
    const lookup = (kind: HomeMapVisibilityWall['kind'], height: number | null): number =>
      homeMapBlockingSegments([wall('w', [6, 0], [6, 10], { kind, height })], [], 2.2).length;
    expect(lookup('glass', null)).toBe(0);
    expect(lookup('railing', null)).toBe(0);
    expect(lookup('half', 1)).toBe(0);
    expect(lookup('half', 2.2)).toBe(1);
    expect(lookup('solid', null)).toBe(1);
  });

  it('passes through a see-through gap in a wall and is blocked by a closed door', () => {
    const walls = [...box(), wall('p', [6, 0], [6, 10])];
    const gap = (seeThrough: boolean): HomeMapVisibilityOpening => ({
      wallId: 'p',
      offset: 4,
      width: 2,
      seeThrough,
    });
    const open = homeMapCameraVisibility(input({ walls, openings: [gap(true)], hfovDeg: 20 }));
    const closed = homeMapCameraVisibility(input({ walls, openings: [gap(false)], hfovDeg: 20 }));
    expect(Math.max(...open.map((p) => p.x))).toBeCloseTo(10, 3);
    expect(Math.max(...closed.map((p) => p.x))).toBeCloseTo(6, 3);
  });

  it('does not leak through a corner where two walls meet', () => {
    const walls = [wall('a', [5, 0], [5, 5]), wall('b', [5, 5], [10, 5])];
    const polygon = homeMapCameraVisibility(
      input({ at: { x: 1, y: 1 }, yawDeg: 45, hfovDeg: 40, walls, rangeM: 30 }),
    );
    expect(polygon.slice(1).every((p) => p.x <= 5 + 1e-6 || p.y >= 5 - 1e-6)).toBe(true);
  });

  it('closes a full circle without an apex', () => {
    const polygon = homeMapCameraVisibility(input({ hfovDeg: 360, walls: [], rangeM: 3 }));
    expect(polygon.every((p) => Math.abs(Math.hypot(p.x - 2, p.y - 5) - 3) < 1e-6)).toBe(true);
    expect(homeMapPolygonArea({ outer: polygon, holes: [] })).toBeGreaterThan(27);
  });

  it('is not blocked by the wall the camera is mounted on', () => {
    const polygon = homeMapCameraVisibility(input({ at: { x: 0, y: 5 }, yawDeg: 0, hfovDeg: 120 }));
    expect(Math.max(...polygon.map((p) => p.x))).toBeCloseTo(10, 6);
    expect(homeMapPolygonArea({ outer: polygon, holes: [] })).toBeGreaterThan(20);
  });
});

describe('camera view', () => {
  const scene = { walls: box(), openings: [] };

  it('extrudes the visibility polygon between the floor and the camera height', () => {
    const view = homeMapCameraView(placement('fixed'), NO_PTZ, scene);
    expect(view?.frustum).toMatchObject({ apex: { x: 2, y: 5, z: 2.2 }, floorM: 0, topM: 2.2 });
    expect(view?.frustum.ring).toEqual(view?.polygon);
    expect(view?.dashed).toBe(false);
  });

  it('draws dashed with the stored direction after a relative move with no feedback', () => {
    const view = homeMapCameraView(placement('presets'), { ...NO_PTZ, moveUncertain: true }, scene);
    expect(view?.dashed).toBe(true);
    expect(view?.direction.yawDeg).toBe(0);
  });

  it('turns to the preset angle once a preset is chosen', () => {
    const view = homeMapCameraView(
      placement('presets'),
      { ...NO_PTZ, preset: 'Position 1' },
      scene,
    );
    expect(view?.dashed).toBe(false);
    expect(view?.direction.yawDeg).toBe(90);
    expect(Math.max(...(view?.polygon ?? []).map((p) => p.y))).toBeCloseTo(10, 6);
  });

  it('has no view without a camera', () => {
    expect(homeMapCameraView(placement('fixed', { camera: null }), NO_PTZ, scene)).toBeNull();
  });
});

describe('opening see-through', () => {
  it('lets sight through openings and windows, and through doors only when open', () => {
    expect(homeMapOpeningSeeThrough('opening', null)).toBe(true);
    expect(homeMapOpeningSeeThrough('window', false)).toBe(true);
    expect(homeMapOpeningSeeThrough('door', null)).toBe(false);
    expect(homeMapOpeningSeeThrough('door', true)).toBe(true);
    expect(homeMapOpeningSeeThrough('garage_door', false)).toBe(false);
  });
});
