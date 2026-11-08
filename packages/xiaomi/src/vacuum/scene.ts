import type { VacuumPose, VacuumScene, VacuumSlot } from '@smarteverything/domain';
import { decodeMapLayer } from './map-blob';
import type { MapDocument } from './map-document';
import { buildRooms } from './scene-rooms';

const MILLIMETRES_PER_METRE = 1000;
const MILLIRADIANS_PER_RADIAN = 1000;

export interface VacuumSceneSource {
  readonly map: MapDocument;
  readonly index: number;
  readonly slot: VacuumSlot;
  readonly fetchedAt: string;
}

type Bounds = VacuumScene['bounds'];

function poseOf(x: number, y: number, yaw: number): VacuumPose {
  return {
    x: x / MILLIMETRES_PER_METRE,
    y: y / MILLIMETRES_PER_METRE,
    yaw: yaw / MILLIRADIANS_PER_RADIAN,
  };
}

export function dockPose(map: MapDocument): VacuumPose | null {
  if (map.have_pile !== true || map.pile_x === undefined || map.pile_y === undefined) return null;
  return poseOf(map.pile_x, map.pile_y, map.pile_yaw ?? 0);
}

export function robotPose(map: MapDocument): VacuumPose | null {
  return map.position === undefined
    ? null
    : poseOf(map.position.x, map.position.y, map.position.yaw);
}

const FULL_TURN = 2 * Math.PI;

function wrapYaw(yaw: number): number {
  const wrapped = yaw % FULL_TURN;
  if (wrapped > Math.PI) return wrapped - FULL_TURN;
  if (wrapped <= -Math.PI) return wrapped + FULL_TURN;
  return wrapped;
}

export function toDockPoint(
  point: Readonly<{ x: number; y: number }>,
  dock: VacuumPose,
): { x: number; y: number } {
  const dx = point.x - dock.x;
  const dy = point.y - dock.y;
  const cos = Math.cos(dock.yaw);
  const sin = Math.sin(dock.yaw);
  return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
}

export function toDockPose(pose: VacuumPose, dock: VacuumPose): VacuumPose {
  return { ...toDockPoint(pose, dock), yaw: wrapYaw(pose.yaw - dock.yaw) };
}

interface Extent {
  readonly minColumn: number;
  readonly maxColumn: number;
  readonly minRow: number;
  readonly maxRow: number;
}

function contentExtent(map: MapDocument, cells: Uint8Array): Extent {
  const filled = cells.reduce<number[]>((found, value, cell) => {
    if (value !== 0) found.push(cell);
    return found;
  }, []);
  if (filled.length === 0) {
    return { minColumn: 0, maxColumn: map.width - 1, minRow: 0, maxRow: map.height - 1 };
  }
  const columns = filled.map((cell) => cell % map.width);
  const rows = filled.map((cell) => Math.floor(cell / map.width));
  return {
    minColumn: columns.reduce((a, b) => Math.min(a, b)),
    maxColumn: columns.reduce((a, b) => Math.max(a, b)),
    minRow: rows.reduce((a, b) => Math.min(a, b)),
    maxRow: rows.reduce((a, b) => Math.max(a, b)),
  };
}

export function sceneBounds(
  map: MapDocument,
  cells: Uint8Array,
  poses: readonly (VacuumPose | null)[],
): Bounds {
  const extent = contentExtent(map, cells);
  const cell = map.resolution / MILLIMETRES_PER_METRE;
  const originX = map.origin_x / MILLIMETRES_PER_METRE;
  const originY = map.origin_y / MILLIMETRES_PER_METRE;
  const bounds = {
    minX: originX + extent.minColumn * cell,
    minY: originY + extent.minRow * cell,
    maxX: originX + (extent.maxColumn + 1) * cell,
    maxY: originY + (extent.maxRow + 1) * cell,
  };
  return poses.reduce<Bounds>(
    (merged, pose) =>
      pose === null
        ? merged
        : {
            minX: Math.min(merged.minX, pose.x),
            minY: Math.min(merged.minY, pose.y),
            maxX: Math.max(merged.maxX, pose.x),
            maxY: Math.max(merged.maxY, pose.y),
          },
    bounds,
  );
}

export function buildVacuumScene(source: VacuumSceneSource): VacuumScene {
  const { map } = source;
  const cells = decodeMapLayer(map, 'map_data');
  const dock = dockPose(map);
  const robot = robotPose(map);
  return {
    index: source.index,
    slot: source.slot,
    name: map.map_name ?? null,
    fetchedAt: source.fetchedAt,
    bounds: sceneBounds(map, cells, [dock, robot]),
    rooms: buildRooms(map, cells),
    walls: [],
    doors: [],
    carpets: [],
    furniture: [],
    objects: [],
    zones: [],
    dock,
    robot,
    trail: [],
  };
}
