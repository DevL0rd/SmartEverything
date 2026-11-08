import { Ray, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../mesh';
import {
  NO_INSETS,
  TOP_FOV_DEG,
  buildCamera,
  type CameraView,
  type OrbitState,
} from '../render-core-orbit';
import type { SceneFrame } from '../vacuum-geometry';
import {
  alongWallHit,
  metresForPixels,
  metresPerPxAt,
  planeAt,
  screenNdc,
  screenRay,
  surfaceHit,
  wallPlaneHit,
  type SurfaceContext,
  type WallLine,
} from './ground';

const FRAME: SceneFrame = { centre: [0, 0, 0], radius: 8 };

const PHONE: CameraView = { width: 400, height: 800, insets: NO_INSETS };

const CHROME: CameraView = { width: 400, height: 800, insets: { top: 64, bottom: 220 } };

const CAMERAS: Readonly<Record<'angled' | 'top' | 'side', OrbitState>> = {
  angled: { azimuth: Math.PI / 5, polar: 0.95, distance: 12, target: [1, 0, -2], top: false },
  top: { azimuth: 0.7, polar: 0, distance: 20, target: [0.5, 0, 0.5], top: true },
  side: { azimuth: 0, polar: 1.35, distance: 10, target: [0, 0, 0], top: false },
};

const SCREEN_POINTS = [
  { x: 0, y: 0 },
  { x: 0.4, y: -0.3 },
  { x: -0.7, y: 0.6 },
  { x: 0.9, y: 0.9 },
];

const WALL: WallLine = { from: { x: -2, y: 3 }, to: { x: 2, y: 3 }, height: 2.5 };

const CONTEXT: SurfaceContext = {
  elevation: 0,
  ceilingHeight: 2.5,
  wall: (wallId) => (wallId === 'north' ? WALL : null),
  tableTop: (objectId) => (objectId === 'desk' ? 0.75 : null),
};

function rayFromTo(origin: Vec3, toward: Vec3): Ray {
  const start = new Vector3(...origin);
  return new Ray(start, new Vector3(...toward).sub(start).normalize());
}

describe('screen rays', () => {
  it.each(['angled', 'top', 'side'] as const)(
    'round trips screen to ground to screen within 1e-6 (%s)',
    (name) => {
      const state = CAMERAS[name];
      for (const view of [PHONE, CHROME]) {
        const camera = buildCamera(state, view, FRAME);
        for (const ndc of SCREEN_POINTS) {
          const hit = planeAt(screenRay(camera, ndc), name === 'side' ? 1 : 0);
          if (hit === null) continue;
          const back = screenNdc(camera, hit.world);
          expect(back?.x).toBeCloseTo(ndc.x, 6);
          expect(back?.y).toBeCloseTo(ndc.y, 6);
        }
      }
    },
  );

  it('hits the ground at the screen centre under the target in Top view with the narrow field of view', () => {
    const state = CAMERAS.top;
    const camera = buildCamera(state, PHONE, FRAME);
    expect(camera.fov).toBe(TOP_FOV_DEG);
    const hit = planeAt(screenRay(camera, { x: 0, y: 0 }), 0);
    expect(hit?.world[0]).toBeCloseTo(0.5, 6);
    expect(hit?.world[2]).toBeCloseTo(0.5, 6);
  });

  it('shifts the target down the screen by the inset difference with chrome insets', () => {
    const state = CAMERAS.angled;
    const camera = buildCamera(state, CHROME, FRAME);
    const target = screenNdc(camera, state.target);
    expect(target?.x).toBeCloseTo(0, 6);
    expect(target?.y).toBeCloseTo((220 - 64) / 800, 6);
  });

  it('returns no screen point for a point behind the camera', () => {
    const state = CAMERAS.angled;
    const camera = buildCamera(state, PHONE, FRAME);
    const behind = camera.position.clone().multiplyScalar(2);
    expect(screenNdc(camera, [behind.x, behind.y, behind.z])).toBeNull();
  });
});

describe('editing surfaces', () => {
  const down = rayFromTo([1, 5, -1], [1, 0, -1]);

  it('puts ground, table and ceiling hits at their heights straight under the pointer', () => {
    const ground = surfaceHit(down, { kind: 'ground' }, CONTEXT);
    const table = surfaceHit(down, { kind: 'table', objectId: 'desk' }, CONTEXT);
    const ceiling = surfaceHit(down, { kind: 'ceiling' }, CONTEXT);
    expect(ground).toMatchObject({ kind: 'flat', height: 0, at: { x: 1, y: 1 } });
    expect(table).toMatchObject({ kind: 'flat', height: 0.75 });
    expect(table?.world[1]).toBeCloseTo(0.75, 9);
    expect(ceiling?.world[1]).toBeCloseTo(2.5, 9);
    expect(ceiling?.distance).toBeLessThan(table?.distance ?? 0);
  });

  it('adds the floor elevation to every flat surface', () => {
    const upper = { ...CONTEXT, elevation: 3 };
    const top = surfaceHit(rayFromTo([0, 9, 0], [0, 0, 0]), { kind: 'ceiling' }, upper);
    expect(top?.world[1]).toBeCloseTo(5.5, 9);
  });

  it('uses the requested surface, never the nearest one, so a ground move in Top view ignores the ceiling', () => {
    const state = CAMERAS.top;
    const camera = buildCamera(state, PHONE, FRAME);
    const ray = screenRay(camera, { x: 0.2, y: -0.1 });
    const hit = surfaceHit(ray, { kind: 'ground' }, CONTEXT);
    expect(hit?.world[1]).toBeCloseTo(0, 9);
    expect(hit?.surface).toEqual({ kind: 'ground' });
  });

  it('gives a wall hit in metres along from its start and up from the floor', () => {
    const ray = rayFromTo([0.5, 1.2, -1], [0.5, 1.2, -3]);
    const hit = surfaceHit(ray, { kind: 'wall', wallId: 'north' }, CONTEXT);
    expect(hit?.kind).toBe('wall');
    if (hit?.kind !== 'wall') return;
    expect(hit.u).toBeCloseTo(2.5, 9);
    expect(hit.v).toBeCloseTo(1.2, 9);
    expect(hit.at.x).toBeCloseTo(0.5, 9);
    expect(hit.at.y).toBeCloseTo(3, 9);
    expect(hit.world[2]).toBeCloseTo(-3, 9);
  });

  it('clamps a wall hit to the segment and its height', () => {
    const ray = rayFromTo([5, 4, -1], [5, 4, -3]);
    const hit = wallPlaneHit(ray, { kind: 'wall', wallId: 'north' }, WALL, 0);
    expect(hit).toMatchObject({ u: 4, v: 2.5, at: { x: 2, y: 3 } });
  });

  it('slides along a wall from straight above, where the wall plane is edge on', () => {
    const above = rayFromTo([1, 9, -3], [1, 0, -3]);
    expect(wallPlaneHit(above, { kind: 'wall', wallId: 'north' }, WALL, 0)).toBeNull();
    const hit = alongWallHit(above, { kind: 'along-wall', wallId: 'north' }, WALL, 0);
    expect(hit?.u).toBeCloseTo(3, 9);
    expect(hit?.v).toBeCloseTo(1.25, 9);
  });

  it('returns null for unknown walls and tables', () => {
    expect(surfaceHit(down, { kind: 'wall', wallId: 'gone' }, CONTEXT)).toBeNull();
    expect(surfaceHit(down, { kind: 'along-wall', wallId: 'gone' }, CONTEXT)).toBeNull();
    expect(surfaceHit(down, { kind: 'table', objectId: 'gone' }, CONTEXT)).toBeNull();
  });

  it('returns null for a ray parallel to the plane', () => {
    const level = rayFromTo([0, 1, 0], [4, 1, 0]);
    expect(planeAt(level, 0)).toBeNull();
    expect(wallPlaneHit(level, { kind: 'wall', wallId: 'north' }, WALL, 0)).toBeNull();
    expect(alongWallHit(level, { kind: 'along-wall', wallId: 'north' }, WALL, 0)).toBeNull();
  });

  it('returns null for a plane behind the camera', () => {
    const up = rayFromTo([0, 1, 0], [0, 2, 0]);
    expect(surfaceHit(up, { kind: 'ground' }, CONTEXT)).toBeNull();
    const away = rayFromTo([0, 1, 0], [0, 1, 4]);
    expect(wallPlaneHit(away, { kind: 'wall', wallId: 'north' }, WALL, 0)).toBeNull();
    expect(alongWallHit(away, { kind: 'along-wall', wallId: 'north' }, WALL, 0)).toBeNull();
  });
});

describe('metres per pixel', () => {
  const state = CAMERAS.angled;
  const camera = buildCamera(state, PHONE, FRAME);
  const position: Vec3 = [camera.position.x, camera.position.y, camera.position.z];

  it('is smaller near the camera than far from it', () => {
    const near = planeAt(screenRay(camera, { x: 0, y: -0.8 }), 0);
    const far = planeAt(screenRay(camera, { x: 0, y: 0.8 }), 0);
    if (near === null || far === null) throw new Error('no ground');
    const nearScale = metresPerPxAt(camera, near.world, PHONE);
    const farScale = metresPerPxAt(camera, far.world, PHONE);
    expect(nearScale).not.toBeNull();
    expect(nearScale ?? Infinity).toBeLessThan(farScale ?? 0);
  });

  it('matches the field of view at the target', () => {
    const expected = (2 * state.distance * Math.tan((camera.fov * Math.PI) / 360)) / PHONE.height;
    expect(metresPerPxAt(camera, state.target, PHONE)).toBeCloseTo(expected, 9);
  });

  it('turns a pixel size into metres there for constant screen size handles', () => {
    const perPixel = metresPerPxAt(camera, state.target, PHONE) ?? 0;
    expect(metresForPixels(camera, state.target, PHONE, 44)).toBeCloseTo(perPixel * 44, 12);
  });

  it('is null behind the camera', () => {
    const behind: Vec3 = [position[0] * 2, position[1] * 2, position[2] * 2];
    expect(metresPerPxAt(camera, behind, PHONE)).toBeNull();
    expect(metresForPixels(camera, behind, PHONE, 10)).toBeNull();
  });
});
