import type { VacuumRoom } from '@smarteverything/domain';
import { MapBlobError } from '../errors';
import { GRID_FIRST_ROOM, GRID_LAST_ROOM } from './map-blob';
import type { MapDocument } from './map-document';

export const SIMPLIFY_TOLERANCE_CELLS = 0.5;

const MILLIMETRES_PER_METRE = 1000;

export interface OutlinePoint {
  readonly x: number;
  readonly y: number;
}

export type EdgeMap = Map<number, number[]>;

interface RoomGrid {
  readonly cells: number[];
  readonly edges: EdgeMap;
}

function isRoomValue(value: number | undefined): value is number {
  return value !== undefined && value >= GRID_FIRST_ROOM && value <= GRID_LAST_ROOM;
}

function addEdge(edges: EdgeMap, from: number, to: number): void {
  const outgoing = edges.get(from);
  if (outgoing === undefined) edges.set(from, [to]);
  else outgoing.push(to);
}

function roomGridOf(rooms: Map<number, RoomGrid>, id: number): RoomGrid {
  const existing = rooms.get(id);
  if (existing !== undefined) return existing;
  const created = { cells: [], edges: new Map<number, number[]>() };
  rooms.set(id, created);
  return created;
}

export function scanRooms(
  cells: Uint8Array,
  width: number,
  height: number,
): ReadonlyMap<number, RoomGrid> {
  const stride = width + 1;
  const rooms = new Map<number, RoomGrid>();
  const same = (id: number, column: number, row: number): boolean =>
    column >= 0 && column < width && row >= 0 && row < height && cells[row * width + column] === id;
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const id = cells[row * width + column];
      if (!isRoomValue(id)) continue;
      const grid = roomGridOf(rooms, id);
      grid.cells.push(row * width + column);
      const low = row * stride + column;
      const high = low + stride;
      if (!same(id, column, row - 1)) addEdge(grid.edges, low, low + 1);
      if (!same(id, column + 1, row)) addEdge(grid.edges, low + 1, high + 1);
      if (!same(id, column, row + 1)) addEdge(grid.edges, high + 1, high);
      if (!same(id, column - 1, row)) addEdge(grid.edges, high, low);
    }
  }
  return rooms;
}

function crossOfTurn(arrivedBy: number, leaveBy: number, stride: number): number {
  if (arrivedBy === 0) return 0;
  const direction = (delta: number): readonly [number, number] => {
    if (delta === 1) return [1, 0];
    if (delta === -1) return [-1, 0];
    return delta === stride ? [0, 1] : [0, -1];
  };
  const [ax, ay] = direction(arrivedBy);
  const [bx, by] = direction(leaveBy);
  return ax * by - ay * bx;
}

function takeEdge(edges: EdgeMap, at: number, arrivedBy: number, stride: number): number {
  const options = edges.get(at);
  if (options === undefined || options.length === 0) {
    throw new MapBlobError(
      'room outline',
      'a closed cell boundary',
      `no outgoing edge at vertex ${String(at)}`,
    );
  }
  const choice = options
    .map((to, index) => ({ to, index, turn: crossOfTurn(arrivedBy, to - at, stride) }))
    .reduce((best, candidate) => (candidate.turn > best.turn ? candidate : best));
  options.splice(choice.index, 1);
  if (options.length === 0) edges.delete(at);
  return choice.to;
}

function walkLoop(edges: EdgeMap, start: number, stride: number): number[] {
  const loop = [start];
  let at = start;
  let arrivedBy = 0;
  do {
    const to = takeEdge(edges, at, arrivedBy, stride);
    arrivedBy = to - at;
    at = to;
    if (at !== start) loop.push(at);
  } while (at !== start);
  return loop;
}

export function chainLoops(edges: EdgeMap, stride: number): readonly (readonly number[])[] {
  const loops: number[][] = [];
  for (let next = edges.keys().next(); next.done !== true; next = edges.keys().next()) {
    loops.push(walkLoop(edges, next.value, stride));
  }
  return loops;
}

function dropCollinear(points: readonly OutlinePoint[]): OutlinePoint[] {
  return points.filter((point, index) => {
    const before = points[(index + points.length - 1) % points.length];
    const after = points[(index + 1) % points.length];
    if (before === undefined || after === undefined) return true;
    return (
      (point.x - before.x) * (after.y - point.y) - (point.y - before.y) * (after.x - point.x) !== 0
    );
  });
}

function distanceToSegment(point: OutlinePoint, from: OutlinePoint, to: OutlinePoint): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const along =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared),
        );
  return Math.hypot(point.x - (from.x + along * dx), point.y - (from.y + along * dy));
}

function farthestBetween(
  line: readonly OutlinePoint[],
  first: number,
  last: number,
): { readonly index: number; readonly distance: number } {
  const from = line[first];
  const to = line[last];
  let found = { index: first, distance: 0 };
  if (from === undefined || to === undefined) return found;
  for (let index = first + 1; index < last; index += 1) {
    const point = line[index];
    const distance = point === undefined ? 0 : distanceToSegment(point, from, to);
    if (distance > found.distance) found = { index, distance };
  }
  return found;
}

