import { describe, expect, it } from 'vitest';
import {
  HOME_MAP_CAMERA_FOV_DEFAULT,
  HOME_MAP_PLACEMENT_WRITE,
  homeMapCameraDirection,
  type HomeMapPtzState,
} from '@smarteverything/domain';
import { CAMERA_DIRECTION_UNKNOWN_TEXT } from '../../../components/house-map/overlays/model-types';
import {
  ESTIMATED_FOV_TEXT,
  cameraDirectionNote,
  cameraPanOptions,
  cameraPtzOf,
  cameraPresetRows,
  conePreview,
  estimatedFovNote,
  posedCamera,
  wedgePath,
  withCurrentForPreset,
  withFacing,
  withFov,
  withPanMode,
  type CameraPlacement,
} from './camera-pose';

const DEVICE = '3f2b8f9a-6d3c-4d6e-8d4e-0a1b2c3d4e5f';
const MODEL = 'xiaomi.camera.083ae2';
const STILL: HomeMapPtzState = { preset: null, live: null, moveUncertain: false };

const placement = (pan: Partial<CameraPlacement['camera']['pan']> = {}): CameraPlacement => {
  const parsed = HOME_MAP_PLACEMENT_WRITE.parse({
    deviceId: DEVICE,
    floorId: 'ground',
    at: { x: 1, y: 1 },
    rotation: 90,
    height: 2.2,
    tilt: 20,
    mount: 'wall',
    auto: false,
    camera: {
      ...HOME_MAP_CAMERA_FOV_DEFAULT,
      fovSource: 'estimated',
      pan: { mode: 'fixed', yawDeg: 90, presets: {}, ...pan },
      showCone: true,
    },
  });
  return posedCamera(parsed, MODEL);
};

describe('camera pose pan modes', () => {
  it('offers only fixed for a camera without saved positions and never live for known models', () => {
    expect(cameraPanOptions('xiaomi.camera.083ae2', []).map((o) => o.value)).toEqual(['fixed']);
    expect(cameraPanOptions('xiaomi.camera.083ae2', ['Door']).map((o) => o.value)).toEqual([
      'fixed',
      'presets',
    ]);
  });

  it('switches the mode and keeps the stored angles', () => {
    const base = placement({ presets: { Door: { yawDeg: 10, tiltDeg: 5 } } });
    const next = withPanMode(base.camera, 'presets');
    expect(next.pan.mode).toBe('presets');
    expect(next.pan.presets).toEqual(base.camera.pan.presets);
  });

  it('keeps a stored camera and gives a camera without one estimated defaults facing its rotation', () => {
    const stored = placement({ yawDeg: 30 });
    expect(posedCamera(stored, MODEL).camera).toBe(stored.camera);
    const fresh = posedCamera({ ...stored, camera: null, rotation: 135 }, MODEL).camera;
    expect(fresh).toMatchObject({ ...HOME_MAP_CAMERA_FOV_DEFAULT, fovSource: 'estimated' });
    expect(fresh.pan).toEqual({ mode: 'fixed', yawDeg: 135, presets: {} });
  });

  it('reads the current preset from the device value', () => {
    expect(cameraPtzOf('Door')).toEqual({ ...STILL, preset: 'Door' });
    expect(cameraPtzOf(null)).toEqual(STILL);
    expect(cameraPtzOf(3)).toEqual(STILL);
  });
});

describe('use the current direction for this preset', () => {
  it('stores the facing and tilt being set under the preset value', () => {
    const base = placement({ mode: 'presets', yawDeg: 135 });
    const camera = withCurrentForPreset(base, 'Door');
    expect(camera.pan.presets).toEqual({ Door: { yawDeg: 135, tiltDeg: 20 } });
    const shown = homeMapCameraDirection({ ...base, camera }, { ...STILL, preset: 'Door' });
    expect(shown).toEqual({ yawDeg: 135, tiltDeg: 20, known: true });
  });

  it('overwrites only that preset', () => {
    const base = placement({ mode: 'presets', presets: { Desk: { yawDeg: 1, tiltDeg: 2 } } });
    const camera = withCurrentForPreset({ ...base, camera: withFacing(base.camera, 40) }, 'Door');
    expect(camera.pan.presets).toEqual({
      Desk: { yawDeg: 1, tiltDeg: 2 },
      Door: { yawDeg: 40, tiltDeg: 20 },
    });
  });

  it('lists every preset with the current one and what is stored', () => {
    const base = placement({ mode: 'presets', presets: { Door: { yawDeg: 10, tiltDeg: 5 } } });
    const rows = cameraPresetRows(base.camera, ['Door', 'Desk'], { ...STILL, preset: 'Desk' });
    expect(rows).toEqual([
      { value: 'Door', current: false, stored: { yawDeg: 10, tiltDeg: 5 } },
      { value: 'Desk', current: true, stored: null },
    ]);
  });
});

describe('direction notes', () => {
  it('says the direction is unknown after a relative move and draws dashed', () => {
    const base = placement();
    const moved = { ...STILL, moveUncertain: true };
    expect(cameraDirectionNote(base, moved)).toBe(CAMERA_DIRECTION_UNKNOWN_TEXT);
    const direction = homeMapCameraDirection(base, moved);
    if (direction === null) throw new Error('direction expected');
    expect(conePreview(base.camera, direction).dashed).toBe(true);
    expect(cameraDirectionNote(base, STILL)).toBeNull();
  });

  it('names a current preset that has no saved direction', () => {
    const base = placement({ mode: 'presets' });
    expect(cameraDirectionNote(base, { ...STILL, preset: 'Door' })).toBe(
      'No direction saved for Door',
    );
    expect(cameraDirectionNote(base, STILL)).toBe(CAMERA_DIRECTION_UNKNOWN_TEXT);
  });
});

describe('field of view', () => {
  it('marks the estimated view angle and clears it once the user sets one', () => {
    const base = placement();
    expect(estimatedFovNote(base.camera)).toBe(ESTIMATED_FOV_TEXT);
    const set = withFov(base.camera, 'hfovDeg', 110);
    expect(set.hfovDeg).toBe(110);
    expect(set.fovSource).toBe('exact');
    expect(estimatedFovNote(set)).toBeNull();
  });
});

describe('cone preview', () => {
  const centre = { cx: 0, cy: 0, r: 10 };

  it('opens the wedge around the facing with the house y axis up', () => {
    expect(wedgePath(centre, 90, 90)).toBe('M 0 0 L 7.07 -7.07 A 10 10 0 0 0 -7.07 -7.07 Z');
  });

  it('uses the large arc past 180 degrees and a full disc at 360', () => {
    expect(wedgePath(centre, 0, 270)).toContain('A 10 10 0 1 0');
    expect(wedgePath(centre, 0, 360)).toBe('M -10 0 A 10 10 0 1 0 10 0 A 10 10 0 1 0 -10 0 Z');
  });

  it('speaks the view', () => {
    const base = placement();
    const preview = conePreview(base.camera, { yawDeg: 90, tiltDeg: 20, known: true });
    expect(preview.dashed).toBe(false);
    expect(preview.spoken).toBe(
      'Camera view: facing 90 degrees, 100 degrees wide, tilted down 20 degrees',
    );
  });
});
