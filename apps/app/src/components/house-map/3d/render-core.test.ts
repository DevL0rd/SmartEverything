import {
  homeMapPointInPolygon,
  type VacuumPoint,
  type VacuumRoom,
  type VacuumScene,
} from '@smarteverything/domain';
import { Vector3 } from 'three';
import { sizeOfBuffer } from './splat/relight';
import { describe, expect, it, vi } from 'vitest';
import { VACUUM_QUALITY_TARGET } from './quality-target';
import { NOMINAL_WALL_HEIGHT_METRES, buildSceneGeometry } from './vacuum-geometry';
import { scrubbedScene, vacuumInput } from './scene-input-fixture';
import {
  CAMERA_PRESET_IDS,
  FIELD_OF_VIEW_DEGREES,
  MAX_PIXEL_RATIO,
  TOP_FOV_DEG,
  buildCamera,
  clampPixelRatio,
  fieldOfView,
  fitDistance,
  orbitDrag,
  orbitPan,
  orbitPosition,
  orbitZoom,
  orbitZoomAt,
  pickRoom,
  pointerToNdc,
  presetOrbit,
  roomOfFace,
} from './render-core';
import { WebglUnavailableError, applyPixelRatio } from './render-core-renderer';
import { TAP_SLOP_PIXELS, GestureTracker, type PanZoom } from './render-core-gestures';
import { meshesForLayers } from './render-core-layers';
import { NO_INSETS, followDistance, followOrbit } from './render-core-orbit';
import { screenRay } from './edit/ground';

const roomHolds = (room: VacuumRoom, point: VacuumPoint): boolean =>
  room.rings.filter((outer) => homeMapPointInPolygon({ outer, holes: [] }, point)).length % 2 === 1;

const scrubbed = scrubbedScene;

const geometry = buildSceneGeometry(vacuumInput(scrubbed));

const viewport = { width: 400, height: 300, insets: NO_INSETS };

const aspect = viewport.width / viewport.height;

function targetsOf(source: typeof geometry): Parameters<typeof pickRoom>[2] {
  return {
    floor: source.base.find((layer) => layer.id === 'floor') ?? null,
    walls: source.base.find((layer) => layer.id === 'walls') ?? null,
    ranges: source.rooms,
  };
}

describe('pixel ratio', () => {
  it('caps the device pixel ratio at two and rejects nonsense', () => {
    expect(clampPixelRatio(3)).toBe(MAX_PIXEL_RATIO);
    expect(clampPixelRatio(1.5)).toBe(1.5);
    expect(clampPixelRatio(0)).toBe(1);
    expect(clampPixelRatio(Number.NaN)).toBe(1);
  });
});

describe('render scale', () => {
  const fakeRenderer = (): Parameters<typeof applyPixelRatio>[0] & {
    setPixelRatio: ReturnType<typeof vi.fn>;
  } => {
    let current = 2;
    return {
      getPixelRatio: () => current,
      setPixelRatio: vi.fn((value: number): void => {
        current = value;
      }),
    };
  };

  it('applies the render scale once to the canvas pixel ratio and restores it', () => {
    const renderer = fakeRenderer();
    expect(applyPixelRatio(renderer, 2, 0.5)).toBe(true);
    expect(renderer.getPixelRatio()).toBe(1);
    expect(applyPixelRatio(renderer, 2, 0.5)).toBe(false);
    expect(renderer.setPixelRatio).toHaveBeenCalledTimes(1);
    expect(applyPixelRatio(renderer, 2, 1)).toBe(true);
    expect(renderer.getPixelRatio()).toBe(2);
  });

  it('sizes the relight buffers from the scaled pixel ratio without scaling again', () => {
    const renderer = fakeRenderer();
    applyPixelRatio(renderer, 2, 0.5);
    expect(sizeOfBuffer(100, 50, renderer.getPixelRatio())).toEqual([100, 50]);
  });
});

