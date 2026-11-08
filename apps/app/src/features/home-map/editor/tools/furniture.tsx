import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import {
  HOME_MAP_OBJECT_WRITE,
  placementFacts,
  type HomeMap,
  type HomeMapFloor,
  type HomeMapObject,
  type HomeMapOp,
  type HomeMapVec,
  type ModelCatalogRow,
  type ModelSpec,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { boxOf, type SpecOf } from '../../../../components/house-map/edit/furniture-box';
import { objectOp } from '../../../../components/house-map/edit/ops';
import { useModelCatalog, useModelSpecs } from '../../../models';
import { objectTitle } from '../list-editor/objects-devices-model';
import { nearestFreeSpot } from '../manipulate/object-actions';
import type { DeviceRoomFlow } from './device-room-flow';
import {
  NO_ROOM_TEXT,
  NO_SPOT_TEXT,
  furnitureRows,
  pieceElement,
  pieceElevation,
  targetRoom,
} from './furniture-model';
import { isWallModel, sizeOf, wallMovePatch, wallPlaceOp, wallSpotAt } from './wall-place';

export interface FurnitureInput {
  readonly map: HomeMap;
  readonly floorId: string | null;
  readonly readOnly: boolean;
  readonly selected: string | null;
  readonly onSelect: (id: string) => void;
  readonly edit: (ops: readonly HomeMapOp[]) => Promise<unknown>;
  readonly onClear: () => void;
  readonly roomFlow: DeviceRoomFlow;
}

export type TopAt = (point: HomeMapVec) => number;

export interface PlaceRequest {
  readonly row: ModelCatalogRow;
  readonly spec: ModelSpec;
  readonly at: HomeMapVec | null;
  readonly rotation: number;
  readonly topAt: TopAt;
}

export interface FurnitureTool {
  readonly floor: HomeMapFloor | null;
  readonly rows: readonly ModelCatalogRow[];
  readonly readOnly: boolean;
  readonly selected: HomeMapObject | null;
  readonly selectedId: string | null;
  readonly notice: string | null;
  readonly notify: (notice: string | null) => void;
  readonly specOf: SpecOf;
  readonly nameOf: (id: string) => string;
  readonly place: (request: PlaceRequest) => boolean;
  readonly select: (id: string) => void;
  readonly send: (ops: readonly HomeMapOp[]) => void;
  readonly patch: (id: string, patch: Partial<HomeMapObject>) => void;
  readonly remove: (id: string) => void;
  readonly clear: () => void;
  readonly roomFlow: DeviceRoomFlow;
}

function useSpecOf(floor: HomeMapFloor | null, rows: readonly ModelCatalogRow[]): SpecOf {
  const ids: readonly string[] = [
    ...new Set((floor?.objects ?? []).map((item): string => item.modelId)),
  ];
  const hashes = ids.map((id) => rows.find((row) => row.id === id)?.spec_sha256 ?? null);
  const specs = useModelSpecs(hashes);
  return (modelId) => {
    const state = specs[ids.indexOf(modelId)];
    return state?.status === 'ready' ? state.value : undefined;
  };
}

const UNNAMED = 'piece';

function nameOf(floor: HomeMapFloor | null, rows: readonly ModelCatalogRow[], id: string): string {
  const object = floor?.objects.find((item) => item.id === id);
  if (object === undefined) return UNNAMED;
  return objectTitle(object, rows.find((row) => row.id === object.modelId)?.title);
}

function onWalls(floor: HomeMapFloor, specOf: SpecOf, op: HomeMapOp): HomeMapOp {
  if (op.op !== 'update' || op.kind !== 'object') return op;
  const at = HOME_MAP_OBJECT_WRITE.shape.at.safeParse(op.patch['at']);
  const object = floor.objects.find((item) => item.id === op.id);
  if (!at.success || op.patch['wall'] !== undefined || object === undefined) return op;
  if (!isWallModel(object.modelId, specOf(object.modelId))) return op;
  const moved = wallMovePatch(floor, object, at.data, specOf);
  return moved === null ? op : { ...op, patch: { ...op.patch, ...moved } };
}

export type PlaceResult =
  | { readonly kind: 'op'; readonly op: HomeMapOp }
  | { readonly kind: 'blocked'; readonly notice: string };

export interface PlaceScene {
  readonly floor: HomeMapFloor;
  readonly selected: string | null;
  readonly specOf: SpecOf;
  readonly id: string;
}

const blocked = (notice: string): PlaceResult => ({ kind: 'blocked', notice });

const added = (floor: HomeMapFloor, element: HomeMapObject): PlaceResult => ({
  kind: 'op',
  op: { op: 'add', kind: 'object', floorId: floor.id, element },
});

function only(request: PlaceRequest): SpecOf {
  return (modelId) => (modelId === request.row.id ? request.spec : undefined);
}

function wallDrop(scene: PlaceScene, request: PlaceRequest, at: HomeMapVec): PlaceResult {
  const { row, spec } = request;
  const spot = wallSpotAt(scene.floor, at, sizeOf(row.id, only(request)));
  if (spot === null) return blocked(NO_SPOT_TEXT);
  const elevation = placementFacts(row.id, spec)?.defaultHeightM ?? 0;
  const pose = { id: scene.id, modelId: row.id, spec, at: spot.at, rotation: spot.rotation };
  return added(scene.floor, { ...pieceElement({ ...pose, elevation }), wall: spot.wall });
}

export function dropResult(scene: PlaceScene, request: PlaceRequest, at: HomeMapVec): PlaceResult {
  const { row, spec } = request;
  if (isWallModel(row.id, spec)) return wallDrop(scene, request, at);
  const elevation = pieceElevation(row.id, spec, request.topAt(at));
  const pose = { id: scene.id, modelId: row.id, spec, at, rotation: request.rotation };
  return added(scene.floor, pieceElement({ ...pose, elevation }));
}

export function middleResult(scene: PlaceScene, request: PlaceRequest): PlaceResult {
  const { floor, specOf, id } = scene;
  const { row, spec } = request;
  const room = targetRoom(floor, scene.selected);
  if (room === null) return blocked(NO_ROOM_TEXT);
  if (isWallModel(row.id, spec)) {
    const op = wallPlaceOp({ floor, room, modelId: row.id, spec, id, specOf });
    return op === null ? blocked(NO_SPOT_TEXT) : { kind: 'op', op };
  }
  const origin = room.labelAt;
  const draft = pieceElement({ id, modelId: row.id, spec, at: origin, rotation: 0, elevation: 0 });
  const others = floor.objects
    .filter((item) => item.wall === undefined)
    .map((item) => boxOf(item, specOf));
  const box = boxOf(draft, only(request));
  const at = nearestFreeSpot({ box, origin, room, others }, true);
  if (at === null) return blocked(NO_SPOT_TEXT);
  const elevation = pieceElevation(row.id, spec, request.topAt(at));
  return added(floor, { ...draft, at: { x: at.x, y: at.y }, elevation });
}

export function placeResult(scene: PlaceScene, request: PlaceRequest): PlaceResult {
  return request.at === null
    ? middleResult(scene, request)
    : dropResult(scene, request, request.at);
}

interface Editing {
  readonly input: FurnitureInput;
  readonly floor: HomeMapFloor | null;
  readonly specOf: SpecOf;
  readonly send: (ops: readonly HomeMapOp[]) => void;
  readonly setNotice: (notice: string | null) => void;
}

function placer(editing: Editing): (request: PlaceRequest) => boolean {
  const { input, floor, specOf } = editing;
  return (request) => {
    if (input.readOnly || floor === null) return false;
    const id = randomUUID();
    const result = placeResult({ floor, selected: input.selected, specOf, id }, request);
    if (result.kind === 'blocked') {
      editing.setNotice(result.notice);
      return false;
    }
    editing.setNotice(null);
    editing.send([result.op]);
    input.onSelect(id);
    return true;
  };
}

export function useFurnitureTool(input: FurnitureInput): FurnitureTool {
  const catalog = useModelCatalog();
  const rows = furnitureRows(catalog.rows);
  const floor = input.map.floors.find((item) => item.id === input.floorId) ?? null;
  const specOf = useSpecOf(floor, catalog.rows);
  const [notice, setNotice] = useState<string | null>(null);
  const send = (ops: readonly HomeMapOp[]): void => {
    if (input.readOnly) return;
    const sent = floor === null ? ops : ops.map((op) => onWalls(floor, specOf, op));
    background(input.edit(sent), 'home_map.furniture_edit_failed');
  };
  return {
    floor,
    rows,
    readOnly: input.readOnly,
    selected: floor?.objects.find((item) => item.id === input.selected) ?? null,
    selectedId: input.selected,
    notice,
    notify: setNotice,
    specOf,
    nameOf: (id): string => nameOf(floor, rows, id),
    place: placer({ input, floor, specOf, send, setNotice }),
    select: input.onSelect,
    send,
    patch: (id, patch): void => {
      if (floor !== null) send([objectOp(floor.id, id, patch)]);
    },
    remove: (id): void => {
      if (floor !== null) send([{ op: 'remove', kind: 'object', floorId: floor.id, id }]);
      input.onClear();
    },
    clear: input.onClear,
    roomFlow: input.roomFlow,
  };
}
