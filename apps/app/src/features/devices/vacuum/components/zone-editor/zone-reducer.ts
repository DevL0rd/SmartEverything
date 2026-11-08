import type { VacuumPoint, VacuumRestricted, VacuumScene } from '@smarteverything/domain';
import {
  defaultShape,
  dragHandle,
  moveShape,
  nudgeShape,
  type Bounds,
  type HandleId,
} from './zone-geometry';
import {
  cleanShapes,
  limitReason,
  nextKey,
  restrictedShapesOf,
  restrictedShapesOfScene,
  signatureOf,
  type Draft,
  type Shape,
  type ShapeKind,
} from './zone-shapes';

export interface Drag {
  readonly key: number;
  readonly handle: HandleId | null;
  readonly start: VacuumPoint;
  readonly before: Draft;
}

export interface ZoneState {
  readonly present: Draft;
  readonly past: readonly Draft[];
  readonly drag: Drag | null;
  readonly selected: number | null;
  readonly mode: ShapeKind;
  readonly baseline: string;
  readonly version: string;
  readonly previousSaved: VacuumRestricted | null;
}

export type ZoneAction =
  | { readonly type: 'mode'; readonly mode: ShapeKind }
  | { readonly type: 'select'; readonly key: number | null }
  | { readonly type: 'add'; readonly bounds: Bounds }
  | { readonly type: 'remove'; readonly key: number }
  | {
      readonly type: 'grab';
      readonly key: number;
      readonly handle: HandleId | null;
      readonly start: VacuumPoint;
    }
  | { readonly type: 'drag'; readonly point: VacuumPoint; readonly bounds: Bounds }
  | { readonly type: 'release' }
  | { readonly type: 'replace'; readonly shape: Shape }
  | {
      readonly type: 'nudge';
      readonly key: number;
      readonly step: VacuumPoint;
      readonly bounds: Bounds;
    }
  | { readonly type: 'undo' }
  | { readonly type: 'sync'; readonly zones: VacuumScene['zones']; readonly version: string }
  | { readonly type: 'saved'; readonly previous: VacuumRestricted }
  | { readonly type: 'restored'; readonly restricted: VacuumRestricted };

export function initialZoneState(zones: VacuumScene['zones'], version: string): ZoneState {
  const present = restrictedShapesOfScene(zones);
  return {
    present,
    past: [],
    drag: null,
    selected: null,
    mode: 'clean',
    baseline: signatureOf(present),
    version,
    previousSaved: null,
  };
}

export function isDirty(state: ZoneState): boolean {
  return signatureOf(state.present) !== state.baseline;
}

export function canUndo(state: ZoneState): boolean {
  return state.past.length > 0;
}

function pushed(state: ZoneState, next: Draft): ZoneState {
  return {
    ...state,
    past: [...state.past, state.present],
    present: next,
    drag: null,
  };
}

function replacing(draft: Draft, shape: Shape): Draft {
  return draft.map((candidate) => (candidate.key === shape.key ? shape : candidate));
}

function added(state: ZoneState, bounds: Bounds): ZoneState {
  if (limitReason(state.present, state.mode) !== null) return state;
  const shape = defaultShape(state.mode, nextKey(state.present), bounds);
  return { ...pushed(state, [...state.present, shape]), selected: shape.key };
}

function removed(state: ZoneState, key: number): ZoneState {
  return {
    ...pushed(
      state,
      state.present.filter((shape) => shape.key !== key),
    ),
    selected: state.selected === key ? null : state.selected,
  };
}

function released(state: ZoneState): ZoneState {
  const { drag } = state;
  if (drag === null) return state;
  return sameDraft(drag.before, state.present)
    ? { ...state, drag: null }
    : { ...pushed({ ...state, present: drag.before }, state.present), selected: state.selected };
}

