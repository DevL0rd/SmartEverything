import {
  SHELLY_HOUSE_CELL_METRES,
  homeMapPointInPolygon,
  shellyAreaToHousePolygons,
  shellyHouseToSensor,
  shellySensorToHouse,
  type ShellyHousePose,
} from '@smarteverything/domain';
import type { ShellyArea, ShellySegment } from '@smarteverything/shelly';
import type {
  RenderBounds,
  RenderPoint,
  RenderPolygon,
  RenderRing,
} from '../../components/house-map/render-scene';
import type {
  EditFrame,
  EditGhost,
  EditOverlay,
  EditShape,
} from '../../components/house-map/3d/map-3d-edit-protocol';
import { clipStroke, sensorOrigin } from './area-context';
import type { GridCell } from './area-geometry';

type EditHandle = EditOverlay['handles'][number];

const CELL = SHELLY_HOUSE_CELL_METRES;

const WINDOW_COLUMNS = 16;

const WINDOW_ROWS = 20;

export interface CellRange {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export type GridLine = readonly [RenderPoint, RenderPoint];

export function houseCell(pose: ShellyHousePose, point: RenderPoint): GridCell {
  const sensor = shellyHouseToSensor(pose, point);
  return { x: Math.floor(sensor.x / CELL), y: Math.floor(sensor.y / CELL) };
}

function cellCorner(pose: ShellyHousePose, x: number, y: number): RenderPoint {
  return shellySensorToHouse(pose, { x: x * CELL, y: y * CELL });
}

function cellCentre(pose: ShellyHousePose, x: number, y: number): RenderPoint {
  return shellySensorToHouse(pose, { x: (x + 0.5) * CELL, y: (y + 0.5) * CELL });
}

function ringsRange(pose: ShellyHousePose, rings: readonly RenderRing[]): CellRange | null {
  const points = rings.flat().map((point) => shellyHouseToSensor(pose, point));
  if (points.length === 0) return null;
  const xs = points.map((point) => point.x / CELL);
  const ys = points.map((point) => point.y / CELL);
  return {
    minX: Math.floor(Math.min(...xs)),
    maxX: Math.ceil(Math.max(...xs)),
    minY: Math.max(0, Math.floor(Math.min(...ys))),
    maxY: Math.max(0, Math.ceil(Math.max(...ys))),
  };
}

export function gridRange(
  pose: ShellyHousePose,
  position: string | null | undefined,
  area: ShellyArea,
  rings: readonly RenderRing[],
): CellRange {
  const origin = sensorOrigin(position);
  const room = ringsRange(pose, rings);
  const xs = [origin - WINDOW_COLUMNS, origin, ...area.flatMap(([x1, , x2]) => [x1, x2])];
  const ys = [0, WINDOW_ROWS, ...area.flatMap(([, y1, , y2]) => [y1, y2])];
  if (room !== null) {
    xs.push(room.minX, room.maxX);
    ys.push(room.minY, room.maxY);
  }
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

export function gridLines(pose: ShellyHousePose, range: CellRange): readonly GridLine[] {
  const lines: GridLine[] = [];
  for (let x = range.minX; x <= range.maxX; x += 1) {
    lines.push([cellCorner(pose, x, range.minY), cellCorner(pose, x, range.maxY)]);
  }
  for (let y = range.minY; y <= range.maxY; y += 1) {
    lines.push([cellCorner(pose, range.minX, y), cellCorner(pose, range.maxX, y)]);
  }
  return lines;
}

export function areaRings(pose: ShellyHousePose, area: ShellyArea): readonly RenderRing[] {
  return shellyAreaToHousePolygons(pose, area).map((polygon) => polygon.outer);
}

interface Run {
  readonly from: number;
  readonly to: number;
}

function rowRuns(
  pose: ShellyHousePose,
  polygons: readonly RenderPolygon[],
  y: number,
  range: CellRange,
): readonly Run[] {
  const runs: Run[] = [];
  let start: number | null = null;
  for (let x = range.minX; x <= range.maxX; x += 1) {
    const centre = cellCentre(pose, x, y);
    const inside =
      x < range.maxX && polygons.some((polygon) => homeMapPointInPolygon(polygon, centre));
    if (inside && start === null) start = x;
    if (!inside && start !== null) {
      runs.push({ from: start, to: x });
      start = null;
    }
  }
  return runs;
}

interface OpenSegment {
  readonly from: number;
  readonly to: number;
  readonly bottom: number;
  top: number;
}

const segmentOf = (open: OpenSegment): ShellySegment => [open.from, open.top, open.to, open.bottom];

export function fitRoomArea(pose: ShellyHousePose, polygons: readonly RenderPolygon[]): ShellyArea {
  const range = ringsRange(
    pose,
    polygons.map((polygon) => polygon.outer),
  );
  if (range === null) return [];
  const closed: OpenSegment[] = [];
  let open = new Map<string, OpenSegment>();
  for (let y = range.minY; y < range.maxY; y += 1) {
    const next = new Map<string, OpenSegment>();
    for (const run of rowRuns(pose, polygons, y, range)) {
      const key = `${String(run.from)}:${String(run.to)}`;
      const kept = open.get(key);
      const segment = kept ?? { from: run.from, to: run.to, bottom: y, top: y };
      segment.top = y + 1;
      next.set(key, segment);
      open.delete(key);
    }
    closed.push(...open.values());
    open = next;
  }
  closed.push(...open.values());
  return closed.map(segmentOf);
}

export const ZONE_SEGMENT_SHAPE = 'zone-segment';

export interface SegmentCorner {
  readonly segment: number;
  readonly corner: number;
}

const CORNER_EDGES: readonly (readonly [0 | 2, 1 | 3])[] = [
  [0, 1],
  [2, 1],
  [2, 3],
  [0, 3],
];

function edgeOf(segment: ShellySegment, corner: number): GridCell | null {
  const edge = CORNER_EDGES[corner];
  return edge === undefined ? null : { x: segment[edge[0]], y: segment[edge[1]] };
}

export function segmentCorners(pose: ShellyHousePose, segment: ShellySegment): RenderRing {
  return CORNER_EDGES.map(([x, y]) => cellCorner(pose, segment[x], segment[y]));
}

export function houseEdge(pose: ShellyHousePose, point: RenderPoint): GridCell {
  const sensor = shellyHouseToSensor(pose, point);
  return { x: Math.round(sensor.x / CELL), y: Math.round(sensor.y / CELL) };
}

export function cellRing(pose: ShellyHousePose, cell: GridCell): RenderRing {
  return segmentCorners(pose, [cell.x, cell.y + 1, cell.x + 1, cell.y]);
}

export function resizeSegment(
  area: ShellyArea,
  at: SegmentCorner,
  edge: GridCell,
  allowed: ShellyArea | undefined,
): ShellyArea | null {
  const segment = area[at.segment];
  const fixed = segment === undefined ? null : edgeOf(segment, (at.corner + 2) % 4);
  if (fixed === null || fixed.x === edge.x || fixed.y === edge.y) return null;
  const resized: ShellySegment = [
    Math.min(fixed.x, edge.x),
    Math.max(fixed.y, edge.y),
    Math.max(fixed.x, edge.x),
    Math.min(fixed.y, edge.y),
  ];
  const pieces = clipStroke(resized, allowed);
  if (pieces.length === 0) return null;
  return [...area.slice(0, at.segment), ...pieces, ...area.slice(at.segment + 1)];
}

const handleId = (at: SegmentCorner): string =>
  `${ZONE_SEGMENT_SHAPE}:${String(at.segment)}:${String(at.corner)}`;

export function segmentCornerOf(area: ShellyArea, id: string): SegmentCorner | null {
  for (let segment = 0; segment < area.length; segment += 1) {
    for (let corner = 0; corner < CORNER_EDGES.length; corner += 1) {
      if (handleId({ segment, corner }) === id) return { segment, corner };
    }
  }
  return null;
}

const onGround = (point: RenderPoint): EditHandle['at'] => ({ x: point.x, y: point.y, height: 0 });

function zoneShapes(pose: ShellyHousePose, area: ShellyArea): readonly EditShape[] {
  return area.map((segment, index) => ({
    kind: 'ring',
    id: `${ZONE_SEGMENT_SHAPE}:${String(index)}`,
    points: [...segmentCorners(pose, segment)],
  }));
}

function zoneHandles(pose: ShellyHousePose, area: ShellyArea): readonly EditHandle[] {
  return area.flatMap((segment, index) =>
    segmentCorners(pose, segment).map((point, corner) => ({
      id: handleId({ segment: index, corner }),
      kind: 'point',
      at: onGround(point),
      surface: { kind: 'ground' },
      target: {
        kind: 'shape-corner',
        shapeId: `${ZONE_SEGMENT_SHAPE}:${String(index)}`,
        index: corner,
      },
    })),
  );
}

function ghostOf(
  shape: 'polyline' | 'polygon',
  ring: RenderRing,
  tone: EditGhost['tone'],
): EditGhost {
  const points = shape === 'polyline' ? [...ring, ...ring.slice(0, 1)] : ring;
  return { shape, points: points.map(onGround), tone };
}

export interface PendingCorner {
  readonly cell: GridCell;
  readonly erase: boolean;
}

export interface ZoneOverlayInput {
  readonly pose: ShellyHousePose;
  readonly area: ShellyArea;
  readonly context: ShellyArea;
  readonly allowed: ShellyArea | undefined;
  readonly grid: CellRange;
  readonly pending: PendingCorner | null;
  readonly frame: EditFrame | null;
}

function zoneGhosts(input: ZoneOverlayInput): readonly EditGhost[] {
  const { pose, pending } = input;
  const grid = gridLines(pose, input.grid).map((line): EditGhost => ({
    shape: 'polyline',
    points: line.map(onGround),
    tone: 'neutral',
  }));
  const allowed = input.allowed === undefined ? [] : areaRings(pose, input.allowed);
  return [
    ...grid,
    ...areaRings(pose, input.context).map((ring) => ghostOf('polygon', ring, 'neutral')),
    ...allowed.map((ring) => ghostOf('polyline', ring, 'info')),
    ...areaRings(pose, input.area).map((ring) => ghostOf('polygon', ring, 'info')),
    ...(pending === null
      ? []
      : [ghostOf('polygon', cellRing(pose, pending.cell), pending.erase ? 'danger' : 'info')]),
  ];
}

export function zoneOverlay(input: ZoneOverlayInput): EditOverlay {
  return {
    mode: 'draw-rect',
    selection: [],
    roomDrag: false,
    gizmo: null,
    handles: [...zoneHandles(input.pose, input.area)],
    shapes: [...zoneShapes(input.pose, input.area)],
    ghosts: [...zoneGhosts(input)],
    labels: [],
    snapping: false,
    readOnly: false,
    place: null,
    paint: null,
    frame: input.frame,
    scanExtent: null,
  };
}

export function zoneFrame(key: string, bounds: RenderBounds): EditFrame | null {
  if (bounds.minX >= bounds.maxX || bounds.minY >= bounds.maxY) return null;
  return { key, bounds, top: true };
}
