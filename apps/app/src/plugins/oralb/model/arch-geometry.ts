import { TEETH_WIDTHS } from './arch-model';

export const ARCH_BOX = { width: 270, height: 200 } as const;

export type Point = readonly [number, number];

export interface Tooth {
  readonly outer: readonly [Point, Point];
  readonly inner: readonly [Point, Point];
}

export interface QuarterShape {
  readonly index: number;
  readonly teeth: readonly Tooth[];
}

const CENTRE = { x: ARCH_BOX.width / 2, y: ARCH_BOX.height / 2 } as const;
const RADII = { x: 108, y: 74 } as const;
const DEPTH = [0.27, 0.26, 0.23, 0.22, 0.2, 0.19, 0.2] as const;
const MIDLINE_GAP = 5;
const TOOTH_GAP = 1.2;

interface Span {
  readonly back: number;
  readonly front: number;
}

const SPANS: Readonly<Record<number, Span>> = {
  1: { back: 162, front: 90 },
  2: { back: 18, front: 90 },
  3: { back: 342, front: 270 },
  4: { back: 198, front: 270 },
};

function onEllipse(scale: number, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  return [
    CENTRE.x + RADII.x * scale * Math.cos(radians),
    CENTRE.y - RADII.y * scale * Math.sin(radians),
  ];
}

function toothAt(position: number, from: number, to: number): Tooth {
  const depth = DEPTH[position] ?? 0.2;
  const outer = 1 + depth / 2;
  const inner = 1 - depth / 2;
  return {
    outer: [onEllipse(outer, from), onEllipse(outer, to)],
    inner: [onEllipse(inner, from), onEllipse(inner, to)],
  };
}

const TEETH_TOTAL = TEETH_WIDTHS.reduce((sum, width) => sum + width, 0);

function quarterTeeth(span: Span): readonly Tooth[] {
  const direction = span.front > span.back ? 1 : -1;
  const usable = Math.abs(span.front - span.back) - MIDLINE_GAP;
  let cursor = span.back;
  return TEETH_WIDTHS.map((width, position) => {
    const sweep = (width / TEETH_TOTAL) * usable;
    const from = cursor + direction * TOOTH_GAP * 0.5;
    const to = cursor + direction * (sweep - TOOTH_GAP * 0.5);
    cursor += direction * sweep;
    return toothAt(position, from, to);
  });
}

export const QUARTER_SHAPES: readonly QuarterShape[] = [1, 2, 3, 4].map((index) => ({
  index,
  teeth: quarterTeeth(SPANS[index] ?? { back: 0, front: 0 }),
}));

function lerp(from: Point, to: Point, share: number): Point {
  return [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share];
}

function pointText([x, y]: Point): string {
  return `${x.toFixed(1)} ${y.toFixed(1)}`;
}

export function toothPath(tooth: Tooth, share = 1): string {
  const first = lerp(tooth.outer[0], tooth.inner[0], share);
  const second = lerp(tooth.outer[1], tooth.inner[1], share);
  return `M${pointText(tooth.outer[0])}L${pointText(tooth.outer[1])}L${pointText(second)}L${pointText(first)}Z`;
}

export function frontOf(teeth: readonly Tooth[], fills: readonly number[]): Point {
  const lit = fills.map((fill) => fill > 0);
  const last = Math.max(0, lit.lastIndexOf(true));
  const tooth = teeth[last];
  if (tooth === undefined) {
    return [CENTRE.x, CENTRE.y];
  }
  const middle = lerp(tooth.outer[0], tooth.outer[1], 0.5);
  const inside = lerp(tooth.inner[0], tooth.inner[1], 0.5);
  return lerp(middle, inside, fills[last] ?? 0);
}
