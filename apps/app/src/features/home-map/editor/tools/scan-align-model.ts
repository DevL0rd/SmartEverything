import {
  applySimilarity2d,
  fitSimilarity2d,
  homeMapSnapRotation,
  type HomeMapOp,
  type HomeMapScan,
  type HomeMapScanTransform,
  type HomeMapVec,
  type ScanPlanPair,
  type ScanPlanPoint,
} from '@smarteverything/domain';
import {
  NO_EDIT_OVERLAY,
  type EditEvent,
  type EditExtent,
  type EditGhost,
  type EditOverlay,
} from '../../../../components/house-map/3d/map-3d-edit-protocol';
import type { RenderBounds } from '../../../../components/house-map/render-scene';

export const SCAN_ALIGN_LABEL = 'Align realistic view';

export const SCAN_ALIGN_INTRO =
  'Drag the gizmo on the scan to move, lift, turn or scale it, or type the numbers.';

export const NO_SCAN_TEXT = 'This map has no realistic view yet. Upload a scan to line it up.';

export const REMOVE_TITLE = 'Remove the realistic view?';

export const REMOVE_LINE = 'The map keeps its rooms and devices. You can undo this.';

export const SCAN_GRIP_IDS = {
  move: 'scan:move',
  lift: 'scan:lift',
  turn: 'scan:turn',
  scale: 'scan:scale',
} as const;

const MARK_RADIUS_M = 0.12;

const MARK_SIDES = 16;

const RAD = Math.PI / 180;

type EditTone = EditGhost['tone'];

type EditHandle = EditOverlay['handles'][number];

type ScanPlacement = Extract<EditEvent, { readonly type: 'scan' }>['placement'];

export function scanExtentOf(
  measured: RenderBounds | null,
  floor: RenderBounds | null,
): EditExtent | null {
  const extent = measured ?? floor;
  if (extent === null || !(extent.minX < extent.maxX && extent.minY < extent.maxY)) return null;
  return extent;
}

export function scanPointOf(transform: HomeMapScanTransform, map: HomeMapVec): ScanPlanPoint {
  const turn = -transform.yawDeg * RAD;
  const dx = (map.x - transform.tx) / transform.scale;
  const dy = (map.y - transform.ty) / transform.scale;
  return {
    x: Math.cos(turn) * dx - Math.sin(turn) * dy,
    y: Math.sin(turn) * dx + Math.cos(turn) * dy,
  };
}

export function scanCorners(
  transform: HomeMapScanTransform,
  extent: EditExtent,
): readonly HomeMapVec[] {
  return [
    { x: extent.minX, y: extent.minY },
    { x: extent.maxX, y: extent.minY },
    { x: extent.maxX, y: extent.maxY },
    { x: extent.minX, y: extent.maxY },
  ].map((corner) => applySimilarity2d(transform, corner));
}

const onFloor = (point: HomeMapVec): EditHandle['at'] => ({ x: point.x, y: point.y, height: 0 });

const middle = (a: HomeMapVec, b: HomeMapVec): HomeMapVec => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

function circle(at: HomeMapVec, radius: number): readonly EditHandle['at'][] {
  return Array.from({ length: MARK_SIDES }, (_, index) => {
    const turn = (index * 2 * Math.PI) / MARK_SIDES;
    return onFloor({ x: at.x + Math.cos(turn) * radius, y: at.y + Math.sin(turn) * radius });
  });
}

function dotGhost(at: HomeMapVec, tone: EditTone): EditGhost {
  return { shape: 'polygon', points: [...circle(at, MARK_RADIUS_M)], tone };
}

function ringGhost(at: HomeMapVec, tone: EditTone): EditGhost {
  const points = circle(at, MARK_RADIUS_M * 1.5);
  return { shape: 'polyline', points: [...points, ...points.slice(0, 1)], tone };
}

export interface MarkPair {
  readonly from: HomeMapVec | null;
  readonly to: HomeMapVec | null;
}

export function pairGhosts(pairs: readonly MarkPair[], dot: EditTone): readonly EditGhost[] {
  return pairs.flatMap(({ from, to }) => [
    ...(from === null || to === null
      ? []
      : [
          {
            shape: 'polyline' as const,
            points: [onFloor(from), onFloor(to)],
            tone: 'neutral' as const,
          },
        ]),
    ...(from === null ? [] : [dotGhost(from, dot)]),
    ...(to === null ? [] : [ringGhost(to, 'accent')]),
  ]);
}

function grip(id: string, kind: EditHandle['kind'], at: HomeMapVec): EditHandle {
  return { id, kind, at: onFloor(at), surface: { kind: 'ground' }, target: { kind: 'scan' } };
}

function scanGrips(corners: readonly HomeMapVec[], centre: HomeMapVec): readonly EditHandle[] {
  const [sw, se, ne, nw] = corners;
  if (sw === undefined || se === undefined || ne === undefined || nw === undefined) return [];
  return [
    grip(SCAN_GRIP_IDS.move, 'plane', centre),
    grip(SCAN_GRIP_IDS.lift, 'top', middle(sw, nw)),
    grip(SCAN_GRIP_IDS.turn, 'ring', middle(ne, nw)),
    grip(SCAN_GRIP_IDS.scale, 'uniform', ne),
  ];
}

export interface ScanOverlayInput {
  readonly transform: HomeMapScanTransform;
  readonly extent: EditExtent | null;
  readonly readOnly: boolean;
  readonly picking: boolean;
  readonly marks: readonly MarkPair[];
}

