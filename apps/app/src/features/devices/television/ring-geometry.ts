export type Direction = 'up' | 'right' | 'down' | 'left';

export interface Wedge {
  readonly direction: Direction;
  readonly angle: number;
}

export const WEDGES: readonly Wedge[] = [
  { direction: 'up', angle: -90 },
  { direction: 'right', angle: 0 },
  { direction: 'down', angle: 90 },
  { direction: 'left', angle: 180 },
];

const INNER_SHARE = 0.4;
const HALF_SPAN = 44;
const GAP = 1;
const HIT_PAD = 8;
const CHEVRON_DESIGN_RADIUS = 116;
const CHEVRON_SCALE = 1.05;
const CHEVRON_REACH_SHARE = 0.62;

export interface RingBox {
  readonly size: number;
  readonly inner: number;
}

export function ringBox(size: number): RingBox {
  return { size, inner: (size / 2) * INNER_SHARE };
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function point(box: RingBox, radius: number, degrees: number): string {
  const centre = box.size / 2;
  const x = centre + radius * Math.cos(radians(degrees));
  const y = centre + radius * Math.sin(radians(degrees));
  return `${x.toFixed(2)} ${y.toFixed(2)}`;
}

function wedgePath(box: RingBox, angle: number, span: number): string {
  const outer = box.size / 2 - GAP;
  const first = angle - span;
  const last = angle + span;
  return [
    `M${point(box, box.inner, first)}`,
    `L${point(box, outer, first)}`,
    `A${String(outer)} ${String(outer)} 0 0 1 ${point(box, outer, last)}`,
    `L${point(box, box.inner, last)}`,
    `A${String(box.inner)} ${String(box.inner)} 0 0 0 ${point(box, box.inner, first)}Z`,
  ].join('');
}

export function wedgeShapePath(box: RingBox, angle: number): string {
  return wedgePath(box, angle, HALF_SPAN);
}

export function ringPath(box: RingBox): string {
  return WEDGES.map((wedge) => wedgeShapePath(box, wedge.angle)).join('');
}

export function chevronsPath(box: RingBox): string {
  const centre = box.size / 2;
  const scale = (box.size / 2 / CHEVRON_DESIGN_RADIUS) * CHEVRON_SCALE;
  return WEDGES.map((wedge) => {
    const reach = (box.size / 2) * CHEVRON_REACH_SHARE;
    const cx = centre + reach * Math.cos(radians(wedge.angle));
    const cy = centre + reach * Math.sin(radians(wedge.angle));
    const turn = radians(wedge.angle + 90);
    const spots: readonly (readonly [number, number])[] = [
      [-8, 3.5],
      [0, -4.5],
      [8, 3.5],
    ];
    const [first, ...rest] = spots.map(([x, y]) => {
      const px = cx + (x * Math.cos(turn) - y * Math.sin(turn)) * scale;
      const py = cy + (x * Math.sin(turn) + y * Math.cos(turn)) * scale;
      return `${px.toFixed(2)} ${py.toFixed(2)}`;
    });
    return `M${first ?? ''}${rest.map((spot) => `L${spot}`).join('')}`;
  }).join('');
}

export function directionAt(box: RingBox, x: number, y: number): Direction | null {
  const centre = box.size / 2;
  const dx = x - centre;
  const dy = y - centre;
  const reach = Math.hypot(dx, dy);
  if (reach < box.inner || reach > centre + HIT_PAD) {
    return null;
  }
  const degrees = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (degrees >= -135 && degrees < -45) {
    return 'up';
  }
  if (degrees >= -45 && degrees < 45) {
    return 'right';
  }
  return degrees >= 45 && degrees < 135 ? 'down' : 'left';
}
