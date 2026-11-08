import { describe, expect, it, vi } from 'vitest';
import {
  HOME_MAP_CAMERA_FOV_DEFAULT,
  type HomeMapFloor,
  type HomeMapPlacement,
} from '@smarteverything/domain';
import {
  EDIT_OVERLAY,
  NO_EDIT_OVERLAY,
  type EditEvent,
  type EditOverlay,
} from '../../../../components/house-map/3d/map-3d-edit-protocol';
import {
  coneEdit,
  coneMarks,
  coneOps,
  coneTip,
  coneWedge,
  selectedCamera,
  tiltSpot,
  tiltText,
  turnText,
  withCone,
  type PosedCamera,
} from './camera-pose';
import { wallFloor } from './wall-fixture';

const CAMERA = '3e1b4f4b-4a5d-4f6e-9d20-4b5c6d7e8f90';
const LAMP = '00000000-0000-4000-8000-0000000000a9';

function camera(extra: Partial<Omit<HomeMapPlacement, 'camera'>> = {}): PosedCamera {
  return {
    ...{ deviceId: CAMERA, floorId: wallFloor().id, at: { x: 2, y: 4 }, rotation: 0 },
    ...{ height: 2, tilt: 30, mount: 'wall', auto: false },
    camera: {
      ...HOME_MAP_CAMERA_FOV_DEFAULT,
      fovSource: 'exact',
      pan: { mode: 'fixed', yawDeg: 0, presets: {} },
      showCone: true,
    },
    ...extra,
  };
}

function lamp(): HomeMapPlacement {
  return { ...camera(), deviceId: LAMP, camera: null };
}

function floorWith(...placements: HomeMapPlacement[]): HomeMapFloor {
  return { ...wallFloor(), placements };
}

const SELECT: EditOverlay = { ...NO_EDIT_OVERLAY, mode: 'select', selection: [CAMERA] };

function coneEvent(seq: number): EditEvent {
  return { type: 'cone', seq, deviceId: CAMERA, yaw: 45, pitch: 20 };
}

describe('the camera cone on the floor', () => {
  it('puts the turn knob at the tip and the tilt diamond where the view meets the floor', () => {
    const marks = coneMarks(camera());
    const [yaw, pitch] = marks.handles;
    expect(yaw).toMatchObject({ kind: 'cone-yaw', at: { x: 10, y: 4, height: 0 } });
    expect(yaw?.target).toStrictEqual({ kind: 'cone', deviceId: CAMERA });
    expect(pitch?.kind).toBe('cone-pitch');
    expect(pitch?.at.x).toBeCloseTo(2 + 2 / Math.tan(Math.PI / 6), 9);
    expect(pitch?.at.y).toBeCloseTo(4, 9);
    expect(marks.labels.map((label) => label.text)).toStrictEqual(['Turn 0°', 'Tilt 30°']);
  });

  it('turns the tip with the stored view direction', () => {
    const turned = camera();
    const tip = coneTip({
      ...turned,
      camera: { ...turned.camera, pan: { ...turned.camera.pan, yawDeg: 90 } },
    });
    expect(tip.x).toBeCloseTo(2, 9);
    expect(tip.y).toBeCloseTo(12, 9);
  });

  it.each([
    ['looking up', -10],
    ['level', 0],
    ['meeting the floor past the reach', 5],
  ])('keeps the tilt diamond halfway along the centre line when %s', (_, tilt) => {
    const spot = tiltSpot(camera({ tilt }));
    expect(spot.x).toBeCloseTo(6, 9);
    expect(spot.y).toBeCloseTo(4, 9);
  });

  it('draws a wedge from the camera across the field of view at the reach', () => {
    const wedge = coneWedge(camera());
    expect(wedge[0]).toStrictEqual({ x: 2, y: 4 });
    const arc = wedge.slice(1);
    for (const point of arc) expect(Math.hypot(point.x - 2, point.y - 4)).toBeCloseTo(8, 9);
    const first = arc[0];
    const last = arc.at(-1);
    expect(Math.atan2((first?.y ?? 0) - 4, (first?.x ?? 0) - 2)).toBeCloseTo(
      -50 * (Math.PI / 180),
      9,
    );
    expect(Math.atan2((last?.y ?? 0) - 4, (last?.x ?? 0) - 2)).toBeCloseTo(50 * (Math.PI / 180), 9);
  });

  it('draws a full ring without the apex for a camera that sees all around', () => {
    const round = camera();
    const wedge = coneWedge({ ...round, camera: { ...round.camera, hfovDeg: 360 } });
    for (const point of wedge) expect(Math.hypot(point.x - 2, point.y - 4)).toBeCloseTo(8, 9);
  });

  it('drops a line from the camera to the floor for the angled view', () => {
    const drop = coneMarks(camera()).ghosts.at(-1);
    expect(drop).toStrictEqual({
      shape: 'polyline',
      points: [
        { x: 2, y: 4, height: 2 },
        { x: 2, y: 4, height: 0 },
      ],
      tone: 'neutral',
    });
  });

  it('writes the live labels with a real minus sign and a whole turn', () => {
    expect(tiltText(-25)).toBe('Tilt −25°');
    expect(tiltText(12.4)).toBe('Tilt 12°');
    expect(turnText(405)).toBe('Turn 45°');
    expect(turnText(-90)).toBe('Turn 270°');
  });
});

