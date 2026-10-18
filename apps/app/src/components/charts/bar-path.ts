import { range } from 'd3-array';
import { scaleBand } from 'd3-scale';

export interface BarBox {
  readonly x: number;
  readonly width: number;
  readonly top: number;
  readonly bottom: number;
}

export interface BarRadii {
  readonly top: number;
  readonly bottom: number;
}

export interface BarSlot {
  readonly x: number;
  readonly width: number;
}

export interface SlotRules {
  readonly gap: number;
  readonly min: number;
  readonly max?: number;
}

export function barPath(box: BarBox, radii: BarRadii): string {
  'worklet';
  const { x, width, top, bottom } = box;
  const height = bottom - top;
  const roundTop = Math.min(radii.top, width / 2);
  const roundBottom = Math.min(radii.bottom, width / 2);
  const fit = Math.min(1, height / Math.max(roundTop + roundBottom, 1e-6));
  const rt = roundTop * fit;
  const rb = roundBottom * fit;
  const right = x + width;
  const n = (value: number): string => value.toFixed(2);
  const corner = (r: number, toX: number, toY: number): string =>
    r > 0 ? `A${n(r)} ${n(r)} 0 0 1 ${n(toX)} ${n(toY)}` : `L${n(toX)} ${n(toY)}`;
  return [
    `M${n(x)} ${n(bottom - rb)}`,
    `V${n(top + rt)}`,
    corner(rt, x + rt, top),
    `H${n(right - rt)}`,
    corner(rt, right, top + rt),
    `V${n(bottom - rb)}`,
    corner(rb, right - rb, bottom),
    `H${n(x + rb)}`,
    corner(rb, x, bottom - rb),
    'Z',
  ].join(' ');
}

export function barSlots(count: number, span: number, rules: SlotRules): BarSlot[] {
  const band = scaleBand<number>()
    .domain(range(count))
    .range([0, span])
    .paddingInner(rules.gap)
    .paddingOuter(rules.gap / 2);
  const bandwidth = band.bandwidth();
  const width = Math.max(rules.min, Math.min(rules.max ?? bandwidth, bandwidth));
  return range(count).map((index) => ({
    x: (band(index) ?? 0) + (bandwidth - width) / 2,
    width,
  }));
}
