import { appendTo } from '@smarteverything/domain';
import type { ShellyArea, ShellyDevice, ShellySegment } from '@smarteverything/shelly';
import { sensorOrigin } from './area-context';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface LabelSpot extends Point {
  readonly width: number;
  readonly height: number;
}

export type Cells = ReadonlySet<string>;

export interface ZoneShape {
  readonly path: string;
  readonly cells: Cells;
  readonly bounds: Rect;
  readonly label: LabelSpot;
}

export const CELL_METRES = 0.5;
export const DEFAULT_ROOM: Rect = { left: 0, top: 0, right: 8, bottom: 10 };

const MAX_CELLS = 4096;

export function trackToGrid(track: Point): Point {
  return { x: track.x / CELL_METRES, y: track.y / CELL_METRES };
}

export function gridToView(grid: Point, origin: number): Point {
  return { x: (origin - grid.x) * CELL_METRES, y: grid.y * CELL_METRES };
}

export function trackToView(track: Point, origin: number): Point {
  return gridToView(trackToGrid(track), origin);
}

function cellKey(x: number, y: number): string {
  return `${String(x)},${String(y)}`;
}

function cellOf(key: string): Point {
  const [x = '0', y = '0'] = key.split(',');
  return { x: Number(x), y: Number(y) };
}

function addSegment(cells: Set<string>, [x1, y1, x2, y2]: ShellySegment, origin: number): void {
  const left = origin - Math.max(x1, x2);
  const right = origin - Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  if ((right - left) * (bottom - top) > MAX_CELLS) return;
  for (let x = left; x < right; x += 1)
    for (let y = top; y < bottom; y += 1) cells.add(cellKey(x, y));
}

export function cellsOf(area: ShellyArea, origin: number): Cells {
  const cells = new Set<string>();
  for (const segment of area) addSegment(cells, segment, origin);
  return cells;
}

export function cellsAt(cells: Cells, point: Point): boolean {
  return cells.has(cellKey(Math.floor(point.x / CELL_METRES), Math.floor(point.y / CELL_METRES)));
}

function boundsOf(cells: Cells): Rect | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const key of cells) {
    const { x, y } = cellOf(key);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + 1);
    bottom = Math.max(bottom, y + 1);
  }
  if (cells.size === 0) return null;
  return {
    left: left * CELL_METRES,
    top: top * CELL_METRES,
    right: right * CELL_METRES,
    bottom: bottom * CELL_METRES,
  };
}

function boundaryEdges(cells: Cells): Map<string, Point[]> {
  const edges = new Map<string, Point[]>();
  const add = (from: Point, to: Point): void => {
    const key = cellKey(from.x, from.y);
    appendTo(edges, key, to);
  };
  for (const key of cells) {
    const { x, y } = cellOf(key);
    if (!cells.has(cellKey(x, y - 1))) add({ x, y }, { x: x + 1, y });
    if (!cells.has(cellKey(x + 1, y))) add({ x: x + 1, y }, { x: x + 1, y: y + 1 });
    if (!cells.has(cellKey(x, y + 1))) add({ x: x + 1, y: y + 1 }, { x, y: y + 1 });
    if (!cells.has(cellKey(x - 1, y))) add({ x, y: y + 1 }, { x, y });
  }
  return edges;
}

function corners(loop: readonly Point[]): readonly Point[] {
  return loop.filter((point, index) => {
    const before = loop[(index + loop.length - 1) % loop.length];
    const after = loop[(index + 1) % loop.length];
    if (before === undefined || after === undefined) return true;
    return (
      (point.x - before.x) * (after.y - point.y) !== (point.y - before.y) * (after.x - point.x)
    );
  });
}

export function outlineOf(cells: Cells): readonly (readonly Point[])[] {
  const edges = boundaryEdges(cells);
  const loops: Point[][] = [];
  for (const [startKey, targets] of edges) {
    while (targets.length > 0) {
      const start = cellOf(startKey);
      const loop: Point[] = [start];
      let next = targets.pop();
      while (next !== undefined && (next.x !== start.x || next.y !== start.y)) {
        loop.push(next);
        next = edges.get(cellKey(next.x, next.y))?.pop();
      }
      loops.push(corners(loop).slice());
    }
  }
  return loops;
}

function signedArea(loop: readonly Point[]): number {
  return loop.reduce((sum, point, index) => {
    const next = loop[(index + 1) % loop.length];
    return next === undefined ? sum : sum + (point.x * next.y - next.x * point.y);
  }, 0);
}

