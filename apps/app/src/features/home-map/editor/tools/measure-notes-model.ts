import type { Dispatch } from 'react';
import {
  homeMapDistance,
  homeMapPolygonArea,
  homeMapProjectOnSegment,
  homeMapRoomAt,
  type HomeMapAnnotation,
  type HomeMapFloor,
  type HomeMapOp,
  type HomeMapVec,
} from '@smarteverything/domain';
import {
  NO_EDIT_OVERLAY,
  type EditGhost,
  type EditOverlay,
} from '../../../../components/house-map/3d/map-3d-edit-protocol';
import type { EditorNotice } from '../mount-edit';
import { snapWallPoint, type SnapChoice } from './walls-openings-model';

export type MarkKind = 'note' | 'pin';

export type MeasureNotesMode = 'measure' | 'notes';

export interface MeasureNotesState {
  readonly from: HomeMapVec | null;
  readonly to: HomeMapVec | null;
  readonly picked: string | null;
  readonly markKind: MarkKind;
}

export type MeasureNotesEvent =
  | { readonly type: 'point'; readonly point: HomeMapVec }
  | { readonly type: 'reset' }
  | { readonly type: 'pick'; readonly id: string | null }
  | { readonly type: 'markKind'; readonly kind: MarkKind };

export const INITIAL_MEASURE_NOTES: MeasureNotesState = {
  from: null,
  to: null,
  picked: null,
  markKind: 'note',
};

export const MARK_REACH_M = 0.3;

export const NEW_NOTE_TEXT = 'New note';

export function reduceMeasureNotes(
  state: MeasureNotesState,
  event: MeasureNotesEvent,
): MeasureNotesState {
  switch (event.type) {
    case 'point':
      return state.from === null || state.to !== null
        ? { ...state, from: event.point, to: null }
        : { ...state, to: event.point };
    case 'reset':
      return { ...state, from: null, to: null };
    case 'pick':
      return { ...state, picked: event.id };
    case 'markKind':
      return { ...state, markKind: event.kind };
  }
}

export interface MeasureNotesContext {
  readonly mode: MeasureNotesMode;
  readonly floor: HomeMapFloor;
  readonly state: MeasureNotesState;
  readonly dispatch: Dispatch<MeasureNotesEvent>;
  readonly edit: (ops: readonly HomeMapOp[]) => void;
  readonly readOnly: boolean;
  readonly newId: () => string;
}

export const metresText = (metres: number): string => `${metres.toFixed(2)} m`;

export function measureReading(state: Pick<MeasureNotesState, 'from' | 'to'>): string | null {
  const { from, to } = state;
  return from !== null && to !== null ? metresText(homeMapDistance(from, to)) : null;
}

export const MEASURE_FIRST = 'Tap the first point on the floor';

export const MEASURE_SECOND = 'Tap the second point';

export const MEASURE_KEEP = 'Keep it on the map from the panel, or tap to start again';

export const NOTES_HINT = 'Tap the floor to pin a note';

export function marksNotice(context: Pick<MeasureNotesContext, 'mode' | 'state'>): EditorNotice {
  if (context.mode === 'notes') return { text: NOTES_HINT, tone: 'info' };
  const { from, to } = context.state;
  if (from === null) return { text: MEASURE_FIRST, tone: 'info' };
  return { text: to === null ? MEASURE_SECOND : MEASURE_KEEP, tone: 'info' };
}

export function markKindText(mark: HomeMapAnnotation): string {
  if (mark.kind === 'measure') return 'Measure';
  return mark.kind === 'pin' ? 'Pin' : 'Note';
}

function markSpot(mark: HomeMapAnnotation): HomeMapVec {
  if (mark.kind !== 'measure') return mark.at;
  return { x: (mark.from.x + mark.to.x) / 2, y: (mark.from.y + mark.to.y) / 2 };
}

export function markSubtitle(floor: Pick<HomeMapFloor, 'rooms'>, mark: HomeMapAnnotation): string {
  const name = homeMapRoomAt(floor.rooms, markSpot(mark))?.name ?? null;
  const kind = markKindText(mark);
  return name === null ? kind : `${kind} · ${name}`;
}

