import {
  HOME_MAP_OBJECT_WRITE,
  homeMapMountOnWall,
  homeMapRoomAt,
  homeMapWallLength,
  homeMapWallPose,
  placementFacts,
  type HomeMapFloor,
  type HomeMapObject,
  type HomeMapOp,
  type HomeMapRoom,
  type HomeMapVec,
  type HomeMapWall,
  type HomeMapWallAttachment,
  type ModelCatalogRow,
  type ModelSpec,
} from '@smarteverything/domain';
import type { SpecOf } from '../../../../components/house-map/edit/furniture-box';
import {
  offFace,
  wallSeat,
  type WallSize,
  type WallSpot,
} from '../../../../components/house-map/edit/wall-seat';
import type { IconName } from '../../../../components/icon-glyphs';
import type { ModelAssetState } from '../../../models';
import { roomTitle, type HubRoom } from '../list-editor/rooms-walls-model';
import { categoryIcon, placeOp, sizeText, type PlaceInput } from './furniture-model';

export const WALL_CATEGORY = 'wall-objects';
export const WALL_CATEGORY_LABEL = 'Wall objects';
export const WALL_GRID_M = 0.1;
export const WALL_FINE_M = 0.01;
export const OTHER_SIDE_TEXT = 'Other side';
export const OUTSIDE_SIDE_TEXT = 'Outside';

const PROBE_M = 0.05;

type WallFloor = Pick<HomeMapFloor, 'walls' | 'rooms'>;

export type { WallSize, WallSpot } from '../../../../components/house-map/edit/wall-seat';

export function isWallModel(modelId: string, spec: ModelSpec | undefined): boolean {
  return placementFacts(modelId, spec)?.mount === 'wall';
}

export function wallChipIcon(id: string): IconName {
  return id === WALL_CATEGORY ? 'lamp' : categoryIcon(id);
}

export function wallRowText(row: ModelCatalogRow, spec: ModelSpec): string | null {
  const facts = placementFacts(row.id, spec);
  if (facts?.mount !== 'wall') return null;
  return `On the wall · ${facts.defaultHeightM.toFixed(2)} m up · ${sizeText(spec)}`;
}

export function wallRowIds(
  rows: readonly ModelCatalogRow[],
  specs: readonly ModelAssetState<ModelSpec>[],
): ReadonlySet<string> {
  return new Set(
    rows.flatMap((row, at) => {
      const spec = specs[at];
      return spec?.status === 'ready' && isWallModel(row.id, spec.value) ? [row.id] : [];
    }),
  );
}

export function sizeOf(modelId: string, specOf: SpecOf): WallSize {
  const footprint = placementFacts(modelId, specOf(modelId))?.footprint;
  return { width: footprint?.w ?? 0, depth: footprint?.d ?? 0 };
}

export function wallSpotAt(floor: WallFloor, point: HomeMapVec, size: WallSize): WallSpot | null {
  const mount = homeMapMountOnWall(floor.walls, floor.rooms, point);
  if (mount === null) return null;
  return wallSeat(mount.wall, mount.attachment, size);
}

export function wallOf(floor: WallFloor, wallId: string | undefined): HomeMapWall | null {
  return floor.walls.find((wall) => wall.id === wallId) ?? null;
}

export function wallPlaceOp(input: PlaceInput): HomeMapOp | null {
  const op = placeOp(input);
  if (op?.op !== 'add' || op.kind !== 'object') return op;
  const placed = HOME_MAP_OBJECT_WRITE.parse(op.element);
  const facts = placementFacts(input.modelId, input.spec);
  const size = sizeOf(input.modelId, (id) => (id === input.modelId ? input.spec : undefined));
  const spot = wallSpotAt(input.floor, placed.at, size);
  const elevation = facts?.defaultHeightM ?? placed.elevation;
  const element: HomeMapObject =
    spot === null
      ? { ...placed, elevation }
      : { ...placed, at: spot.at, rotation: spot.rotation, wall: spot.wall, elevation };
  return { ...op, element };
}

export function wallMovePatch(
  floor: WallFloor,
  object: HomeMapObject,
  pointer: HomeMapVec,
  specOf: SpecOf,
): Partial<HomeMapObject> | null {
  const spot = wallSpotAt(floor, pointer, sizeOf(object.modelId, specOf));
  return spot === null ? null : { at: spot.at, rotation: spot.rotation, wall: spot.wall };
}

export function wallAttachPatch(
  floor: WallFloor,
  attachment: HomeMapWallAttachment,
  change: Partial<Pick<HomeMapWallAttachment, 'offset' | 'side'>>,
  size: WallSize,
): WallSpot | null {
  const wall = wallOf(floor, attachment.wallId);
  return wall === null ? null : wallSeat(wall, { ...attachment, ...change }, size);
}

export function centreOffset(wall: HomeMapWall): number {
  return homeMapWallLength(wall) / 2;
}

export function stepOffset(offset: number, step: number): number {
  return Math.round(offset / step) * step;
}

function roomOnSide(
  floor: WallFloor,
  wall: HomeMapWall,
  attachment: HomeMapWallAttachment,
): HomeMapRoom | null {
  const pose = homeMapWallPose(wall, attachment);
  if (pose === null) return null;
  const probe = offFace(pose.at, pose.normal, PROBE_M * 2);
  return homeMapRoomAt(floor.rooms, probe);
}

export function facingOf(
  floor: WallFloor,
  wall: HomeMapWall,
  attachment: HomeMapWallAttachment,
  hubRooms: readonly HubRoom[],
): string {
  const room = roomOnSide(floor, wall, attachment);
  if (room === null) return OUTSIDE_SIDE_TEXT;
  return `Into ${roomTitle(room, hubRooms, floor.rooms.indexOf(room))}`;
}

export function wallHeightOf(wall: HomeMapWall | null, floor: { ceilingHeight: number }): number {
  return wall?.height ?? floor.ceilingHeight;
}
