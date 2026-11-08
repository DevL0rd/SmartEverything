import {
  ApiError,
  HOME_MAP_NOTICE_WRITE,
  HOME_MAP_SOURCE_ID,
  type HomeMapFloor,
  type HomeMapOp,
  type HomeMapRoom,
  type HomeMapSourceGeometry,
} from '@smarteverything/domain';
import {
  FRAME_REFUSED_TEXT,
  FRAME_REALIGNED_TEXT,
  FRAME_RESIDUAL_M,
  fitRigidTransform,
  frameMoved,
  movedNoticeOps,
  polygonCentroid,
  type AlignPair,
  type RigidFit,
} from './merge/align';
import { firstImport, type FirstImportResult } from './merge/first-import';
import { matchRooms } from './merge/match';
import { planImport, type ImportInput } from './merge/pipeline';
import { estimateRectifyTransform } from './merge/rectify';
import { shapeDiffers } from './merge/reimport-rooms';

export interface ArrivalPlan {
  readonly kind: 'first' | 'adopted' | 'refused';
  readonly ops: readonly HomeMapOp[];
}

type Bound = ReadonlyMap<string, string>;

const refOf = (room: HomeMapRoom): string =>
  room.origin.kind === 'source' ? room.origin.ref : room.id;

const handKey = (room: HomeMapRoom): string => `hand:${room.id}`;

function pairsOf(
  hand: readonly HomeMapRoom[],
  geometry: HomeMapSourceGeometry,
  bound: Bound,
): readonly AlignPair[] {
  return [...bound].flatMap(([oldKey, newRef]): AlignPair[] => {
    const held = hand.find((room) => handKey(room) === oldKey);
    const found = geometry.rooms.find((room) => room.ref === newRef);
    const house = held === undefined ? null : polygonCentroid(held.polygon);
    const centre =
      found === undefined ? null : polygonCentroid({ outer: found.ring, holes: found.holes });
    return house === null || centre === null ? [] : [{ robot: centre, house }];
  });
}

function frameFit(pairs: readonly AlignPair[], matched: number): RigidFit | null | 'refused' {
  if (matched === 0) return 'refused';
  if (pairs.length < 2) return null;
  const fit = fitRigidTransform(pairs, false);
  return fit !== null && fit.rmsM >= FRAME_RESIDUAL_M ? 'refused' : fit;
}

const addOnFloor = (
  kind: 'room' | 'wall' | 'opening' | 'object' | 'placement',
  floorId: string,
  elements: readonly object[],
): readonly HomeMapOp[] =>
  elements.map((element): HomeMapOp => ({ op: 'add', kind, floorId, element: { ...element } }));

function structureOps(floorId: string, result: FirstImportResult): readonly HomeMapOp[] {
  return [
    ...addOnFloor('wall', floorId, result.walls),
    ...addOnFloor('opening', floorId, result.openings),
    ...addOnFloor('object', floorId, result.objects),
    ...addOnFloor('placement', floorId, result.placements),
  ];
}

function adoptedPlan(
  input: ImportInput,
  floor: HomeMapFloor,
  result: FirstImportResult,
  binding: { readonly bound: Bound; readonly extra: readonly HomeMapOp[] },
): ArrivalPlan {
  const { bound, extra } = binding;
  const taken = new Set(bound.values());
  const sourceId = HOME_MAP_SOURCE_ID.parse(input.sourceId);
  const adopt = [...bound].flatMap(([oldKey, newRef]): HomeMapOp[] => {
    const held = floor.rooms.find((room) => handKey(room) === oldKey);
    const found = result.rooms.find((room) => refOf(room) === newRef);
    if (held === undefined || found === undefined) return [];
    const overridden = shapeDiffers(found.polygon, held.polygon) ? ['polygon'] : [];
    const origin = { kind: 'source', sourceId, ref: newRef, overridden };
    return [{ op: 'update', kind: 'room', floorId: floor.id, id: held.id, patch: { origin } }];
  });
  const fresh = result.rooms.filter((room) => !taken.has(refOf(room)));
  return {
    kind: 'adopted',
    ops: [
      { op: 'add', kind: 'source', element: { ...result.source } },
      ...extra,
      ...adopt,
      ...addOnFloor('room', floor.id, fresh),
      ...structureOps(floor.id, result),
    ],
  };
}

function refusedPlan(input: ImportInput, result: FirstImportResult): ArrivalPlan {
  const { source } = result;
  const stub = {
    ...source,
    base: { ...source.base, rooms: [], walls: [], openings: [], carpets: [] },
  };
  const notice = HOME_MAP_NOTICE_WRITE.parse({
    id: input.newId(),
    kind: 'source_moved',
    elementId: input.sourceId,
    detail: FRAME_REFUSED_TEXT,
    createdAt: input.importedAt,
  });
  return {
    kind: 'refused',
    ops: [
      { op: 'add', kind: 'source', element: stub },
      { op: 'add', kind: 'notice', element: notice },
    ],
  };
}

function occupiedPlan(input: ImportInput, floor: HomeMapFloor): ArrivalPlan {
  const result = firstImport(input);
  const hand = floor.rooms.filter((room) => room.origin.kind === 'hand');
  const matching = matchRooms(
    hand.map((room) => ({ id: handKey(room), ref: handKey(room), polygon: room.polygon })),
    result.rooms.map((room) => ({ ref: refOf(room), polygon: room.polygon })),
  );
  const pairs = pairsOf(hand, input.geometry, matching.bound);
  const fit = frameFit(pairs, matching.bound.size);
  if (fit === 'refused') return refusedPlan(input, result);
  if (fit === null) return adoptedPlan(input, floor, result, { bound: matching.bound, extra: [] });
  const fitted = firstImport({ ...input, transform: fit.transform });
  const moved = frameMoved(estimateRectifyTransform(input.geometry), pairs, false);
  const notice = moved
    ? movedNoticeOps(input.map.notices, input.sourceId, FRAME_REALIGNED_TEXT, {
        createdAt: input.importedAt,
        newId: input.newId,
      })
    : [];
  return adoptedPlan(input, floor, fitted, { bound: matching.bound, extra: notice });
}

export function planArrival(input: ImportInput): ArrivalPlan {
  const floor = input.map.floors.find((candidate) => candidate.id === input.floorId);
  if (floor === undefined || floor.rooms.length === 0) {
    const plan = planImport(input);
    if (plan.kind !== 'first') {
      throw new ApiError('internal', 'A new robot map source must start with a first import.');
    }
    return { kind: 'first', ops: plan.ops };
  }
  return occupiedPlan(input, floor);
}