export function markTitle(mark: HomeMapAnnotation): string {
  if (mark.text !== '') return mark.text;
  return mark.kind === 'measure' ? metresText(homeMapDistance(mark.from, mark.to)) : 'Pin';
}

export interface RoomSizeLabel {
  readonly id: string;
  readonly at: HomeMapVec;
  readonly size: string;
  readonly area: string;
}

export function roomSizeLabels(floor: Pick<HomeMapFloor, 'rooms'>): readonly RoomSizeLabel[] {
  return floor.rooms.flatMap((room) => {
    const xs = room.polygon.outer.map((point) => point.x);
    const ys = room.polygon.outer.map((point) => point.y);
    if (xs.length < 3) return [];
    const width = Math.max(...xs) - Math.min(...xs);
    const depth = Math.max(...ys) - Math.min(...ys);
    return [
      {
        id: room.id,
        at: room.labelAt,
        size: `${width.toFixed(2)} × ${depth.toFixed(2)} m`,
        area: `${homeMapPolygonArea(room.polygon).toFixed(1)} m²`,
      },
    ];
  });
}

function reachOf(annotation: HomeMapAnnotation, point: HomeMapVec): number {
  if (annotation.kind !== 'measure') return homeMapDistance(annotation.at, point);
  return homeMapDistance(homeMapProjectOnSegment(annotation, point).point, point);
}

export function annotationAt(
  floor: Pick<HomeMapFloor, 'annotations'>,
  point: HomeMapVec,
): HomeMapAnnotation | null {
  const near = floor.annotations
    .map((annotation) => ({ annotation, reach: reachOf(annotation, point) }))
    .filter((item) => item.reach <= MARK_REACH_M)
    .sort((a, b) => a.reach - b.reach);
  return near[0]?.annotation ?? null;
}

export function measureOp(
  floorId: string,
  from: HomeMapVec,
  to: HomeMapVec,
  id: string,
): HomeMapOp {
  const text = metresText(homeMapDistance(from, to));
  return {
    op: 'add',
    kind: 'annotation',
    floorId,
    element: { id, kind: 'measure', from, to, text },
  };
}

export function markOp(floorId: string, kind: MarkKind, at: HomeMapVec, id: string): HomeMapOp {
  const text = kind === 'note' ? NEW_NOTE_TEXT : '';
  return { op: 'add', kind: 'annotation', floorId, element: { id, kind, at, text } };
}

function tapNotes(context: MeasureNotesContext, point: HomeMapVec): void {
  const hit = annotationAt(context.floor, point);
  if (hit !== null) {
    context.dispatch({ type: 'pick', id: hit.id });
    return;
  }
  if (context.readOnly) {
    context.dispatch({ type: 'pick', id: null });
    return;
  }
  const id = context.newId();
  context.edit([markOp(context.floor.id, context.state.markKind, point, id)]);
  context.dispatch({ type: 'pick', id });
}

export function measureNotesTap(
  context: MeasureNotesContext,
  point: HomeMapVec,
  choice: SnapChoice,
): void {
  if (context.mode === 'notes') {
    tapNotes(context, point);
    return;
  }
  const anchor = context.state.to === null ? context.state.from : null;
  const snapped = snapWallPoint(point, context.floor, anchor === null ? [] : [anchor], choice);
  context.dispatch({ type: 'point', point: snapped });
}

export function keepMeasure(context: MeasureNotesContext): void {
  const { from, to } = context.state;
  if (context.readOnly || from === null || to === null) return;
  context.edit([measureOp(context.floor.id, from, to, context.newId())]);
  context.dispatch({ type: 'reset' });
}

export const removeOp = (floorId: string, id: string): HomeMapOp => ({
  op: 'remove',
  kind: 'annotation',
  floorId,
  id,
});

export const TICK_HALF_M = 0.15;

export const PIN_RADIUS_M = 0.12;

const PIN_STEPS = 12;

type EditTone = EditGhost['tone'];

type EditLabel = EditOverlay['labels'][number];

