import { HOME_MAP, HOME_MAP_FLOOR, type HomeMap, type HomeMapFloor } from './home-map';
import { EDIT_KINDS, type EditRecord } from './home-map-edit-kinds';
import {
  HOME_MAP_FLOOR_PATCH,
  HOME_MAP_META_PATCH,
  homeMapActorKind,
  type HomeMapActor,
  type HomeMapConflictReason,
  type HomeMapEditConflict,
  type HomeMapEditKind,
  type HomeMapOp,
} from './home-map-edit-ops';
import { HOME_MAP_ORIGIN } from './home-map-elements';
import { removeScan, setScan, setScanTransform } from './home-map-scan-edits';

export interface HomeMapEditContext {
  readonly actor: HomeMapActor;
  readonly at: string;
}

export interface HomeMapEditResult {
  readonly map: HomeMap;
  readonly applied: readonly HomeMapOp[];
  readonly inverse: readonly HomeMapOp[];
  readonly conflicts: readonly HomeMapEditConflict[];
}

interface Done {
  readonly map: HomeMap;
  readonly inverse: readonly HomeMapOp[];
}

interface Refused {
  readonly refused: HomeMapConflictReason;
  readonly kind: string | null;
  readonly id: string | null;
}

type Step = Done | Refused;

interface Target {
  readonly kind: HomeMapEditKind;
  readonly floorId?: string | undefined;
  readonly id: string;
}

type OpOf<Name extends HomeMapOp['op']> = Extract<HomeMapOp, { op: Name }>;

const refuse = (
  refused: HomeMapConflictReason,
  kind: string | null,
  id: string | null,
): Refused => ({
  refused,
  kind,
  id,
});

const withFloor = (floorId: string | undefined): { floorId?: string } =>
  floorId === undefined ? {} : { floorId };

const pick = (source: EditRecord, keys: readonly string[]): EditRecord =>
  Object.fromEntries(keys.map((key) => [key, source[key]]));

const insertAt = (
  list: readonly EditRecord[],
  element: EditRecord,
  index: number | undefined,
): readonly EditRecord[] => {
  const at = index === undefined ? list.length : Math.min(index, list.length);
  return [...list.slice(0, at), element, ...list.slice(at)];
};

const idOf = (kind: HomeMapEditKind, element: EditRecord): string | null => {
  const value = element[EDIT_KINDS[kind].key];
  return typeof value === 'string' ? value : null;
};

const removeOp = (kind: HomeMapEditKind, floorId: string | undefined, id: string): HomeMapOp => ({
  op: 'remove',
  kind,
  ...withFloor(floorId),
  id,
});

const addOp = (
  kind: HomeMapEditKind,
  floorId: string | undefined,
  element: EditRecord,
  index: number,
): HomeMapOp => ({ op: 'add', kind, ...withFloor(floorId), element, index });

function addElement(map: HomeMap, op: OpOf<'add'>): Step {
  const kind = EDIT_KINDS[op.kind];
  const list = kind.list(map, op.floorId);
  if (!list) return refuse('missing_floor', op.kind, null);
  const written = kind.write.safeParse(op.element);
  const id = written.success ? idOf(op.kind, written.data) : null;
  if (!written.success || id === null) return refuse('invalid', op.kind, null);
  const taken = kind.global ? kind.global(map, id) : list.some((el) => el[kind.key] === id);
  if (taken) return refuse('exists', op.kind, id);
  const blocked = kind.requires(map, op.floorId, written.data);
  if (blocked) return refuse(blocked, op.kind, id);
  const next = kind.put(map, op.floorId, insertAt(list, written.data, op.index));
  if (!next) return refuse('invalid', op.kind, id);
  return { map: next, inverse: [removeOp(op.kind, op.floorId, id)] };
}

function withOverride(
  before: EditRecord,
  patch: EditRecord,
  context: HomeMapEditContext,
): EditRecord {
  if (homeMapActorKind(context.actor) === 'source' || 'origin' in patch) return patch;
  const origin = HOME_MAP_ORIGIN.safeParse(before['origin']);
  if (!origin.success || origin.data.kind !== 'source') return patch;
  const overridden = [...new Set([...origin.data.overridden, ...Object.keys(patch)])];
  return { ...patch, origin: { ...origin.data, overridden } };
}