export function outerLoops(loops: readonly (readonly Point[])[]): number {
  return loops.filter((loop) => signedArea(loop) > 0).length;
}

export function pathOf(loops: readonly (readonly Point[])[]): string {
  return loops
    .map(
      (loop) =>
        `${loop
          .map(
            (point, index) =>
              `${index === 0 ? 'M' : 'L'}${String(point.x * CELL_METRES)} ${String(point.y * CELL_METRES)}`,
          )
          .join('')}Z`,
    )
    .join('');
}

function neighbours(cell: Point): readonly Point[] {
  return [-1, 0, 1].flatMap((dx) =>
    [-1, 0, 1]
      .filter((dy) => dx !== 0 || dy !== 0)
      .map((dy) => ({ x: cell.x + dx, y: cell.y + dy })),
  );
}

function depths(cells: Cells): Map<string, number> {
  const depth = new Map<string, number>();
  let frontier: string[] = [];
  for (const key of cells) {
    if (neighbours(cellOf(key)).some((near) => !cells.has(cellKey(near.x, near.y)))) {
      depth.set(key, 1);
      frontier.push(key);
    }
  }
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const key of frontier) {
      const level = depth.get(key) ?? 1;
      for (const near of neighbours(cellOf(key))) {
        const nearKey = cellKey(near.x, near.y);
        if (cells.has(nearKey) && !depth.has(nearKey)) {
          depth.set(nearKey, level + 1);
          next.push(nearKey);
        }
      }
    }
    frontier = next;
  }
  return depth;
}

function run(cells: Cells, from: Point, step: Point): number {
  let length = 1;
  for (
    let x = from.x + step.x, y = from.y + step.y;
    cells.has(cellKey(x, y));
    x += step.x, y += step.y
  )
    length += 1;
  return length;
}

function distanceToCentre(cells: Cells): (key: string) => number {
  const bounds = boundsOf(cells);
  const centreX = bounds === null ? 0 : (bounds.left + bounds.right) / 2;
  const centreY = bounds === null ? 0 : (bounds.top + bounds.bottom) / 2;
  return (key) => {
    const cell = cellOf(key);
    return (
      ((cell.x + 0.5) * CELL_METRES - centreX) ** 2 + ((cell.y + 0.5) * CELL_METRES - centreY) ** 2
    );
  };
}

export function labelSpotOf(cells: Cells): LabelSpot | null {
  const depth = depths(cells);
  const distance = distanceToCentre(cells);
  let best: string | null = null;
  for (const [key, level] of depth) {
    const bestLevel = best === null ? 0 : (depth.get(best) ?? 0);
    if (
      level > bestLevel ||
      (level === bestLevel && best !== null && distance(key) < distance(best))
    )
      best = key;
  }
  if (best === null) return null;
  const cell = cellOf(best);
  const across = run(cells, cell, { x: 1, y: 0 }) + run(cells, cell, { x: -1, y: 0 }) - 1;
  const down = run(cells, cell, { x: 0, y: 1 }) + run(cells, cell, { x: 0, y: -1 }) - 1;
  return {
    x: (cell.x + 0.5) * CELL_METRES,
    y: (cell.y + 0.5) * CELL_METRES,
    width: across * CELL_METRES,
    height: down * CELL_METRES,
  };
}

export function shapeOf(area: ShellyArea, origin: number): ZoneShape | null {
  const cells = cellsOf(area, origin);
  const bounds = boundsOf(cells);
  const label = labelSpotOf(cells);
  if (bounds === null || label === null) return null;
  return { path: pathOf(outlineOf(cells)), cells, bounds, label };
}

function unionOf(rects: readonly Rect[]): Rect {
  return rects.reduce((total, rect) => ({
    left: Math.min(total.left, rect.left),
    top: Math.min(total.top, rect.top),
    right: Math.max(total.right, rect.right),
    bottom: Math.max(total.bottom, rect.bottom),
  }));
}

export interface MapFrame {
  readonly room: Rect;
  readonly view: Rect;
}

const PAD = { mini: 0.2, side: 0.35, top: 1.1, bottom: 1 } as const;