export function douglasPeucker(line: readonly OutlinePoint[], tolerance: number): OutlinePoint[] {
  const keep = line.map((_, index) => index === 0 || index === line.length - 1);
  const pending: (readonly [number, number])[] = [[0, line.length - 1]];
  for (let range = pending.pop(); range !== undefined; range = pending.pop()) {
    const found = farthestBetween(line, range[0], range[1]);
    if (found.distance <= tolerance) continue;
    keep[found.index] = true;
    pending.push([range[0], found.index], [found.index, range[1]]);
  }
  return line.filter((_, index) => keep[index] === true);
}

export function simplifyRing(ring: readonly OutlinePoint[], tolerance: number): OutlinePoint[] {
  const lowest = ring.reduce((best, point) =>
    point.x < best.x || (point.x === best.x && point.y < best.y) ? point : best,
  );
  const start = ring.indexOf(lowest);
  const rotated = [...ring.slice(start), ...ring.slice(0, start)];
  const far = rotated.reduce(
    (best, point, index) => {
      const distance = Math.hypot(point.x - lowest.x, point.y - lowest.y);
      return distance > best.distance ? { index, distance } : best;
    },
    { index: 0, distance: 0 },
  ).index;
  const near = douglasPeucker(rotated.slice(0, far + 1), tolerance);
  const back = douglasPeucker([...rotated.slice(far), lowest], tolerance);
  return [...near.slice(0, -1), ...back.slice(0, -1)];
}

function loopToRing(loop: readonly number[], map: MapDocument): OutlinePoint[] {
  const stride = map.width + 1;
  const corners = loop.map((vertex) => ({ x: vertex % stride, y: Math.floor(vertex / stride) }));
  return simplifyRing(dropCollinear(corners), SIMPLIFY_TOLERANCE_CELLS).map((corner) => ({
    x: (map.origin_x + corner.x * map.resolution) / MILLIMETRES_PER_METRE,
    y: (map.origin_y + corner.y * map.resolution) / MILLIMETRES_PER_METRE,
  }));
}

function cellCentre(map: MapDocument, cell: number): OutlinePoint {
  return {
    x: (map.origin_x + ((cell % map.width) + 0.5) * map.resolution) / MILLIMETRES_PER_METRE,
    y:
      (map.origin_y + (Math.floor(cell / map.width) + 0.5) * map.resolution) /
      MILLIMETRES_PER_METRE,
  };
}

function labelOf(
  map: MapDocument,
  cells: readonly number[],
  attributes: NonNullable<MapDocument['room_attrs']>[number] | undefined,
): OutlinePoint {
  if (attributes?.name_pos_x !== undefined && attributes.name_pos_y !== undefined) {
    return {
      x: attributes.name_pos_x / MILLIMETRES_PER_METRE,
      y: attributes.name_pos_y / MILLIMETRES_PER_METRE,
    };
  }
  const centres = cells.map((cell) => cellCentre(map, cell));
  const meanX = centres.reduce((sum, centre) => sum + centre.x, 0) / centres.length;
  const meanY = centres.reduce((sum, centre) => sum + centre.y, 0) / centres.length;
  return centres.reduce((best, centre) =>
    Math.hypot(centre.x - meanX, centre.y - meanY) < Math.hypot(best.x - meanX, best.y - meanY)
      ? centre
      : best,
  );
}

function settingsOf(
  attributes: NonNullable<MapDocument['room_attrs']>[number] | undefined,
): VacuumRoom['settings'] {
  if (attributes === undefined) return null;
  return {
    suction: attributes.fan_level ?? null,
    water: attributes.water_level ?? null,
    mode: attributes.clean_mode ?? null,
    repeats: attributes.clean_times ?? null,
  };
}

export function buildRooms(map: MapDocument, cells: Uint8Array): VacuumRoom[] {
  const grids = scanRooms(cells, map.width, map.height);
  const stride = map.width + 1;
  const squareMetres = (map.resolution / MILLIMETRES_PER_METRE) ** 2;
  return [...grids.entries()]
    .toSorted(([a], [b]) => a - b)
    .map(([id, grid]) => {
      const attributes = map.room_attrs?.find((entry) => entry.id === id);
      const colour = map.map_room_info?.find((entry) => entry.grid_id === id)?.color;
      return {
        id,
        name: attributes?.room_name ?? `Room ${String(id)}`,
        colour: colour ?? 0,
        floor: attributes?.floor ?? 0,
        hidden: attributes?.notshow === 1,
        areaM2: grid.cells.length * squareMetres,
        label: labelOf(map, grid.cells, attributes),
        rings: chainLoops(grid.edges, stride).map((loop) => loopToRing(loop, map)),
        settings: settingsOf(attributes),
      };
    });
}