describe('camera presets and orbit', () => {
  it('frames the whole scene for every preset', () => {
    for (const id of CAMERA_PRESET_IDS) {
      const orbit = presetOrbit(id, geometry.frame, aspect);
      expect(orbit.distance).toBeCloseTo(
        fitDistance(geometry.frame.radius, aspect, fieldOfView(orbit)),
        6,
      );
      expect(orbit.target).toEqual(geometry.frame.centre);
    }
  });

  it('looks straight down for top, from above and aside for angled', () => {
    const top = orbitPosition(presetOrbit('top', geometry.frame, aspect));
    const angled = orbitPosition(presetOrbit('angled', geometry.frame, aspect));
    const centre = geometry.frame.centre;
    expect(Math.hypot(top[0] - centre[0], top[2] - centre[2])).toBeLessThan(
      geometry.frame.radius * 0.2,
    );
    expect(top[1]).toBeGreaterThan(angled[1]);
    expect(angled[1]).toBeGreaterThan(0);
    expect(Math.hypot(angled[0] - centre[0], angled[2] - centre[2])).toBeGreaterThan(1);
  });

  it('clamps the polar angle so the camera never flips or goes below the floor', () => {
    const start = presetOrbit('angled', geometry.frame, aspect);
    expect(orbitDrag(start, 0, 100_000).polar).toBeGreaterThan(0);
    expect(orbitDrag(start, 0, -100_000).polar).toBeLessThan(Math.PI / 2);
    expect(orbitDrag(start, 100, 0).azimuth).toBeLessThan(start.azimuth);
  });

  it('flags only the top preset as top and gives it the narrow field of view', () => {
    expect(presetOrbit('top', geometry.frame, aspect).top).toBe(true);
    expect(presetOrbit('angled', geometry.frame, aspect).top).toBe(false);
    expect(presetOrbit('side', geometry.frame, aspect).top).toBe(false);
    expect(fieldOfView({ top: true })).toBe(TOP_FOV_DEG);
    expect(fieldOfView({ top: false })).toBe(FIELD_OF_VIEW_DEGREES);
    expect(TOP_FOV_DEG).toBeLessThan(FIELD_OF_VIEW_DEGREES);
    const top = buildCamera(presetOrbit('top', geometry.frame, aspect), viewport, geometry.frame);
    expect(top.fov).toBe(TOP_FOV_DEG);
  });

  it('only turns the view around in top and never tips it', () => {
    const start = presetOrbit('top', geometry.frame, aspect);
    const turned = orbitDrag(start, 120, -300);
    expect(turned.polar).toBe(0);
    expect(turned.top).toBe(true);
    expect(turned.azimuth).toBeCloseTo(start.azimuth - 120 * 0.006, 9);
    expect(orbitDrag(turned, 0, 5000)).toEqual(turned);
  });

  it('does not lock when an angled orbit reaches the lowest tilt', () => {
    const start = presetOrbit('angled', geometry.frame, aspect);
    const flat = orbitDrag(start, 0, 100_000);
    expect(flat.top).toBe(false);
    expect(orbitDrag(flat, 0, -100).polar).toBeGreaterThan(flat.polar);
  });

  it('clamps zoom between a close and a far limit', () => {
    const start = presetOrbit('angled', geometry.frame, aspect);
    const fit = fitDistance(geometry.frame.radius, aspect, FIELD_OF_VIEW_DEGREES);
    expect(orbitZoom(start, 1000, geometry.frame, aspect).distance).toBeCloseTo(fit * 0.35, 6);
    expect(orbitZoom(start, 0.001, geometry.frame, aspect).distance).toBeCloseTo(fit * 3, 6);
    expect(orbitZoom(start, 2, geometry.frame, aspect).distance).toBeCloseTo(start.distance / 2, 6);
  });

  it('follows the robot at room scale, never closer than the zoom limit', () => {
    const fitted = presetOrbit('angled', geometry.frame, aspect);
    const followed = followOrbit(fitted, [1, 0, 2], followDistance(fitted));
    expect(followed.target).toEqual([1, 0, 2]);
    expect(followed.distance).toBeGreaterThan(fitted.distance * 0.5);
    expect(followed.distance).toBeLessThan(fitted.distance);
    expect(followed.distance).toBeGreaterThan(
      fitDistance(geometry.frame.radius, aspect, FIELD_OF_VIEW_DEGREES) * 0.35,
    );
  });

  it('pans along the ground and stays inside the scene', () => {
    const start = presetOrbit('top', geometry.frame, aspect);
    const context = { viewport, frame: geometry.frame };
    const right = orbitPan(start, { dx: -50, dy: 0 }, context);
    expect(right.target[0]).toBeGreaterThan(start.target[0]);
    expect(right.target[1]).toBe(0);
    const far = orbitPan(start, { dx: -1_000_000, dy: 1_000_000 }, context);
    expect(Math.abs(far.target[0] - geometry.frame.centre[0])).toBeLessThanOrEqual(
      geometry.frame.radius + 1e-9,
    );
    expect(Math.abs(far.target[2] - geometry.frame.centre[2])).toBeLessThanOrEqual(
      geometry.frame.radius + 1e-9,
    );
  });

  function groundUnderPointer(
    state: Parameters<typeof buildCamera>[0],
    ndc: { readonly x: number; readonly y: number },
  ): Vector3 {
    const ray = screenRay(buildCamera(state, viewport, geometry.frame), ndc);
    return ray.at(-ray.origin.y / ray.direction.y, new Vector3());
  }

  it.each(['top', 'angled'] as const)(
    'zooms toward the pointer so the ground under it stays put (%s)',
    (preset) => {
      const start = presetOrbit(preset, geometry.frame, aspect);
      const ndc = { x: 0.3, y: -0.2 };
      const context = { view: viewport, frame: geometry.frame };
      const zoomed = orbitZoomAt(start, 1.5, ndc, context);
      expect(zoomed.distance).toBeCloseTo(start.distance / 1.5, 6);
      const before = groundUnderPointer(start, ndc);
      const after = groundUnderPointer(zoomed, ndc);
      expect(after.x).toBeCloseTo(before.x, 6);
      expect(after.z).toBeCloseTo(before.z, 6);
      expect(zoomed.target[1]).toBe(0);
    },
  );

  it('zooms about the target when the pointer looks above the horizon', () => {
    const start = presetOrbit('side', geometry.frame, aspect);
    const zoomed = orbitZoomAt(start, 2, { x: 0, y: 1 }, { view: viewport, frame: geometry.frame });
    expect(zoomed.target).toEqual(start.target);
    expect(zoomed.distance).toBeCloseTo(start.distance / 2, 6);
  });

  it('keeps the zoom target inside the scene however far the pointer looks', () => {
    const start = presetOrbit('side', geometry.frame, aspect);
    const zoomed = orbitZoomAt(
      start,
      1000,
      { x: 1, y: 0.05 },
      { view: viewport, frame: geometry.frame },
    );
    const [centreX, , centreZ] = geometry.frame.centre;
    expect(Math.abs(zoomed.target[0] - centreX)).toBeLessThanOrEqual(geometry.frame.radius + 1e-9);
    expect(Math.abs(zoomed.target[2] - centreZ)).toBeLessThanOrEqual(geometry.frame.radius + 1e-9);
  });

  it('pans and zooms in one pinch step without losing the map', () => {
    const start = presetOrbit('angled', geometry.frame, aspect);
    const panned = orbitPan(start, { dx: 40, dy: -25 }, { viewport, frame: geometry.frame });
    const both = orbitZoomAt(
      panned,
      1.25,
      { x: -0.4, y: 0.1 },
      { view: viewport, frame: geometry.frame },
    );
    expect(both.distance).toBeCloseTo(start.distance / 1.25, 6);
    expect(both.target).not.toEqual(start.target);
    expect(Math.abs(both.target[0] - geometry.frame.centre[0])).toBeLessThanOrEqual(
      geometry.frame.radius,
    );
  });

  it('maps pointer positions to normalised device coordinates', () => {
    const bounds = { left: 10, top: 20, width: 200, height: 100 };
    expect(pointerToNdc({ x: 110, y: 70 }, bounds)).toEqual({ x: 0, y: -0 });
    expect(pointerToNdc({ x: 10, y: 20 }, bounds)).toEqual({ x: -1, y: 1 });
    expect(pointerToNdc({ x: 210, y: 120 }, bounds)).toEqual({ x: 1, y: -1 });
  });
});