export function frameOf(
  room: Rect,
  extras: readonly Rect[],
  origin: number,
  mini: boolean,
): MapFrame {
  const sensor: Rect = {
    left: origin * CELL_METRES,
    top: 0,
    right: origin * CELL_METRES,
    bottom: 0,
  };
  const all = unionOf([room, sensor, ...extras]);
  return {
    room,
    view: mini
      ? {
          left: all.left - PAD.mini,
          top: all.top - PAD.mini,
          right: all.right + PAD.mini,
          bottom: all.bottom + PAD.mini,
        }
      : {
          left: all.left - PAD.side,
          top: all.top - PAD.top,
          right: all.right + PAD.side,
          bottom: all.bottom + PAD.bottom,
        },
  };
}

export function sizeOf(rect: Rect): { readonly width: number; readonly height: number } {
  return { width: rect.right - rect.left, height: rect.bottom - rect.top };
}

export interface MapModel {
  readonly origin: number;
  readonly frame: MapFrame;
  readonly shapes: ReadonlyMap<string, ZoneShape>;
  readonly blind: { readonly path: string; readonly count: number };
  readonly area: ZoneShape | null;
}

function shapesOf(sensor: ShellyDevice, origin: number): Map<string, ZoneShape> {
  const shapes = new Map<string, ZoneShape>();
  for (const zone of sensor.zones) {
    const shape = shapeOf(zone.config.area ?? [], origin);
    if (shape !== null) shapes.set(zone.key, shape);
  }
  return shapes;
}

function roomOf(sensor: ShellyDevice, shapes: ReadonlyMap<string, ZoneShape>): Rect {
  const main = sensor.zones.find((zone) => zone.main);
  return (main === undefined ? undefined : shapes.get(main.key)?.bounds) ?? DEFAULT_ROOM;
}

function buildModel(sensor: ShellyDevice, area: ShellyArea | undefined, mini: boolean): MapModel {
  const origin = sensorOrigin(sensor.config?.sensor?.position);
  const shapes = shapesOf(sensor, origin);
  const blind = outlineOf(cellsOf(sensor.config?.blind ?? [], origin));
  const highlighted = area === undefined ? null : shapeOf(area, origin);
  const drawn = highlighted === null ? [...shapes.values()] : [...shapes.values(), highlighted];
  return {
    origin,
    frame: frameOf(
      roomOf(sensor, shapes),
      drawn.map((shape) => shape.bounds),
      origin,
      mini,
    ),
    shapes,
    blind: { path: pathOf(blind), count: outerLoops(blind) },
    area: highlighted,
  };
}

const MODELS = new Map<string, MapModel>();
const KEPT_MODELS = 16;
const BY_CONFIG = new WeakMap<object, readonly Remembered[]>();
const NO_CONFIG = {};

interface Remembered {
  readonly zones: ShellyDevice['zones'];
  readonly area: ShellyArea | undefined;
  readonly mini: boolean;
  readonly model: MapModel;
}

function sameZones(left: ShellyDevice['zones'], right: ShellyDevice['zones']): boolean {
  return (
    left === right ||
    (left.length === right.length &&
      left.every((zone, index) => {
        const other = right[index];
        return (
          zone === other ||
          (zone.config === other?.config && zone.key === other.key && zone.main === other.main)
        );
      }))
  );
}

function modelByKey(sensor: ShellyDevice, area: ShellyArea | undefined, mini: boolean): MapModel {
  const key = JSON.stringify([
    mini,
    sensor.config?.sensor?.position,
    sensor.config?.blind,
    sensor.zones.map((zone) => [zone.key, zone.main, zone.config.area]),
    area,
  ]);
  const known = MODELS.get(key);
  if (known !== undefined) return known;
  const model = buildModel(sensor, area, mini);
  MODELS.set(key, model);
  const oldest = MODELS.keys().next();
  if (MODELS.size > KEPT_MODELS && oldest.done !== true) MODELS.delete(oldest.value);
  return model;
}

export function modelFor(
  sensor: ShellyDevice,
  area: ShellyArea | undefined,
  mini: boolean,
): MapModel {
  const owner = sensor.config ?? NO_CONFIG;
  const seen = BY_CONFIG.get(owner) ?? [];
  const hit = seen.find(
    (entry) => entry.mini === mini && entry.area === area && sameZones(entry.zones, sensor.zones),
  );
  if (hit !== undefined) return hit.model;
  const model = modelByKey(sensor, area, mini);
  BY_CONFIG.set(owner, [...seen.slice(-3), { zones: sensor.zones, area, mini, model }]);
  return model;
}
