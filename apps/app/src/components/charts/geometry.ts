export interface Ring {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
}

export interface XY {
  readonly x: number;
  readonly y: number;
}

const FULL_TURN = 360;
const HALF_TURN = 180;

export function pointOn(ring: Ring, degrees: number): XY {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return { x: ring.cx + ring.r * Math.cos(radians), y: ring.cy + ring.r * Math.sin(radians) };
}

export function polar(centre: number, radius: number, degrees: number): XY {
  return pointOn({ cx: centre, cy: centre, r: radius }, degrees);
}

export function formatPoint(point: XY): string {
  return `${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
}

export function arcPath(ring: Ring, from: number, to: number): string {
  const r = String(ring.r);
  const sweep = to - from;
  const start = formatPoint(pointOn(ring, from));
  if (sweep >= FULL_TURN) {
    const half = formatPoint(pointOn(ring, from + HALF_TURN));
    return `M${start} A${r} ${r} 0 1 1 ${half} A${r} ${r} 0 1 1 ${start}`;
  }
  const end = formatPoint(pointOn(ring, to));
  return `M${start} A${r} ${r} 0 ${sweep > HALF_TURN ? '1' : '0'} 1 ${end}`;
}

export function circlePath(ring: Ring): string {
  return `${arcPath(ring, 0, FULL_TURN)} Z`;
}

export function angleAt(centre: number, point: XY): number {
  const degrees = (Math.atan2(point.x - centre, centre - point.y) * 180) / Math.PI;
  return (degrees + FULL_TURN) % FULL_TURN;
}

export function arcLength(radius: number, sweep: number): number {
  return (radius * Math.PI * Math.min(sweep, FULL_TURN)) / 180;
}