interface FlatPoint {
  readonly x: number;
  readonly y: number;
  readonly height: number;
}

const flat = (point: HomeMapVec): FlatPoint => ({ x: point.x, y: point.y, height: 0 });

const line = (points: readonly HomeMapVec[], tone: EditTone): EditGhost => ({
  shape: 'polyline',
  points: points.map(flat),
  tone,
});

function across(at: HomeMapVec, normal: HomeMapVec, tone: EditTone): EditGhost {
  const from = { x: at.x - normal.x, y: at.y - normal.y };
  return line([from, { x: at.x + normal.x, y: at.y + normal.y }], tone);
}

export function rulerGhosts(from: HomeMapVec, to: HomeMapVec, tone: EditTone): EditGhost[] {
  const length = homeMapDistance(from, to);
  if (length === 0) return [];
  const normal = {
    x: ((from.y - to.y) / length) * TICK_HALF_M,
    y: ((to.x - from.x) / length) * TICK_HALF_M,
  };
  return [line([from, to], tone), across(from, normal, tone), across(to, normal, tone)];
}

function startGhosts(at: HomeMapVec): EditGhost[] {
  return [
    across(at, { x: TICK_HALF_M, y: 0 }, 'accent'),
    across(at, { x: 0, y: TICK_HALF_M }, 'accent'),
  ];
}

function pinGhost(at: HomeMapVec): EditGhost {
  const points = Array.from({ length: PIN_STEPS }, (_, index) => {
    const angle = (index / PIN_STEPS) * Math.PI * 2;
    return flat({
      x: at.x + Math.cos(angle) * PIN_RADIUS_M,
      y: at.y + Math.sin(angle) * PIN_RADIUS_M,
    });
  });
  return { shape: 'polygon', points, tone: 'accent' };
}

function rulerLabel(from: HomeMapVec, to: HomeMapVec, tone: EditTone): EditLabel {
  const at = flat({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 });
  return { at, text: metresText(homeMapDistance(from, to)), tone };
}

function markGhosts(mark: HomeMapAnnotation): EditGhost[] {
  return mark.kind === 'measure' ? rulerGhosts(mark.from, mark.to, 'neutral') : [pinGhost(mark.at)];
}

function markLabels(mark: HomeMapAnnotation, picked: string | null): EditLabel[] {
  if (mark.kind === 'measure') return [rulerLabel(mark.from, mark.to, 'neutral')];
  const text = mark.text === '' && mark.kind === 'note' ? NEW_NOTE_TEXT : mark.text;
  if (text === '') return [];
  return [{ at: flat(mark.at), text, tone: picked === mark.id ? 'accent' : 'neutral' }];
}

function draftGhosts(state: MeasureNotesState): EditGhost[] {
  const { from, to } = state;
  if (from === null) return [];
  return to === null ? startGhosts(from) : rulerGhosts(from, to, 'accent');
}

function draftLabels(state: MeasureNotesState): EditLabel[] {
  const { from, to } = state;
  return from === null || to === null ? [] : [rulerLabel(from, to, 'accent')];
}

function sizeLabels(floor: Pick<HomeMapFloor, 'rooms'>): EditLabel[] {
  return roomSizeLabels(floor).map((label) => ({
    at: flat(label.at),
    text: `${label.size} · ${label.area}`,
    tone: 'neutral',
  }));
}

export function marksOverlay(
  context: Pick<MeasureNotesContext, 'mode' | 'floor' | 'state' | 'readOnly'>,
): EditOverlay {
  const { floor, state } = context;
  const measuring = context.mode === 'measure';
  return {
    ...NO_EDIT_OVERLAY,
    mode: measuring ? 'draw-points' : 'none',
    readOnly: context.readOnly,
    ghosts: [...floor.annotations.flatMap(markGhosts), ...(measuring ? draftGhosts(state) : [])],
    labels: [
      ...(measuring ? sizeLabels(floor) : []),
      ...floor.annotations.flatMap((mark) => markLabels(mark, state.picked)),
      ...(measuring ? draftLabels(state) : []),
    ],
  };
}
