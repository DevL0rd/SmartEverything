import type { HomeMap, HomeMapFloor } from './home-map';
import { EDIT_KINDS, type EditRecord } from './home-map-edit-kinds';
import type { HomeMapEditKind, HomeMapOp } from './home-map-edit-ops';

export interface HomeMapDiff {
  readonly ops: readonly HomeMapOp[];
  readonly inverse: readonly HomeMapOp[];
}

interface ListPlan {
  readonly removes: readonly HomeMapOp[];
  readonly updates: readonly HomeMapOp[];
  readonly adds: readonly HomeMapOp[];
  readonly dropped: ReadonlySet<string>;
}

type FloorKind = 'room' | 'wall' | 'opening' | 'object' | 'placement' | 'annotation';

type Forced = (element: EditRecord) => boolean;

const REMOVE_ORDER = [
  'opening',
  'placement',
  'annotation',
  'object',
  'room',
  'wall',
] as const satisfies readonly FloorKind[];

const ADD_ORDER = [
  'wall',
  'room',
  'object',
  'annotation',
  'placement',
  'opening',
] as const satisfies readonly FloorKind[];

const FLOOR_FIELDS = ['name', 'level', 'elevation', 'ceilingHeight'] as const;

const META_FIELDS = ['name', 'north'] as const;

const NOT_FORCED: Forced = () => false;

const isList = (value: unknown): value is readonly unknown[] => Array.isArray(value);

const isRecord = (value: unknown): value is EditRecord =>
  typeof value === 'object' && value !== null && !isList(value);

const definedKeys = (record: EditRecord): string[] =>
  Object.keys(record).filter((key) => record[key] !== undefined);

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (isList(a) || isList(b)) {
    return isList(a) && isList(b) && a.length === b.length && a.every((v, i) => same(v, b[i]));
  }
  if (!isRecord(a) || !isRecord(b)) return false;
  const keys = new Set([...definedKeys(a), ...definedKeys(b)]);
  return [...keys].every((key) => same(a[key], b[key]));
}

const withFloor = (floorId: string | undefined): { floorId?: string } =>
  floorId === undefined ? {} : { floorId };

const pick = (source: EditRecord, keys: readonly string[]): EditRecord =>
  Object.fromEntries(keys.map((key) => [key, source[key]]));

const idOf = (kind: HomeMapEditKind, element: EditRecord): string => {
  const value = element[EDIT_KINDS[kind].key];
  return typeof value === 'string' ? value : '';
};

function needsReplace(kind: HomeMapEditKind, before: EditRecord, after: EditRecord): boolean {
  const lostKey = definedKeys(before).some((key) => after[key] === undefined);
  const kindChanged = kind === 'annotation' && before['kind'] !== after['kind'];
  return lostKey || kindChanged || before['wallId'] !== after['wallId'];
}

function longestIncreasing(values: readonly number[]): ReadonlySet<number> {
  const length: number[] = [];
  const parent: number[] = [];
  let best = -1;
  values.forEach((value, at) => {
    let run = 1;
    let from = -1;
    values.slice(0, at).forEach((earlier, before) => {
      const candidate = (length[before] ?? 0) + 1;
      if (earlier < value && candidate > run) {
        run = candidate;
        from = before;
      }
    });
    length.push(run);
    parent.push(from);
    if (best < 0 || run > (length[best] ?? 0)) best = at;
  });
  const keep = new Set<number>();
  for (let at = best; at >= 0; at = parent[at] ?? -1) keep.add(at);
  return keep;
}

interface Survivor {
  readonly before: EditRecord;
  readonly after: EditRecord;
  readonly target: number;
}

function survivorsOf(
  kind: HomeMapEditKind,
  before: readonly EditRecord[],
  after: readonly EditRecord[],
  forced: Forced,
): readonly Survivor[] {
  const found = new Map(after.map((element, target) => [idOf(kind, element), { element, target }]));
  const common = before.flatMap((element): Survivor[] => {
    const match = found.get(idOf(kind, element));
    if (match === undefined || forced(element)) return [];
    if (needsReplace(kind, element, match.element)) return [];
    return [{ before: element, after: match.element, target: match.target }];
  });
  const keep = longestIncreasing(common.map((survivor) => survivor.target));
  return common.filter((_, at) => keep.has(at));
}

function patchOf(before: EditRecord, after: EditRecord): EditRecord | null {
  const changed = definedKeys(after).filter((key) => !same(before[key], after[key]));
  if (changed.length === 0) return null;
  const keys = 'origin' in after ? [...new Set([...changed, 'origin'])] : changed;
  return pick(after, keys);
}

interface Scope {
  readonly kind: HomeMapEditKind;
  readonly floorId: string | undefined;
  readonly forced: Forced;
}

