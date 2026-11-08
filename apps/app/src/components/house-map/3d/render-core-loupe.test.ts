import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  FingerTracker,
  LOUPE_PX,
  LOUPE_SIDE_GAP_PX,
  LOUPE_TOP_GAP_PX,
  LOUPE_ZOOM,
  aimLens,
  loupeOf,
  type TouchEventType,
  type TouchSample,
  type TouchSurface,
} from './render-core-loupe';
import { NO_INSETS, buildCamera, presetOrbit, type CameraView } from './render-core-orbit';
import type { SceneFrame } from './vacuum-geometry';

const FRAME: SceneFrame = { centre: [0, 0, 0], radius: 8 };

const PHONE: CameraView = { width: 390, height: 844, insets: { top: 64, bottom: 300 } };

const LOWER_LEFT = { x: 80, y: 600 };

const RIGHT = { x: 300, y: 200 };

function screenOf(point: Vector3, camera: PerspectiveCamera, view: CameraView): Vector3 {
  const ndc = point.clone().project(camera);
  return new Vector3(((ndc.x + 1) / 2) * view.width, ((1 - ndc.y) / 2) * view.height, 0);
}

function groundAt(
  screen: { readonly x: number; readonly y: number },
  camera: PerspectiveCamera,
): Vector3 {
  const ndc = new Vector3((screen.x / PHONE.width) * 2 - 1, 1 - (screen.y / PHONE.height) * 2, 0.5);
  const far = ndc.unproject(camera);
  const direction = far.sub(camera.position).normalize();
  const along = -camera.position.y / direction.y;
  return camera.position.clone().addScaledVector(direction, along);
}

class FakeSurface implements TouchSurface {
  readonly listeners = new Map<TouchEventType, (event: TouchSample) => void>();

  addEventListener(type: TouchEventType, listener: (event: TouchSample) => void): void {
    this.listeners.set(type, listener);
  }

  removeEventListener(type: TouchEventType): void {
    this.listeners.delete(type);
  }

  getBoundingClientRect(): { readonly left: number; readonly top: number } {
    return { left: 10, top: 20 };
  }

  fire(type: TouchEventType, sample: Omit<TouchSample, 'type'>): void {
    this.listeners.get(type)?.({ type, ...sample });
  }
}

describe('loupe placement', () => {
  const base = { grabbing: true, breakpoint: 'phone' as const, view: PHONE };

  it('sits in the top right under the chrome when the finger is in the lower left', () => {
    expect(loupeOf({ ...base, finger: LOWER_LEFT })).toEqual({
      left: PHONE.width - LOUPE_SIDE_GAP_PX - LOUPE_PX,
      top: PHONE.insets.top + LOUPE_TOP_GAP_PX,
      size: 128,
      focus: LOWER_LEFT,
    });
  });

  it('moves to the top left when the finger is on the right', () => {
    expect(loupeOf({ ...base, finger: RIGHT })).toMatchObject({ left: LOUPE_SIDE_GAP_PX });
  });

  it('shows only while a phone drag holds a finger', () => {
    expect(loupeOf({ ...base, grabbing: false, finger: LOWER_LEFT })).toBeNull();
    expect(loupeOf({ ...base, breakpoint: 'tablet', finger: LOWER_LEFT })).toBeNull();
    expect(loupeOf({ ...base, breakpoint: 'desktop', finger: LOWER_LEFT })).toBeNull();
    expect(loupeOf({ ...base, finger: null })).toBeNull();
  });

  it('ignores chrome insets that cover the whole view', () => {
    const covered = { ...PHONE, insets: { top: 500, bottom: 400 } };
    expect(loupeOf({ ...base, view: covered, finger: LOWER_LEFT })?.top).toBe(LOUPE_TOP_GAP_PX);
  });
});

describe('loupe lens', () => {
  for (const preset of ['top', 'angled'] as const) {
    it(`magnifies the point under the finger ${String(LOUPE_ZOOM)} times in ${preset}`, () => {
      const orbit = presetOrbit(preset, FRAME, PHONE.width / PHONE.height);
      const camera = buildCamera(orbit, PHONE, FRAME);
      const lens = new PerspectiveCamera();
      const finger = { x: 150, y: 420 };
      aimLens(lens, camera, finger, PHONE);
      lens.updateMatrixWorld(true);
      const under = groundAt(finger, camera);
      const centre = under.clone().project(lens);
      expect(centre.x).toBeCloseTo(0, 6);
      expect(centre.y).toBeCloseTo(0, 6);
      const aside = groundAt({ x: finger.x + 10, y: finger.y }, camera);
      const shifted = aside.clone().project(lens);
      expect((shifted.x * LOUPE_PX) / 2).toBeCloseTo(10 * LOUPE_ZOOM, 4);
      expect(screenOf(under, camera, PHONE).x).toBeCloseTo(finger.x, 4);
    });
  }

  it('keeps the main camera untouched', () => {
    const camera = buildCamera(
      presetOrbit('top', FRAME, 1),
      { ...PHONE, insets: NO_INSETS },
      FRAME,
    );
    const before = camera.projectionMatrix.clone();
    aimLens(new PerspectiveCamera(), camera, LOWER_LEFT, PHONE);
    expect(camera.projectionMatrix.equals(before)).toBe(true);
    expect(camera.view).toBeNull();
  });
});

describe('finger tracker', () => {
  it('follows the first touch in canvas pixels and asks for a frame as it moves', () => {
    const surface = new FakeSurface();
    const moved = vi.fn();
    const tracker = new FingerTracker(surface, moved);
    const unbind = tracker.bind();
    surface.fire('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 60, clientY: 90 });
    expect(tracker.finger).toEqual({ x: 50, y: 70 });
    surface.fire('pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 300, clientY: 90 });
    surface.fire('pointermove', { pointerId: 1, pointerType: 'touch', clientX: 70, clientY: 95 });
    expect(tracker.finger).toEqual({ x: 60, y: 75 });
    expect(moved).toHaveBeenCalledTimes(1);
    surface.fire('pointerup', { pointerId: 1, pointerType: 'touch', clientX: 70, clientY: 95 });
    expect(tracker.finger).toEqual({ x: 290, y: 70 });
    surface.fire('pointercancel', { pointerId: 2, pointerType: 'touch', clientX: 0, clientY: 0 });
    expect(tracker.finger).toBeNull();
    unbind();
    expect(surface.listeners.size).toBe(0);
  });

  it('ignores the mouse and moves of a pointer it never saw go down', () => {
    const surface = new FakeSurface();
    const moved = vi.fn();
    const tracker = new FingerTracker(surface, moved);
    tracker.bind();
    surface.fire('pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: 60, clientY: 90 });
    surface.fire('pointermove', { pointerId: 3, pointerType: 'touch', clientX: 60, clientY: 90 });
    expect(tracker.finger).toBeNull();
    expect(moved).not.toHaveBeenCalled();
  });
});
