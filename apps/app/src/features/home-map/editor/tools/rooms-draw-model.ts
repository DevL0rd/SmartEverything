import {
  HOME_MAP_GRID_M,
  HOME_MAP_ROOM_WRITE,
  HOME_MAP_WALL_ANGLE_STEP_DEG,
  homeMapDistance,
  homeMapSnapPoint,
  type HomeMapOp,
  type HomeMapRoom,
  type HomeMapSnapGuide,
  type HomeMapSnapWall,
  type HomeMapVec,
} from '@smarteverything/domain';
import { HIT_RADIUS_PX } from '../../../../components/house-map/edit/radii';
import {
  cleanRing,
  labelPoint,
  nextColourSlot,
  rectRing,
  validRing,
  type DrawRing,
} from './rooms-draw-geometry';

export interface DrawFloor {
  readonly id: string;
  readonly rooms: readonly HomeMapRoom[];
  readonly walls: readonly HomeMapSnapWall[];
}

export interface DrawContext {
  readonly floor: DrawFloor;
  readonly gridM: number;
  readonly newId: () => string;
}

export type BuildContext = Pick<DrawContext, 'floor' | 'newId'>;

export interface DrawTap {
  readonly at: HomeMapVec;
  readonly metresPerPx: number;
}

export type DrawShapeKind = 'rect' | 'points';

export type RoomsDraft =
  | { readonly kind: 'idle' }
  | { readonly kind: 'rect'; readonly from: HomeMapVec }
  | { readonly kind: 'polygon'; readonly points: readonly HomeMapVec[] };

export interface RoomsDrawState {
  readonly shape: DrawShapeKind;
  readonly draft: RoomsDraft;
  readonly guides: readonly HomeMapSnapGuide[];
}

export interface DrawStep {
  readonly state: RoomsDrawState;
  readonly ops: readonly HomeMapOp[];
  readonly select: string | null;
}

const IDLE: RoomsDraft = { kind: 'idle' };

export const IDLE_DRAW: RoomsDrawState = { shape: 'rect', draft: IDLE, guides: [] };

export const DEFAULT_DRAW_GRID_M = HOME_MAP_GRID_M;

const NO_STEP_OPS: readonly HomeMapOp[] = [];

const stay = (state: RoomsDrawState): DrawStep => ({ state, ops: NO_STEP_OPS, select: null });

const idleOf = (state: RoomsDrawState): RoomsDrawState => ({ ...state, draft: IDLE, guides: [] });

export function hitRadiusM(metresPerPx: number): number {
  return HIT_RADIUS_PX * metresPerPx;
}

function snapAt(
  ctx: DrawContext,
  tap: DrawTap,
  own: readonly HomeMapVec[],
): { readonly point: HomeMapVec; readonly guides: readonly HomeMapSnapGuide[] } {
  const anchor = own.at(-1) ?? null;
  const corners = [...ctx.floor.rooms.flatMap((room) => room.polygon.outer), ...own];
  const result = homeMapSnapPoint(
    tap.at,
    ctx.floor.walls,
    {
      radius: hitRadiusM(tap.metresPerPx),
      gridM: ctx.gridM,
      points: true,
      guides: true,
      anchor,
      angleStepDeg: anchor === null ? null : HOME_MAP_WALL_ANGLE_STEP_DEG,
    },
    corners,
  );
  return { point: result.point, guides: result.guides };
}

export function addRoomOp(ctx: BuildContext, ring: DrawRing, id: string): HomeMapOp {
  const element = HOME_MAP_ROOM_WRITE.parse({
    id,
    name: null,
    homeRoomId: null,
    polygon: { outer: ring, holes: [] },
    labelAt: labelPoint(ring),
    colourSlot: nextColourSlot(ctx.floor.rooms),
    floorMaterial: { kind: 'plain', variant: null, tint: null },
    wallPaint: null,
    ceilingHeight: null,
    origin: { kind: 'hand' },
  });
  return { op: 'add', kind: 'room', floorId: ctx.floor.id, element };
}

