import { describe, expect, it, vi } from 'vitest';
import type { Vec3 } from './mesh';
import { CameraRig } from './render-core-camera';
import { fitToCorners } from './render-core-fit';
import { presetOrbit } from './render-core-orbit';
import type { SceneFrame } from './vacuum-geometry';

const FRAME: SceneFrame = { centre: [5, 0, -3], radius: 8 };
const EXTENT: readonly Vec3[] = [
  [0, 0, 0],
  [10, 0, 0],
  [0, 3, -6],
  [10, 3, -6],
];
const UPDATED_FRAME: SceneFrame = { centre: [6, 0, -4], radius: 10 };
const UPDATED_EXTENT: readonly Vec3[] = [...EXTENT, [12, 4, -8]];
const ROOM_FRAME: SceneFrame = { centre: [2, 0, -2], radius: 2 };
const ROOM_EXTENT: readonly Vec3[] = [
  [1, 0, -1],
  [3, 3, -3],
];

function rig(): CameraRig {
  const canvas: Pick<HTMLCanvasElement, 'getBoundingClientRect'> = {
    getBoundingClientRect: () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 412,
      bottom: 800,
      width: 412,
      height: 800,
      toJSON: (): string => '{}',
    }),
  };
  const camera = new CameraRig('angled', canvas, vi.fn());
  camera.resize(412, 800);
  camera.setScene(FRAME, EXTENT);
  return camera;
}

const MOVEMENTS: readonly {
  readonly name: string;
  readonly move: (camera: CameraRig) => void;
}[] = [
  {
    name: 'rotation',
    move: (camera): void => {
      camera.drag(40, 20);
    },
  },
  {
    name: 'pan and pinch',
    move: (camera): void => {
      camera.panZoom({ dx: 15, dy: 10, factor: 1.2, centre: { x: 206, y: 400 } });
    },
  },
  {
    name: 'wheel zoom',
    move: (camera): void => {
      camera.wheel(-100, { x: 206, y: 400 });
    },
  },
  {
    name: 'edit framing',
    move: (camera): void => {
      camera.steer({ kind: 'shift', by: [2, 1] });
    },
  },
];

describe('camera scene updates', () => {
  it('fits the initial 3D angle and keeps fitting geometry until the user moves', () => {
    const camera = rig();
    expect(camera.state).toEqual(
      fitToCorners(presetOrbit('angled', FRAME, 412 / 800), EXTENT, camera.viewport, FRAME),
    );
    const initial = camera.state;
    camera.setScene(UPDATED_FRAME, UPDATED_EXTENT);
    expect(camera.state).not.toEqual(initial);
    const expected = rig();
    expected.setScene(UPDATED_FRAME, UPDATED_EXTENT);
    expect(camera.state).toEqual(expected.state);
    expect(camera.state.azimuth).toBe(presetOrbit('angled', FRAME, 1).azimuth);
    expect(camera.state.polar).toBe(presetOrbit('angled', FRAME, 1).polar);
  });

  it.each(MOVEMENTS)('preserves $name through unchanged and changed geometry', ({ move }) => {
    const camera = rig();
    const initial = camera.state;
    move(camera);
    const moved = camera.state;
    expect(moved).not.toEqual(initial);
    camera.setScene(FRAME, EXTENT);
    expect(camera.state).toEqual(moved);
    camera.setScene(UPDATED_FRAME, UPDATED_EXTENT);
    expect(camera.state).toEqual(moved);
    camera.resize(800, 412);
    camera.setInsets({ top: 64, bottom: 120 });
    expect(camera.state).toEqual(moved);
  });

  it('keeps the followed robot and user angle during geometry refreshes', () => {
    const camera = rig();
    camera.setFollow(true, [2, 0, -1]);
    camera.drag(30, 10);
    const following = camera.state;
    camera.setScene(UPDATED_FRAME, UPDATED_EXTENT);
    expect(camera.state).toEqual(following);
    camera.trackRobot([3, 0, -2], true);
    expect(camera.state).toEqual({ ...following, target: [3, 0, -2] });
  });

  it('preserves following even before the user has rotated', () => {
    const camera = rig();
    camera.setFollow(true, [2, 0, -1]);
    const following = camera.state;
    camera.setScene(UPDATED_FRAME, UPDATED_EXTENT);
    expect(camera.state).toEqual(following);
  });

  it('fits the latest geometry when Fit or a preset is explicitly requested', () => {
    const camera = rig();
    camera.drag(40, 20);
    camera.setScene(UPDATED_FRAME, UPDATED_EXTENT);
    camera.setPreset('angled');
    const expected = rig();
    expected.setScene(UPDATED_FRAME, UPDATED_EXTENT);
    expect(camera.state).toEqual(expected.state);
    camera.setPreset('top');
    expect(camera.state.top).toBe(true);
    camera.setPreset('angled');
    expect(camera.state).toEqual(expected.state);
  });

  it('frames a requested room after user motion and keeps auto-fitting that room', () => {
    const camera = rig();
    camera.drag(40, 20);
    camera.setScene(ROOM_FRAME, ROOM_EXTENT, true);
    const expected = rig();
    expected.setScene(ROOM_FRAME, ROOM_EXTENT);
    expect(camera.state).toEqual(expected.state);
    camera.resize(800, 412);
    expected.resize(800, 412);
    expect(camera.state).toEqual(expected.state);
  });
});