describe('room picking', () => {
  it('maps a triangle to the room whose range holds it', () => {
    const [first, second] = geometry.rooms;
    if (first === undefined || second === undefined) throw new Error('fixture needs two rooms');
    expect(roomOfFace(geometry.rooms, first.firstTriangle)).toBe(first.roomId);
    expect(roomOfFace(geometry.rooms, second.firstTriangle)).toBe(second.roomId);
    expect(roomOfFace(geometry.rooms, -1)).toBeNull();
    const last = geometry.rooms[geometry.rooms.length - 1];
    expect(
      roomOfFace(geometry.rooms, (last?.firstTriangle ?? 0) + (last?.triangleCount ?? 0)),
    ).toBeNull();
  });

  it('picks every visible room by tapping its label from the top view', () => {
    const camera = buildCamera(
      presetOrbit('top', geometry.frame, aspect),
      viewport,
      geometry.frame,
    );
    const picked = scrubbed.rooms
      .filter((room) => !room.hidden && roomHolds(room, room.label))
      .map((room) => {
        const point = new Vector3(room.label.x, 0, -room.label.y).project(camera);
        return {
          id: String(room.id),
          found: pickRoom(camera, { x: point.x, y: point.y }, targetsOf(geometry)),
        };
      });
    expect(picked.length).toBeGreaterThan(1);
    for (const entry of picked) expect(entry.found).toBe(entry.id);
  });

  it('returns null when the tap misses the floor', () => {
    const camera = buildCamera(
      presetOrbit('top', geometry.frame, aspect),
      viewport,
      geometry.frame,
    );
    expect(pickRoom(camera, { x: 0.999, y: 0.999 }, targetsOf(geometry))).toBeNull();
    expect(pickRoom(camera, { x: 0, y: 0 }, { floor: null, walls: null, ranges: [] })).toBeNull();
  });

  it('does not pick a room through a wall that hides it', () => {
    const template = scrubbed.rooms[0];
    if (template === undefined) throw new Error('fixture needs a room');
    const room = {
      ...template,
      id: 9,
      hidden: false,
      rings: [
        [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 4, y: 4 },
          { x: 0, y: 4 },
        ],
      ],
    };
    const scene: VacuumScene = {
      ...scrubbed,
      bounds: { minX: 0, minY: 0, maxX: 4, maxY: 4 },
      rooms: [room],
      walls: [{ from: { x: 0, y: 0 }, to: { x: 4, y: 0 }, kind: 'exterior', height: null }],
      carpets: [],
      zones: [],
      dock: null,
      trail: [],
    };
    const built = buildSceneGeometry(vacuumInput(scene));
    const side = buildCamera(presetOrbit('side', built.frame, aspect), viewport, built.frame);
    const top = buildCamera(presetOrbit('top', built.frame, aspect), viewport, built.frame);
    const targets = targetsOf(built);
    const hidden = new Vector3(2, 0, -0.4);
    const wallTop = new Vector3(2, NOMINAL_WALL_HEIGHT_METRES, 0);
    const seenFromTop = hidden.clone().project(top);
    const hiddenFromSide = hidden.clone().project(side);
    const wallFromSide = wallTop.clone().project(side);
    expect(pickRoom(top, { x: seenFromTop.x, y: seenFromTop.y }, targets)).toBe('9');
    expect(pickRoom(side, { x: hiddenFromSide.x, y: hiddenFromSide.y }, targets)).toBeNull();
    expect(pickRoom(side, { x: wallFromSide.x, y: wallFromSide.y }, targets)).toBeNull();
  });
});

