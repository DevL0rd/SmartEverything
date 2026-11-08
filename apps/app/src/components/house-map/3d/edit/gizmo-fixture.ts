import { EDIT_FLOOR, NO_EDIT_OVERLAY, type EditFloorWire } from '../map-3d-edit-protocol';
import type { Vec3 } from '../mesh';
import type { Point } from '../render-core-gestures';
import { NO_INSETS, buildCamera, type CameraView, type OrbitState } from '../render-core-orbit';
import type { SceneFrame } from '../vacuum-geometry';
import { toScreen, type EditGizmo, type GizmoBreakpoint, type GizmoView } from './gizmo';

export const PHONE: CameraView = { width: 390, height: 844, insets: NO_INSETS };

export const DESKTOP: CameraView = { width: 1440, height: 900, insets: NO_INSETS };

const FRAME: SceneFrame = { centre: [5, 0, -3], radius: 8 };

export type Look = 'top' | 'angled' | 'side' | 'far';

export const CAMERAS: Readonly<Record<Look, OrbitState>> = {
  top: { azimuth: 0, polar: 0, distance: 12, target: [5, 0, -3], top: true },
  angled: { azimuth: 0.6, polar: 0.95, distance: 10, target: [5, 0, -3], top: false },
  side: { azimuth: 0, polar: 1.35, distance: 10, target: [5, 0, -3], top: false },
  far: { azimuth: 0, polar: 0, distance: 30, target: [5, 0, -3], top: true },
};

const ORIGIN = { kind: 'hand' };

function wall(id: string, from: readonly [number, number], to: readonly [number, number]): unknown {
  const [fx, fy] = from;
  const [tx, ty] = to;
  return {
    id,
    from: { x: fx, y: fy },
    to: { x: tx, y: ty },
    thickness: 0.1,
    height: null,
    kind: 'solid',
    origin: ORIGIN,
  };
}

function object(id: string, at: readonly [number, number], extra: object): unknown {
  const [x, y] = at;
  return {
    id,
    modelId: id,
    finish: null,
    params: {},
    at: { x, y },
    rotation: 0,
    elevation: 0,
    label: null,
    locked: false,
    origin: ORIGIN,
    ...extra,
  };
}

function room(id: string, outer: readonly (readonly [number, number])[]): unknown {
  return {
    id,
    name: id,
    homeRoomId: null,
    polygon: { outer: outer.map(([x, y]) => ({ x, y })), holes: [] },
    labelAt: { x: 5, y: 3 },
    colourSlot: 1,
    floorMaterial: { kind: 'wood', variant: null, tint: null },
    wallPaint: null,
    ceilingHeight: null,
    origin: ORIGIN,
  };
}

export const LAMP = '5b2f0c3e-1d4a-4e6b-8c9d-0a1b2c3d4e5f';

export const EDIT: EditFloorWire = EDIT_FLOOR.parse({
  floor: {
    id: 'f1',
    name: 'Ground',
    level: 0,
    elevation: 0,
    ceilingHeight: 2.6,
    rooms: [
      room('living', [
        [0, 0],
        [10, 0],
        [10, 6],
        [0, 6],
      ]),
    ],
    walls: [
      wall('south', [0, 0], [10, 0]),
      wall('east', [10, 0], [10, 6]),
      wall('north', [0, 6], [10, 6]),
      wall('west', [0, 6], [0, 0]),
    ],
    openings: [],
    objects: [
      object('sofa', [5, 3], {}),
      object('table', [5, 3], {}),
      object('chair', [5, 3], { rotation: 30 }),
      object('shelf', [5, 3], { elevation: 0.5 }),
      object('tv', [2, 5.95], {
        elevation: 1.2,
        rotation: 270,
        wall: { wallId: 'north', offset: 2, side: 'right' },
      }),
    ],
    placements: [
      {
        deviceId: LAMP,
        floorId: 'f1',
        at: { x: 5, y: 3 },
        rotation: 0,
        height: 0,
        tilt: 0,
        mount: 'floor',
        auto: false,
        camera: null,
      },
    ],
    annotations: [],
  },
  boxes: {
    sofa: { w: 0.3, d: 0.3, h: 0.4 },
    table: { w: 1, d: 2, h: 0.75 },
    chair: { w: 0.5, d: 0.5, h: 0.9 },
    shelf: { w: 0.4, d: 0.4, h: 0.3 },
    tv: { w: 1, d: 0.1, h: 0.6 },
  },
});

export interface GizmoCase {
  readonly id: string;
  readonly mode: EditGizmo['mode'];
  readonly look?: Look;
  readonly space?: EditGizmo['space'];
  readonly axes?: EditGizmo['axes'];
  readonly breakpoint?: GizmoBreakpoint;
  readonly snapping?: boolean;
  readonly readOnly?: boolean;
}

function poseOf(id: string): {
  readonly x: number;
  readonly y: number;
  readonly height: number;
  readonly turn: number;
} {
  const living = EDIT.floor.rooms.find((each) => each.id === id);
  if (living !== undefined) {
    const { outer } = living.polygon;
    const x = outer.reduce((sum, point) => sum + point.x, 0) / outer.length;
    const y = outer.reduce((sum, point) => sum + point.y, 0) / outer.length;
    return { x, y, height: 0, turn: 0 };
  }
  const object = EDIT.floor.objects.find((each) => each.id === id);
  if (object !== undefined) {
    return { x: object.at.x, y: object.at.y, height: object.elevation, turn: object.rotation };
  }
  const placement = EDIT.floor.placements.find((each) => each.deviceId === id);
  if (placement === undefined) throw new Error(`The gizmo fixture has no item ${id}`);
  return {
    x: placement.at.x,
    y: placement.at.y,
    height: placement.height,
    turn: placement.rotation,
  };
}

export function gizmoView(given: GizmoCase): GizmoView {
  const breakpoint = given.breakpoint ?? 'phone';
  const screen = breakpoint === 'desktop' ? DESKTOP : PHONE;
  const pose = poseOf(given.id);
  return {
    camera: buildCamera(CAMERAS[given.look ?? 'top'], screen, FRAME),
    bounds: { left: 0, top: 0, width: screen.width, height: screen.height },
    viewport: screen,
    edit: EDIT,
    snapping: given.snapping ?? true,
    nameOf: (id) => id,
    breakpoint,
    overlay: {
      ...NO_EDIT_OVERLAY,
      mode: 'select',
      selection: [given.id],
      readOnly: given.readOnly ?? false,
      gizmo: {
        mode: given.mode,
        space: given.space ?? 'local',
        centre: { x: pose.x, y: pose.y, height: pose.height },
        axes: given.axes ?? ['x', 'y', 'z'],
        turn: pose.turn,
      },
    },
  };
}

export function screenOf(view: GizmoView, world: Vec3): Point {
  const point = toScreen(view, world);
  if (point === null) throw new Error(`The point ${world.join(', ')} is behind the camera`);
  return point;
}

export function ground(x: number, y: number, height = 0): Vec3 {
  return [x, height, -y];
}