function planList(
  scope: Scope,
  before: readonly EditRecord[],
  after: readonly EditRecord[],
): ListPlan {
  const { kind, floorId, forced } = scope;
  const kept = survivorsOf(kind, before, after, forced);
  const keptIds = new Set(kept.map((survivor) => idOf(kind, survivor.before)));
  const dropped = new Set(
    before.map((element) => idOf(kind, element)).filter((id) => !keptIds.has(id)),
  );
  const removes = [...dropped].map((id): HomeMapOp => ({
    op: 'remove',
    kind,
    ...withFloor(floorId),
    id,
  }));
  const updates = kept.flatMap((survivor): HomeMapOp[] => {
    const patch = patchOf(survivor.before, survivor.after);
    const id = idOf(kind, survivor.before);
    return patch === null ? [] : [{ op: 'update', kind, ...withFloor(floorId), id, patch }];
  });
  const adds = after.flatMap((element, index): HomeMapOp[] =>
    keptIds.has(idOf(kind, element))
      ? []
      : [{ op: 'add', kind, ...withFloor(floorId), element, index }],
  );
  return { removes, updates, adds, dropped };
}

function planFloor(before: HomeMapFloor, after: HomeMapFloor): Record<FloorKind, ListPlan> {
  const scope = (kind: FloorKind, forced: Forced = NOT_FORCED): Scope => ({
    kind,
    floorId: before.id,
    forced,
  });
  const wall = planList(scope('wall'), before.walls, after.walls);
  const onDroppedWall: Forced = (element) => {
    const wallId = element['wallId'];
    return typeof wallId === 'string' && wall.dropped.has(wallId);
  };
  return {
    wall,
    opening: planList(scope('opening', onDroppedWall), before.openings, after.openings),
    room: planList(scope('room'), before.rooms, after.rooms),
    object: planList(scope('object'), before.objects, after.objects),
    placement: planList(scope('placement'), before.placements, after.placements),
    annotation: planList(scope('annotation'), before.annotations, after.annotations),
  };
}

interface FloorOps {
  readonly removes: readonly HomeMapOp[];
  readonly updates: readonly HomeMapOp[];
  readonly adds: readonly HomeMapOp[];
}

function floorOps(from: HomeMap, to: HomeMap): FloorOps {
  const targets = new Map(to.floors.map((floor) => [floor.id, floor]));
  const pairs = from.floors.flatMap((before) => {
    const after = targets.get(before.id);
    return after === undefined ? [] : [planFloor(before, after)];
  });
  return {
    removes: pairs.flatMap((plan) => REMOVE_ORDER.flatMap((kind) => plan[kind].removes)),
    updates: pairs.flatMap((plan) => ADD_ORDER.flatMap((kind) => plan[kind].updates)),
    adds: pairs.flatMap((plan) => ADD_ORDER.flatMap((kind) => plan[kind].adds)),
  };
}

function structureOps(from: HomeMap, to: HomeMap): readonly HomeMapOp[] {
  const keptIds = new Set(to.floors.map((floor) => floor.id));
  const hadIds = new Set(from.floors.map((floor) => floor.id));
  const removed = from.floors.filter((floor) => !keptIds.has(floor.id));
  const added = to.floors.filter((floor) => !hadIds.has(floor.id));
  const order = [...from.floors.filter((f) => keptIds.has(f.id)), ...added].map((f) => f.id);
  const wanted = to.floors.map((floor) => floor.id);
  return [
    ...removed.map((floor): HomeMapOp => ({ op: 'removeFloor', floorId: floor.id })),
    ...added.map((floor): HomeMapOp => ({ op: 'addFloor', floor })),
    ...(same(order, wanted) ? [] : [{ op: 'reorderFloors', order: wanted } satisfies HomeMapOp]),
  ];
}

function fieldOps(from: HomeMap, to: HomeMap): readonly HomeMapOp[] {
  const mapPatch = patchOf(pick(from, META_FIELDS), pick(to, META_FIELDS));
  const floors = from.floors.flatMap((before): HomeMapOp[] => {
    const after = to.floors.find((floor) => floor.id === before.id);
    if (after === undefined) return [];
    const patch = patchOf(pick(before, FLOOR_FIELDS), pick(after, FLOOR_FIELDS));
    return patch === null ? [] : [{ op: 'setFloor', floorId: before.id, patch }];
  });
  return [...floors, ...(mapPatch === null ? [] : [{ op: 'setMap', patch: mapPatch } as const])];
}

function mapListPlan(from: HomeMap, to: HomeMap, kind: 'source' | 'notice'): ListPlan {
  const scope: Scope = { kind, floorId: undefined, forced: NOT_FORCED };
  return kind === 'source'
    ? planList(scope, from.sources, to.sources)
    : planList(scope, from.notices, to.notices);
}

function opsBetween(from: HomeMap, to: HomeMap): readonly HomeMapOp[] {
  const floors = floorOps(from, to);
  const lists = [mapListPlan(from, to, 'source'), mapListPlan(from, to, 'notice')];
  return [
    ...floors.removes,
    ...lists.flatMap((plan) => plan.removes),
    ...structureOps(from, to),
    ...fieldOps(from, to),
    ...floors.updates,
    ...floors.adds,
    ...lists.flatMap((plan) => [...plan.updates, ...plan.adds]),
  ];
}

export function diffHomeMaps(from: HomeMap, to: HomeMap): HomeMapDiff {
  return { ops: opsBetween(from, to), inverse: opsBetween(to, from) };
}