describe('adding the cone to the devices overlay', () => {
  it('adds the cone to a selected camera and keeps a valid overlay', () => {
    const floor = floorWith(lamp(), camera());
    const overlay = withCone(SELECT, selectedCamera(floor, CAMERA));
    expect(overlay.handles.map((handle) => handle.kind)).toStrictEqual(['cone-yaw', 'cone-pitch']);
    expect(overlay.ghosts.map((ghost) => ghost.shape)).toStrictEqual([
      'polygon',
      'polyline',
      'polyline',
    ]);
    expect(overlay.ghosts[0]?.tone).toBe('accent');
    expect(EDIT_OVERLAY.safeParse(overlay).success).toBe(true);
  });

  it('shows no cone for a device without a camera, nothing selected or while placing', () => {
    const floor = floorWith(lamp(), camera());
    expect(selectedCamera(floor, LAMP)).toBeNull();
    expect(selectedCamera(floor, null)).toBeNull();
    expect(selectedCamera(null, CAMERA)).toBeNull();
    const place: EditOverlay = {
      ...NO_EDIT_OVERLAY,
      mode: 'place',
      place: { kind: 'device', mount: 'wall', height: 2 },
    };
    expect(withCone(place, selectedCamera(floor, CAMERA))).toBe(place);
    expect(withCone(SELECT, null)).toBe(SELECT);
  });
});

describe('saving a cone drag', () => {
  it('writes the yaw into the camera pan and the pitch into the tilt', () => {
    const floor = floorWith(camera());
    const ops = coneOps(floor, { type: 'cone', seq: 1, deviceId: CAMERA, yaw: 45, pitch: 20 });
    expect(ops).toStrictEqual([
      {
        op: 'update',
        kind: 'placement',
        floorId: floor.id,
        id: CAMERA,
        patch: {
          tilt: 20,
          camera: { ...camera().camera, pan: { mode: 'fixed', yawDeg: 45, presets: {} } },
          auto: false,
        },
      },
    ]);
  });

  it('writes nothing for a device that has no camera on this floor', () => {
    const event = { type: 'cone', seq: 1, deviceId: CAMERA, yaw: 45, pitch: 20 } as const;
    expect(coneOps(floorWith(lamp()), event)).toStrictEqual([]);
  });

  it('commits the cone with its sequence and hands every other event to the tool', () => {
    const tool = { floor: floorWith(camera()), readOnly: false, onEdit: vi.fn() };
    const commit = vi.fn();
    const edit = coneEdit(tool, commit);
    edit(coneEvent(7));
    expect(commit).toHaveBeenCalledWith(
      7,
      coneOps(tool.floor, { type: 'cone', seq: 7, deviceId: CAMERA, yaw: 45, pitch: 20 }),
    );
    expect(tool.onEdit).not.toHaveBeenCalled();
    const cancel: EditEvent = { type: 'cancel', seq: 8 };
    edit(cancel);
    expect(tool.onEdit).toHaveBeenCalledWith(cancel);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('answers a cone drag on a read only map with no change', () => {
    const commit = vi.fn();
    coneEdit({ floor: floorWith(camera()), readOnly: true, onEdit: vi.fn() }, commit)(coneEvent(3));
    expect(commit).toHaveBeenCalledWith(3, []);
  });
});
