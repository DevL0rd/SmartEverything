import type { ShellyArea, ShellySegment } from './primitives';

export interface ShellyPoint {
  readonly x: number;
  readonly y: number;
}

export const SHELLY_CELL_METRES = 0.5;
const ORIGINS = { left: 0, center: 8, right: 16 } as const;

export function shellySensorOrigin(position: string | null | undefined): number {
  return position === 'left' ? ORIGINS.left : position === 'right' ? ORIGINS.right : ORIGINS.center;
}

export function shellyTrackToGrid(track: ShellyPoint): ShellyPoint {
  return { x: track.x / SHELLY_CELL_METRES, y: track.y / SHELLY_CELL_METRES };
}

export function shellyGridToView(grid: ShellyPoint, origin: number): ShellyPoint {
  return { x: (origin - grid.x) * SHELLY_CELL_METRES, y: grid.y * SHELLY_CELL_METRES };
}

export function shellyTrackToView(track: ShellyPoint, origin: number): ShellyPoint {
  return shellyGridToView(shellyTrackToGrid(track), origin);
}

export function shellyCellKey(x: number, y: number): string {
  return `${String(x)},${String(y)}`;
}

function addSegment(cells: Set<string>, [x1, y1, x2, y2]: ShellySegment, origin: number): void {
  const left = origin - Math.max(x1, x2);
  const right = origin - Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  for (let x = left; x < right; x += 1)
    for (let y = top; y < bottom; y += 1) cells.add(shellyCellKey(x, y));
}

export function shellyCellsOf(area: ShellyArea, origin: number): ReadonlySet<string> {
  const cells = new Set<string>();
  for (const segment of area) addSegment(cells, segment, origin);
  return cells;
}

export function shellyViewInCells(cells: ReadonlySet<string>, view: ShellyPoint): boolean {
  return cells.has(
    shellyCellKey(Math.floor(view.x / SHELLY_CELL_METRES), Math.floor(view.y / SHELLY_CELL_METRES)),
  );
}

export function shellyPointInArea(track: ShellyPoint, area: ShellyArea): boolean {
  const { x, y } = shellyTrackToGrid(track);
  return area.some(
    ([x1, y1, x2, y2]) =>
      x > Math.min(x1, x2) &&
      x <= Math.max(x1, x2) &&
      y >= Math.min(y1, y2) &&
      y < Math.max(y1, y2),
  );
}
