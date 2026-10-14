import type { ShellyArea } from '@smarteverything/domain';
import type { GridCell } from './area-geometry';

export interface PainterViewport {
  readonly left: number;
  readonly top: number;
  readonly columns: number;
  readonly rows: number;
}

export function painterViewport(area: ShellyArea): PainterViewport {
  const xs = area.flatMap(([x1, , x2]) => [8 - x1, 8 - x2]);
  const ys = area.flatMap(([, y1, , y2]) => [y1, y2]);
  const left = Math.min(0, ...xs);
  const top = Math.min(0, ...ys);
  return { left, top, columns: Math.max(16, ...xs) - left, rows: Math.max(20, ...ys) - top };
}

export function pointerCell(
  x: number,
  y: number,
  width: number,
  viewport: PainterViewport,
): GridCell {
  const scale = width / viewport.columns;
  const column = Math.floor(viewport.left + x / scale);
  const row = Math.floor(viewport.top + y / scale);
  return { x: 7 - column, y: row };
}
