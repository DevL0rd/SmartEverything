import type { ShellyArea, ShellySegment } from '@smarteverything/shelly';
import { paintArea, strokeSegment, type GridCell } from './area-geometry';

export type PainterTool = 'paint' | 'erase' | 'select';

export function clipStroke(stroke: ShellySegment, allowed: ShellyArea | undefined): ShellyArea {
  if (allowed === undefined) return [stroke];
  return allowed.flatMap(([x1, y1, x2, y2]) => {
    const left = Math.max(Math.min(stroke[0], stroke[2]), Math.min(x1, x2));
    const right = Math.min(Math.max(stroke[0], stroke[2]), Math.max(x1, x2));
    const top = Math.min(Math.max(stroke[1], stroke[3]), Math.max(y1, y2));
    const bottom = Math.max(Math.min(stroke[1], stroke[3]), Math.min(y1, y2));
    return left < right && bottom < top ? [[left, top, right, bottom]] : [];
  });
}
function yLength(intervals: readonly (readonly number[])[]): number {
  let end = -Infinity;
  let length = 0;
  for (const interval of [...intervals].sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0))) {
    const low = interval[0] ?? 0;
    const high = interval[1] ?? 0;
    length += Math.max(0, high - Math.max(end, low));
    end = Math.max(end, high);
  }
  return length;
}
export function areaCells(area: ShellyArea): number {
  const boundaries = [...new Set(area.flatMap(([x1, , x2]) => [x1, x2]))].sort((a, b) => a - b);
  return boundaries.reduce((sum, right, index) => {
    const left = boundaries[index - 1];
    if (left === undefined) return sum;
    const spans = area
      .filter(([x1, , x2]) => Math.min(x1, x2) <= left && Math.max(x1, x2) >= right)
      .map(([, y1, , y2]) => [Math.min(y1, y2), Math.max(y1, y2)]);
    return sum + (right - left) * yLength(spans);
  }, 0);
}
export function sensorOrigin(position: string | null | undefined): number {
  return position === 'left' ? 0 : position === 'right' ? 16 : 8;
}

export function toolStroke(
  tool: PainterTool,
  start: GridCell,
  end: GridCell,
  allowed: ShellyArea | undefined,
): ShellyArea {
  if (tool === 'select') return [];
  return clipStroke(strokeSegment(start, end), tool === 'erase' ? undefined : allowed);
}

export function commitStroke(area: ShellyArea, tool: PainterTool, strokes: ShellyArea): ShellyArea {
  return strokes.reduce((next, stroke) => paintArea(next, stroke, tool === 'erase'), area);
}

export function strokeRejected(tool: PainterTool, strokes: ShellyArea): boolean {
  return tool !== 'select' && strokes.length === 0;
}
