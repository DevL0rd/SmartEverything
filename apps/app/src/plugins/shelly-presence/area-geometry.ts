import type { ShellyArea, ShellySegment } from '@smarteverything/shelly';

export interface GridCell {
  readonly x: number;
  readonly y: number;
}
interface Bounds {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly top: number;
}

function boundsOf([x1, y1, x2, y2]: ShellySegment): Bounds {
  return {
    left: Math.min(x1, x2),
    right: Math.max(x1, x2),
    bottom: Math.min(y1, y2),
    top: Math.max(y1, y2),
  };
}

function segmentOf(bounds: Bounds): ShellySegment {
  return [bounds.left, bounds.top, bounds.right, bounds.bottom];
}

export function strokeSegment(start: GridCell, end: GridCell): ShellySegment {
  return [
    Math.min(start.x, end.x),
    Math.max(start.y, end.y) + 1,
    Math.max(start.x, end.x) + 1,
    Math.min(start.y, end.y),
  ];
}

function subtractSegment(segment: ShellySegment, erased: ShellySegment): ShellyArea {
  const area = boundsOf(segment);
  const cut = boundsOf(erased);
  const left = Math.max(area.left, cut.left);
  const right = Math.min(area.right, cut.right);
  const bottom = Math.max(area.bottom, cut.bottom);
  const top = Math.min(area.top, cut.top);
  if (left >= right || bottom >= top) return [segment];
  const pieces = [
    { ...area, right: left },
    { ...area, left: right },
    { left, right, bottom: area.bottom, top: bottom },
    { left, right, bottom: top, top: area.top },
  ];
  return pieces
    .filter((piece) => piece.left < piece.right && piece.bottom < piece.top)
    .map(segmentOf);
}

export function paintArea(area: ShellyArea, stroke: ShellySegment, erase: boolean): ShellyArea {
  return erase ? area.flatMap((segment) => subtractSegment(segment, stroke)) : [...area, stroke];
}