export function scanOverlay(input: ScanOverlayInput): EditOverlay {
  const { transform, extent } = input;
  const corners = extent === null ? [] : scanCorners(transform, extent);
  const centre =
    extent === null
      ? { x: transform.tx, y: transform.ty }
      : applySimilarity2d(
          transform,
          middle({ x: extent.minX, y: extent.minY }, { x: extent.maxX, y: extent.maxY }),
        );
  const outline: readonly EditGhost[] =
    corners.length === 0
      ? []
      : [
          {
            shape: 'polyline',
            points: [...corners, ...corners.slice(0, 1)].map(onFloor),
            tone: 'accent',
          },
        ];
  return {
    ...NO_EDIT_OVERLAY,
    mode: 'none',
    readOnly: input.readOnly,
    gizmo: {
      mode: 'move',
      space: 'local',
      centre: onFloor(centre),
      axes: ['x', 'y', 'z'],
      turn: transform.yawDeg,
    },
    handles: input.picking ? [] : [...scanGrips(corners, centre)],
    ghosts: [...outline, ...pairGhosts(input.marks, 'accent')],
    scanExtent: extent,
  };
}

type TransformPatch = Partial<HomeMapScanTransform>;

const TRANSFORM_KEYS = [
  'tx',
  'ty',
  'tz',
  'yawDeg',
  'scale',
  'levelled',
] as const satisfies readonly (keyof HomeMapScanTransform)[];

export function transformPatch(
  before: HomeMapScanTransform,
  after: HomeMapScanTransform,
): TransformPatch | null {
  const keys = TRANSFORM_KEYS.filter((key) => before[key] !== after[key]);
  if (keys.length === 0) return null;
  return Object.fromEntries(keys.map((key) => [key, after[key]]));
}

export function placedPatch(
  transform: HomeMapScanTransform,
  placement: ScanPlacement,
): TransformPatch | null {
  const { tx, ty, tz, scale } = placement;
  const yawDeg = homeMapSnapRotation(placement.yawDeg, null);
  return transformPatch(transform, { ...transform, tx, ty, tz, yawDeg, scale });
}

export function transformOp(patch: TransformPatch): HomeMapOp {
  return { op: 'setScanTransform', patch: { transform: patch } };
}

export function opacityOp(opacity: number): HomeMapOp {
  return { op: 'setScanTransform', patch: { opacity: Math.min(1, Math.max(0, opacity)) } };
}

export const REMOVE_SCAN_OP: HomeMapOp = { op: 'removeScan' };

export type ScanField = 'tx' | 'ty' | 'tz' | 'yawDeg' | 'scale';

export function fieldPatch(field: ScanField, value: number): TransformPatch | null {
  if (!Number.isFinite(value)) return null;
  if (field === 'scale') return value > 0 ? { scale: value } : null;
  if (field === 'yawDeg') return { yawDeg: homeMapSnapRotation(value, null) };
  return { [field]: value };
}

export interface PointsDraft {
  readonly pairs: readonly ScanPlanPair[];
  readonly pending: ScanPlanPoint | null;
}

export const EMPTY_POINTS: PointsDraft = { pairs: [], pending: null };

export function pointsTap(
  draft: PointsDraft,
  transform: HomeMapScanTransform,
  at: HomeMapVec,
): PointsDraft {
  if (draft.pending === null) return { ...draft, pending: scanPointOf(transform, at) };
  return {
    pairs: [...draft.pairs, { scan: draft.pending, map: { x: at.x, y: at.y } }],
    pending: null,
  };
}

export function pointsPrompt(draft: PointsDraft): string {
  const number = String(draft.pairs.length + 1);
  if (draft.pending !== null) return `Now tap the same point ${number} on the map`;
  if (draft.pairs.length < 2) return `Tap point ${number} on the scan`;
  return 'Line up now, or tap another point on the scan for a closer fit';
}

export function fitOp(draft: PointsDraft, levelled: boolean): HomeMapOp | null {
  const fit = fitSimilarity2d(draft.pairs);
  if (fit === null) return null;
  return {
    op: 'setScanTransform',
    patch: {
      transform: {
        tx: fit.tx,
        ty: fit.ty,
        yawDeg: homeMapSnapRotation(fit.yawDeg, null),
        scale: fit.scale,
        levelled,
      },
      points: draft.pairs.map((pair) => ({
        scan: { x: pair.scan.x, y: pair.scan.y, z: 0 },
        map: { x: pair.map.x, y: pair.map.y },
      })),
      residualM: fit.residualM,
    },
  };
}

export function residualText(residualM: number | null): string | null {
  if (residualM === null) return null;
  const cm = Math.round(residualM * 100);
  return cm === 0 ? 'Lined up exactly' : `Lined up within ${String(cm)} cm`;
}

export function scanMarks(
  scan: Pick<HomeMapScan, 'points'> | null,
  draft: PointsDraft,
  transform: HomeMapScanTransform,
): readonly MarkPair[] {
  const pairs =
    draft.pairs.length > 0 || draft.pending !== null ? draft.pairs : (scan?.points ?? []);
  const shown = pairs.map((pair) => ({
    from: applySimilarity2d(transform, pair.scan),
    to: { x: pair.map.x, y: pair.map.y },
  }));
  return draft.pending === null
    ? shown
    : [...shown, { from: applySimilarity2d(transform, draft.pending), to: null }];
}