function patchElement(
  map: HomeMap,
  target: Target,
  patch: EditRecord,
  context: HomeMapEditContext,
): Step {
  const kind = EDIT_KINDS[target.kind];
  const list = kind.list(map, target.floorId);
  if (!list) return refuse('missing_floor', target.kind, target.id);
  const index = list.findIndex((el) => el[kind.key] === target.id);
  const before = list[index];
  if (before === undefined) return refuse('missing_element', target.kind, target.id);
  const checked = kind.patch.safeParse(patch);
  if (!checked.success || kind.key in checked.data) {
    return refuse('invalid', target.kind, target.id);
  }
  const change = withOverride(before, checked.data, context);
  const merged = { ...before, ...change };
  const blocked = kind.requires(map, target.floorId, merged);
  if (blocked) return refuse(blocked, target.kind, target.id);
  const next = kind.put(
    map,
    target.floorId,
    list.map((el, at) => (at === index ? merged : el)),
  );
  if (!next) return refuse('invalid', target.kind, target.id);
  const restore = pick(before, Object.keys(change));
  const inverse: HomeMapOp = {
    op: 'update',
    kind: target.kind,
    ...withFloor(target.floorId),
    id: target.id,
    patch: restore,
  };
  return { map: next, inverse: [inverse] };
}

function moveElement(map: HomeMap, op: OpOf<'move'>, context: HomeMapEditContext): Step {
  const kind = EDIT_KINDS[op.kind];
  const target = { kind: op.kind, floorId: op.floorId, id: op.id };
  const before = kind.list(map, op.floorId)?.find((el) => el[kind.key] === op.id);
  if (before === undefined) return patchElement(map, target, {}, context);
  const floor = map.floors.find((candidate) => candidate.id === op.floorId);
  const shifted = kind.shift?.(before, op.dx, op.dy, floor) ?? null;
  if (shifted === 'locked') return refuse('locked', op.kind, op.id);
  if (shifted === null) return refuse('invalid', op.kind, op.id);
  return patchElement(map, target, shifted, context);
}

function dropDependentOpenings(map: HomeMap, floorId: string | undefined, wallId: string): Step {
  const openings = EDIT_KINDS.opening;
  const list = openings.list(map, floorId) ?? [];
  const next = openings.put(
    map,
    floorId,
    list.filter((opening) => opening['wallId'] !== wallId),
  );
  if (!next) return refuse('invalid', 'opening', null);
  const inverse = list.flatMap((opening, index) =>
    opening['wallId'] === wallId ? [addOp('opening', floorId, opening, index)] : [],
  );
  return { map: next, inverse };
}

function removeElement(map: HomeMap, op: OpOf<'remove'>): Step {
  const kind = EDIT_KINDS[op.kind];
  const list = kind.list(map, op.floorId);
  if (!list) return refuse('missing_floor', op.kind, op.id);
  const index = list.findIndex((el) => el[kind.key] === op.id);
  const removed = list[index];
  if (removed === undefined) return refuse('missing_element', op.kind, op.id);
  const dependents: Step =
    op.kind === 'wall' ? dropDependentOpenings(map, op.floorId, op.id) : { map, inverse: [] };
  if ('refused' in dependents) return dependents;
  const next = kind.put(
    dependents.map,
    op.floorId,
    list.filter((_, at) => at !== index),
  );
  if (!next) return refuse('invalid', op.kind, op.id);
  return {
    map: next,
    inverse: [addOp(op.kind, op.floorId, removed, index), ...dependents.inverse],
  };
}

function addFloor(map: HomeMap, op: OpOf<'addFloor'>): Step {
  const parsed = HOME_MAP_FLOOR.safeParse(op.floor);
  if (!parsed.success) return refuse('invalid', 'floor', null);
  const floor = parsed.data;
  if (map.floors.some((candidate) => candidate.id === floor.id)) {
    return refuse('exists', 'floor', floor.id);
  }
  const at = op.index === undefined ? map.floors.length : Math.min(op.index, map.floors.length);
  const floors = [...map.floors.slice(0, at), floor, ...map.floors.slice(at)];
  return { map: { ...map, floors }, inverse: [{ op: 'removeFloor', floorId: floor.id }] };
}

function removeFloor(map: HomeMap, op: OpOf<'removeFloor'>): Step {
  const index = map.floors.findIndex((floor) => floor.id === op.floorId);
  const removed = map.floors[index];
  if (removed === undefined) return refuse('missing_floor', 'floor', op.floorId);
  const floors = map.floors.filter((_, at) => at !== index);
  return { map: { ...map, floors }, inverse: [{ op: 'addFloor', floor: removed, index }] };
}