describe('scene quality target', () => {
  it('meets the vacuum quality target with one mesh per layer for the whole scene', () => {
    const layers = [...geometry.base, ...geometry.trail, ...geometry.robot];
    const meshes = meshesForLayers(layers);
    expect(meshes).toHaveLength(layers.length);
    expect(meshes.length).toBeLessThanOrEqual(VACUUM_QUALITY_TARGET.drawCalls);
    expect(geometry.stats.triangles).toBeLessThanOrEqual(VACUUM_QUALITY_TARGET.triangles);
  });

  it('converts vertex colours to the linear working space and hatches carpets', () => {
    const meshes = meshesForLayers(geometry.base);
    const carpet = meshes.find((mesh) => mesh.name === 'carpets');
    const floor = meshes.find((mesh) => mesh.name === 'floor');
    expect(carpet?.material.map).not.toBeNull();
    expect(floor?.material.map).toBeNull();
    const source = geometry.base.find((layer) => layer.id === 'floor');
    const linear = floor?.geometry.getAttribute('color').getX(0) ?? -1;
    expect(linear).toBeLessThan(Number(source?.colours[0]));
    expect(linear).toBeGreaterThan(0);
  });

  it('draws translucent layers after opaque ones without writing depth', () => {
    const meshes = meshesForLayers([...geometry.base, ...geometry.trail, ...geometry.robot]);
    for (const mesh of meshes) {
      expect(mesh.material.transparent).toBe(mesh.material.opacity < 1);
      expect(mesh.material.depthWrite).toBe(mesh.material.opacity >= 1);
      expect(mesh.renderOrder).toBe(mesh.material.opacity < 1 ? 1 : 0);
    }
  });
});