export function reshapeRoomOp(
  floorId: string,
  roomId: string,
  ring: DrawRing,
  holes: HomeMapRoom['polygon']['holes'] = [],
): HomeMapOp {
  return {
    op: 'update',
    kind: 'room',
    floorId,
    id: roomId,
    patch: { polygon: { outer: ring, holes }, labelAt: labelPoint(ring) },
  };
}

function created(state: RoomsDrawState, ctx: BuildContext, ring: DrawRing): DrawStep {
  const clean = cleanRing(ring);
  if (!validRing(clean)) return stay(state);
  const id = ctx.newId();
  return { state: idleOf(state), ops: [addRoomOp(ctx, clean, id)], select: id };
}

export function finishPolygon(state: RoomsDrawState, ctx: BuildContext): DrawStep {
  if (state.draft.kind !== 'polygon') return stay(state);
  return created(state, ctx, state.draft.points);
}

function closesPolygon(points: readonly HomeMapVec[], tap: DrawTap): boolean {
  const first = points[0];
  if (first === undefined || points.length < 3) return false;
  return homeMapDistance(first, tap.at) <= hitRadiusM(tap.metresPerPx);
}

function tapPolygon(state: RoomsDrawState, ctx: DrawContext, tap: DrawTap): DrawStep {
  const points = state.draft.kind === 'polygon' ? state.draft.points : [];
  if (closesPolygon(points, tap)) return finishPolygon(state, ctx);
  const snapped = snapAt(ctx, tap, points);
  const next = cleanRing([...points, snapped.point]);
  return stay({ ...state, draft: { kind: 'polygon', points: next }, guides: snapped.guides });
}

function tapRect(state: RoomsDrawState, ctx: DrawContext, tap: DrawTap): DrawStep {
  const snapped = snapAt(ctx, tap, []);
  if (state.draft.kind !== 'rect') {
    return stay({ ...state, draft: { kind: 'rect', from: snapped.point }, guides: snapped.guides });
  }
  const step = created(state, ctx, rectRing(state.draft.from, snapped.point));
  return step.ops.length === 0 ? stay({ ...state, guides: snapped.guides }) : step;
}

export function tapDraw(
  state: RoomsDrawState,
  ctx: DrawContext,
  tap: DrawTap,
  roomAt: string | null,
): DrawStep {
  if (state.draft.kind === 'idle' && roomAt !== null) {
    return { state, ops: NO_STEP_OPS, select: roomAt };
  }
  return state.shape === 'rect' ? tapRect(state, ctx, tap) : tapPolygon(state, ctx, tap);
}

export function draftPoints(draft: RoomsDraft): DrawRing {
  switch (draft.kind) {
    case 'idle':
      return [];
    case 'rect':
      return [draft.from];
    case 'polygon':
      return draft.points;
  }
}

export function moveCorner(state: RoomsDrawState, index: number, to: HomeMapVec): RoomsDrawState {
  const { draft } = state;
  if (draft.kind === 'rect' && index === 0) return { ...state, draft: { ...draft, from: to } };
  if (draft.kind !== 'polygon' || draft.points[index] === undefined) return state;
  const points = cleanRing(draft.points.map((point, at) => (at === index ? to : point)));
  return { ...state, draft: { kind: 'polygon', points }, guides: [] };
}

export function undoCorner(state: RoomsDrawState): RoomsDrawState {
  const { draft } = state;
  if (draft.kind !== 'polygon' || draft.points.length <= 1) return idleOf(state);
  return { ...state, draft: { kind: 'polygon', points: draft.points.slice(0, -1) }, guides: [] };
}

export function chooseShape(shape: DrawShapeKind): RoomsDrawState {
  return { shape, draft: IDLE, guides: [] };
}

export const cancelDraw = idleOf;

export interface DraftShape {
  readonly ring: DrawRing;
  readonly closed: boolean;
}

export function draftShape(draft: RoomsDraft): DraftShape | null {
  return draft.kind === 'idle' ? null : { ring: draftPoints(draft), closed: false };
}

export function cornerCount(draft: RoomsDraft): number {
  return draftPoints(draft).length;
}