function setFloor(map: HomeMap, op: OpOf<'setFloor'>): Step {
  const before = map.floors.find((floor) => floor.id === op.floorId);
  if (before === undefined) return refuse('missing_floor', 'floor', op.floorId);
  const checked = HOME_MAP_FLOOR_PATCH.safeParse(op.patch);
  if (!checked.success) return refuse('invalid', 'floor', op.floorId);
  const merged = HOME_MAP_FLOOR.safeParse({ ...before, ...checked.data });
  if (!merged.success) return refuse('invalid', 'floor', op.floorId);
  const floor = merged.data;
  const floors = map.floors.map((candidate) => (candidate === before ? floor : candidate));
  const patch = pick(before, Object.keys(checked.data));
  return { map: { ...map, floors }, inverse: [{ op: 'setFloor', floorId: op.floorId, patch }] };
}

function reorderFloors(map: HomeMap, op: OpOf<'reorderFloors'>): Step {
  const byId = new Map(map.floors.map((floor): [string, HomeMapFloor] => [floor.id, floor]));
  const floors = op.order.map((id) => byId.get(id));
  const complete =
    op.order.length === map.floors.length && new Set(op.order).size === op.order.length;
  const ordered = floors.filter((floor) => floor !== undefined);
  if (!complete || ordered.length !== floors.length) return refuse('order_mismatch', 'floor', null);
  const previous = map.floors.map((floor) => floor.id);
  return { map: { ...map, floors: ordered }, inverse: [{ op: 'reorderFloors', order: previous }] };
}

function setMap(map: HomeMap, op: OpOf<'setMap'>): Step {
  const checked = HOME_MAP_META_PATCH.safeParse(op.patch);
  if (!checked.success) return refuse('invalid', 'map', null);
  const merged = HOME_MAP.safeParse({ ...map, ...checked.data });
  if (!merged.success) return refuse('invalid', 'map', null);
  const patch = pick(map, Object.keys(checked.data));
  return { map: merged.data, inverse: [{ op: 'setMap', patch }] };
}

type MapLevelOp = Exclude<HomeMapOp, { op: 'add' | 'update' | 'remove' | 'move' }>;

function applyMapLevel(map: HomeMap, op: MapLevelOp): Step {
  switch (op.op) {
    case 'addFloor':
      return addFloor(map, op);
    case 'removeFloor':
      return removeFloor(map, op);
    case 'setFloor':
      return setFloor(map, op);
    case 'reorderFloors':
      return reorderFloors(map, op);
    case 'setMap':
      return setMap(map, op);
    case 'setScan':
      return setScan(map, op);
    case 'setScanTransform':
      return setScanTransform(map, op);
    case 'removeScan':
      return removeScan(map);
  }
}

type ElementOp = Exclude<HomeMapOp, MapLevelOp>;

const isElementOp = (op: HomeMapOp): op is ElementOp => 'kind' in op;

function applyElementOp(map: HomeMap, op: ElementOp, context: HomeMapEditContext): Step {
  switch (op.op) {
    case 'add':
      return addElement(map, op);
    case 'update':
      return patchElement(map, op, op.patch, context);
    case 'remove':
      return removeElement(map, op);
    case 'move':
      return moveElement(map, op, context);
  }
}

function applyOne(map: HomeMap, op: HomeMapOp, context: HomeMapEditContext): Step {
  return isElementOp(op) ? applyElementOp(map, op, context) : applyMapLevel(map, op);
}

const describe = (op: HomeMapOp): { kind: string | null; id: string | null } => {
  if ('kind' in op) return { kind: op.kind, id: 'id' in op ? op.id : null };
  if ('floorId' in op) return { kind: 'floor', id: op.floorId };
  return { kind: op.op === 'setMap' ? 'map' : 'floor', id: null };
};

export function applyHomeMapEdits(
  map: HomeMap,
  ops: readonly HomeMapOp[],
  context: HomeMapEditContext,
): HomeMapEditResult {
  let current = map;
  const applied: HomeMapOp[] = [];
  const conflicts: HomeMapEditConflict[] = [];
  let inverse: readonly HomeMapOp[] = [];
  for (const [index, op] of ops.entries()) {
    const step = applyOne(current, op, context);
    if ('refused' in step) {
      const target = describe(op);
      conflicts.push({
        index,
        op: op.op,
        kind: step.kind ?? target.kind,
        id: step.id ?? target.id,
        reason: step.refused,
      });
      continue;
    }
    current = step.map;
    applied.push(op);
    inverse = [...step.inverse, ...inverse];
  }
  if (applied.length === 0) return { map, applied, inverse, conflicts };
  const next = { ...current, revision: map.revision + 1, updatedAt: context.at };
  return { map: next, applied, inverse, conflicts };
}