function sameDraft(left: Draft, right: Draft): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function synced(state: ZoneState, zones: VacuumScene['zones'], version: string): ZoneState {
  if (state.version === version) return state;
  const fresh = restrictedShapesOfScene(zones);
  const baseline = signatureOf(fresh);
  if (isDirty(state)) return { ...state, version, baseline };
  const clean = cleanShapes(state.present);
  const restricted = restrictedShapesOfScene(zones, nextKey(clean));
  const present = [...clean, ...restricted];
  return {
    ...state,
    present,
    past: [],
    drag: null,
    version,
    baseline,
    selected: present.some((shape) => shape.key === state.selected) ? state.selected : null,
  };
}

function restored(state: ZoneState, restricted: VacuumRestricted): ZoneState {
  const clean = cleanShapes(state.present);
  const present = [...clean, ...restrictedShapesOf(restricted, nextKey(clean))];
  return {
    ...state,
    present,
    past: [],
    drag: null,
    selected: null,
    baseline: signatureOf(present),
    previousSaved: null,
  };
}

function undone(state: ZoneState): ZoneState {
  const previous = state.past[state.past.length - 1];
  if (previous === undefined) return state;
  return {
    ...state,
    present: previous,
    past: state.past.slice(0, -1),
    drag: null,
    selected: previous.some((shape) => shape.key === state.selected) ? state.selected : null,
  };
}

function grabbed(state: ZoneState, grab: Omit<Drag, 'before'>): ZoneState {
  return { ...state, selected: grab.key, drag: { ...grab, before: state.present } };
}

function dragged(state: ZoneState, point: VacuumPoint, bounds: Bounds): ZoneState {
  const { drag } = state;
  const origin = drag?.before.find((shape) => shape.key === drag.key);
  if (drag === null || origin === undefined) return state;
  const shape =
    drag.handle === null
      ? moveShape(origin, point.x - drag.start.x, point.y - drag.start.y, bounds)
      : dragHandle(origin, drag.handle, point, bounds);
  return { ...state, present: replacing(drag.before, shape) };
}

function nudged(state: ZoneState, key: number, step: VacuumPoint, bounds: Bounds): ZoneState {
  const shape = state.present.find((candidate) => candidate.key === key);
  return shape === undefined
    ? state
    : pushed(state, replacing(state.present, nudgeShape(shape, step, bounds)));
}

type EditAction = Extract<
  ZoneAction,
  { readonly type: 'mode' | 'select' | 'add' | 'remove' | 'grab' | 'drag' | 'release' }
>;

type LaterAction = Exclude<ZoneAction, EditAction>;

function later(state: ZoneState, action: LaterAction): ZoneState {
  switch (action.type) {
    case 'replace':
      return pushed(state, replacing(state.present, action.shape));
    case 'nudge':
      return nudged(state, action.key, action.step, action.bounds);
    case 'undo':
      return undone(state);
    case 'sync':
      return synced(state, action.zones, action.version);
    case 'saved':
      return { ...state, baseline: signatureOf(state.present), previousSaved: action.previous };
    case 'restored':
      return restored(state, action.restricted);
  }
}

const EDIT_TYPES: ReadonlySet<ZoneAction['type']> = new Set([
  'mode',
  'select',
  'add',
  'remove',
  'grab',
  'drag',
  'release',
]);

function isEdit(action: ZoneAction): action is EditAction {
  return EDIT_TYPES.has(action.type);
}

function edited(state: ZoneState, action: EditAction): ZoneState {
  switch (action.type) {
    case 'mode':
      return { ...state, mode: action.mode };
    case 'select':
      return { ...state, selected: action.key };
    case 'add':
      return added(state, action.bounds);
    case 'remove':
      return removed(state, action.key);
    case 'grab':
      return grabbed(state, action);
    case 'drag':
      return dragged(state, action.point, action.bounds);
    case 'release':
      return released(state);
  }
}

export function zoneReducer(state: ZoneState, action: ZoneAction): ZoneState {
  return isEdit(action) ? edited(state, action) : later(state, action);
}
