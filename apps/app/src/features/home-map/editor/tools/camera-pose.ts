import {
  HOME_MAP_VISIBILITY_ARC_STEP_DEG,
  type HomeMapCamera,
  type HomeMapFloor,
  type HomeMapOp,
  type HomeMapPlacement,
  type HomeMapVec,
} from '@smarteverything/domain';
import type {
  EditEvent,
  EditGhost,
  EditOverlay,
} from '../../../../components/house-map/3d/map-3d-edit-protocol';
import { degreesText } from '../../../../components/house-map/edit/gestures';
import { placementOp } from '../list-editor/objects-devices-model';
import type { EditCommit } from '../mount-edit';

export const CAMERA_POSE_HINT = 'Drag the dot at the tip to turn, the diamond to tilt.';

const RAD = Math.PI / 180;
const FULL_TURN_DEG = 360;
const GROUND = { kind: 'ground' } as const;

type EditHandle = EditOverlay['handles'][number];
type EditLabel = EditOverlay['labels'][number];

export type ConeEdit = Extract<EditEvent, { readonly type: 'cone' }>;

export type PosedCamera = HomeMapPlacement & { readonly camera: HomeMapCamera };

export interface ConeMarks {
  readonly handles: readonly EditHandle[];
  readonly ghosts: readonly EditGhost[];
  readonly labels: readonly EditLabel[];
}

function along(placement: PosedCamera, degrees: number, metres: number): HomeMapVec {
  const turn = degrees * RAD;
  return {
    x: placement.at.x + Math.cos(turn) * metres,
    y: placement.at.y + Math.sin(turn) * metres,
  };
}

function ground(point: HomeMapVec): EditHandle['at'] {
  return { x: point.x, y: point.y, height: 0 };
}

export function tiltText(degrees: number): string {
  const whole = Math.round(degrees);
  return `Tilt ${whole < 0 ? '−' : ''}${String(Math.abs(whole))}°`;
}

export function turnText(degrees: number): string {
  return `Turn ${degreesText(degrees)}`;
}

export function coneTip(placement: PosedCamera): HomeMapVec {
  return along(placement, placement.camera.pan.yawDeg, placement.camera.rangeM);
}

export function tiltSpot(placement: PosedCamera): HomeMapVec {
  const { rangeM, pan } = placement.camera;
  const reach = placement.height / Math.tan(placement.tilt * RAD);
  const meets = placement.tilt > 0 && reach > 0 && reach < rangeM;
  return along(placement, pan.yawDeg, meets ? reach : rangeM / 2);
}

export function coneWedge(placement: PosedCamera): readonly HomeMapVec[] {
  const { hfovDeg, rangeM, pan } = placement.camera;
  const span = Math.min(hfovDeg, FULL_TURN_DEG);
  const steps = Math.ceil(span / HOME_MAP_VISIBILITY_ARC_STEP_DEG);
  const start = pan.yawDeg - span / 2;
  const arc = Array.from({ length: steps + 1 }, (_, index) =>
    along(placement, start + (span * index) / steps, rangeM),
  );
  return span >= FULL_TURN_DEG ? arc : [placement.at, ...arc];
}

function coneHandles(placement: PosedCamera): readonly EditHandle[] {
  const target = { kind: 'cone', deviceId: placement.deviceId } as const;
  const id = placement.deviceId;
  return [
    {
      id: `${id}:cone-yaw`,
      kind: 'cone-yaw',
      at: ground(coneTip(placement)),
      surface: GROUND,
      target,
    },
    {
      id: `${id}:cone-pitch`,
      kind: 'cone-pitch',
      at: ground(tiltSpot(placement)),
      surface: GROUND,
      target,
    },
  ];
}

function coneGhosts(placement: PosedCamera): readonly EditGhost[] {
  const camera = { ...placement.at, height: placement.height };
  return [
    { shape: 'polygon', points: coneWedge(placement).map(ground), tone: 'accent' },
    {
      shape: 'polyline',
      points: [ground(placement.at), ground(coneTip(placement))],
      tone: 'accent',
    },
    { shape: 'polyline', points: [camera, ground(placement.at)], tone: 'neutral' },
  ];
}

export function coneMarks(placement: PosedCamera): ConeMarks {
  return {
    handles: coneHandles(placement),
    ghosts: coneGhosts(placement),
    labels: [
      {
        at: ground(coneTip(placement)),
        text: turnText(placement.camera.pan.yawDeg),
        tone: 'neutral',
      },
      { at: ground(tiltSpot(placement)), text: tiltText(placement.tilt), tone: 'neutral' },
    ],
  };
}

export function selectedCamera(
  floor: Pick<HomeMapFloor, 'placements'> | null,
  selected: string | null,
): PosedCamera | null {
  const placement = floor?.placements.find((each) => each.deviceId === selected);
  const camera = placement?.camera ?? null;
  if (placement === undefined || camera === null) return null;
  return { ...placement, camera };
}

export function withCone(overlay: EditOverlay, camera: PosedCamera | null): EditOverlay {
  if (overlay.mode !== 'select' || camera === null) return overlay;
  const marks = coneMarks(camera);
  return {
    ...overlay,
    handles: [...overlay.handles, ...marks.handles],
    ghosts: [...overlay.ghosts, ...marks.ghosts],
    labels: [...overlay.labels, ...marks.labels],
  };
}

export function coneOps(
  floor: Pick<HomeMapFloor, 'id' | 'placements'>,
  event: ConeEdit,
): readonly HomeMapOp[] {
  const camera = selectedCamera(floor, event.deviceId);
  if (camera === null) return [];
  const pan = { ...camera.camera.pan, yawDeg: event.yaw };
  return [
    placementOp(floor.id, event.deviceId, { tilt: event.pitch, camera: { ...camera.camera, pan } }),
  ];
}

export interface ConeTool {
  readonly floor: Pick<HomeMapFloor, 'id' | 'placements'> | null;
  readonly readOnly: boolean;
  readonly onEdit: (event: EditEvent) => void;
}

export function coneEdit(tool: ConeTool, commit: EditCommit): (event: EditEvent) => void {
  return (event) => {
    if (event.type !== 'cone') {
      tool.onEdit(event);
      return;
    }
    const { floor } = tool;
    commit(event.seq, floor === null || tool.readOnly ? [] : coneOps(floor, event));
  };
}