describe('gestures', () => {
  function tracker(): {
    readonly instance: GestureTracker;
    readonly orbit: ReturnType<typeof vi.fn>;
    readonly panZoom: ReturnType<typeof vi.fn<(change: PanZoom) => void>>;
    readonly tap: ReturnType<typeof vi.fn>;
    readonly menu: ReturnType<typeof vi.fn>;
  } {
    const orbit = vi.fn();
    const panZoom = vi.fn<(change: PanZoom) => void>();
    const tap = vi.fn();
    const menu = vi.fn();
    return {
      instance: new GestureTracker({ orbit, panZoom, tap, menu }),
      orbit,
      panZoom,
      tap,
      menu,
    };
  }

  it('treats a short press as a tap and never orbits', () => {
    const { instance, orbit, tap } = tracker();
    instance.down({ id: 1, x: 10, y: 10, button: 0, mouse: false, shift: false, alt: false });
    instance.move({ id: 1, x: 12, y: 11, button: 0, mouse: false, shift: false, alt: false });
    instance.up({ id: 1, x: 12, y: 11, button: 0, mouse: false, shift: false, alt: false });
    expect(tap).toHaveBeenCalledExactlyOnceWith(12, 11);
    expect(orbit).not.toHaveBeenCalled();
  });

  it('orbits after the slop and does not tap on release', () => {
    const { instance, orbit, tap } = tracker();
    instance.down({ id: 1, x: 0, y: 0, button: 0, mouse: false, shift: false, alt: false });
    instance.move({
      id: 1,
      x: TAP_SLOP_PIXELS + 4,
      y: 0,
      button: 0,
      mouse: false,
      shift: false,
      alt: false,
    });
    instance.move({
      id: 1,
      x: TAP_SLOP_PIXELS + 14,
      y: 3,
      button: 0,
      mouse: false,
      shift: false,
      alt: false,
    });
    instance.up({
      id: 1,
      x: TAP_SLOP_PIXELS + 14,
      y: 3,
      button: 0,
      mouse: false,
      shift: false,
      alt: false,
    });
    expect(orbit).toHaveBeenLastCalledWith(10, 3);
    expect(tap).not.toHaveBeenCalled();
  });

  it('pinches and pans with two pointers and never taps afterwards', () => {
    const { instance, panZoom, tap, orbit } = tracker();
    instance.down({ id: 1, x: 100, y: 100, button: 0, mouse: false, shift: false, alt: false });
    instance.down({ id: 2, x: 200, y: 100, button: 0, mouse: false, shift: false, alt: false });
    instance.move({ id: 2, x: 300, y: 100, button: 0, mouse: false, shift: false, alt: false });
    expect(panZoom).toHaveBeenLastCalledWith({
      dx: 50,
      dy: 0,
      factor: 2,
      centre: { x: 200, y: 100 },
    });
    instance.up({ id: 2, x: 300, y: 100, button: 0, mouse: false, shift: false, alt: false });
    instance.up({ id: 1, x: 100, y: 100, button: 0, mouse: false, shift: false, alt: false });
    expect(tap).not.toHaveBeenCalled();
    expect(orbit).not.toHaveBeenCalled();
  });

  it.each([0, 1])('pans with mouse button %i and never taps after a drag', (button) => {
    const { instance, panZoom, orbit, tap } = tracker();
    instance.down({ id: 1, x: 0, y: 0, button, mouse: true, shift: false, alt: false });
    instance.move({
      id: 1,
      x: TAP_SLOP_PIXELS + 4,
      y: 0,
      button: -1,
      mouse: true,
      shift: false,
      alt: false,
    });
    instance.move({
      id: 1,
      x: TAP_SLOP_PIXELS + 10,
      y: 5,
      button: -1,
      mouse: true,
      shift: false,
      alt: false,
    });
    instance.up({
      id: 1,
      x: TAP_SLOP_PIXELS + 10,
      y: 5,
      button,
      mouse: true,
      shift: false,
      alt: false,
    });
    expect(panZoom).toHaveBeenLastCalledWith({
      dx: 6,
      dy: 5,
      factor: 1,
      centre: { x: TAP_SLOP_PIXELS + 10, y: 5 },
    });
    expect(orbit).not.toHaveBeenCalled();
    expect(tap).not.toHaveBeenCalled();
  });

  it('orbits with the right mouse button', () => {
    const { instance, panZoom, orbit } = tracker();
    instance.down({ id: 1, x: 0, y: 0, button: 2, mouse: true, shift: false, alt: false });
    instance.move({
      id: 1,
      x: TAP_SLOP_PIXELS + 4,
      y: 0,
      button: -1,
      mouse: true,
      shift: false,
      alt: false,
    });
    instance.move({
      id: 1,
      x: TAP_SLOP_PIXELS + 14,
      y: 3,
      button: -1,
      mouse: true,
      shift: false,
      alt: false,
    });
    expect(orbit).toHaveBeenLastCalledWith(10, 3);
    expect(panZoom).not.toHaveBeenCalled();
  });

  it('picks on a left click and presses the menu on a right click', () => {
    const { instance, panZoom, tap, menu } = tracker();
    instance.down({ id: 1, x: 5, y: 5, button: 2, mouse: true, shift: false, alt: false });
    instance.move({ id: 1, x: 8, y: 6, button: -1, mouse: true, shift: false, alt: false });
    instance.up({ id: 1, x: 8, y: 6, button: 2, mouse: true, shift: false, alt: false });
    expect(tap).not.toHaveBeenCalled();
    expect(menu).toHaveBeenCalledExactlyOnceWith(8, 6);
    instance.down({ id: 2, x: 7, y: 7, button: 0, mouse: true, shift: false, alt: false });
    instance.up({ id: 2, x: 7, y: 7, button: 0, mouse: true, shift: false, alt: false });
    expect(tap).toHaveBeenCalledExactlyOnceWith(7, 7);
    expect(menu).toHaveBeenCalledOnce();
    expect(panZoom).not.toHaveBeenCalled();
  });

  it('orbits on a right drag past the slop without a menu press', () => {
    const { instance, orbit, menu, tap } = tracker();
    instance.down({ id: 1, x: 0, y: 0, button: 2, mouse: true, shift: false, alt: false });
    instance.move({
      id: 1,
      x: TAP_SLOP_PIXELS + 4,
      y: 0,
      button: -1,
      mouse: true,
      shift: false,
      alt: false,
    });
    instance.up({
      id: 1,
      x: TAP_SLOP_PIXELS + 4,
      y: 0,
      button: 2,
      mouse: true,
      shift: false,
      alt: false,
    });
    expect(orbit).toHaveBeenCalled();
    expect(menu).not.toHaveBeenCalled();
    expect(tap).not.toHaveBeenCalled();
  });

  it('neither taps nor presses the menu on a middle click', () => {
    const { instance, menu, tap } = tracker();
    instance.down({ id: 1, x: 3, y: 3, button: 1, mouse: true, shift: false, alt: false });
    instance.up({ id: 1, x: 3, y: 3, button: 1, mouse: true, shift: false, alt: false });
    expect(menu).not.toHaveBeenCalled();
    expect(tap).not.toHaveBeenCalled();
  });

  it('pans and pinches at once when both fingers move', () => {
    const { instance, panZoom } = tracker();
    instance.down({ id: 1, x: 100, y: 100, button: 0, mouse: false, shift: false, alt: false });
    instance.down({ id: 2, x: 200, y: 100, button: 0, mouse: false, shift: false, alt: false });
    instance.move({ id: 1, x: 80, y: 120, button: -1, mouse: false, shift: false, alt: false });
    const change = panZoom.mock.lastCall?.[0];
    expect(change?.dx).toBeCloseTo(-10);
    expect(change?.dy).toBeCloseTo(10);
    expect(change?.factor).toBeCloseTo(Math.hypot(120, 20) / 100);
    expect(change?.centre).toEqual({ x: 140, y: 110 });
  });

  it('starts a clean gesture after all pointers lift or one is cancelled', () => {
    const { instance, tap } = tracker();
    instance.down({ id: 1, x: 0, y: 0, button: 0, mouse: false, shift: false, alt: false });
    instance.down({ id: 2, x: 50, y: 0, button: 0, mouse: false, shift: false, alt: false });
    instance.cancel({ id: 2, x: 50, y: 0, button: 0, mouse: false, shift: false, alt: false });
    instance.up({ id: 1, x: 0, y: 0, button: 0, mouse: false, shift: false, alt: false });
    instance.down({ id: 3, x: 5, y: 5, button: 0, mouse: false, shift: false, alt: false });
    instance.up({ id: 3, x: 5, y: 5, button: 0, mouse: false, shift: false, alt: false });
    expect(tap).toHaveBeenCalledExactlyOnceWith(5, 5);
  });
});

describe('module load', () => {
  it('exposes a named error for devices without WebGL', () => {
    const error = new WebglUnavailableError(new Error('no context'));
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('WebglUnavailableError');
  });
});
