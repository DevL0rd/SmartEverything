import type { ZoneCount } from '@smarteverything/domain';

export interface MouthZone {
  readonly zone: number;
  readonly path: string;
  readonly label: { readonly x: number; readonly y: number };
}

const UPPER_FROM = 160;
const UPPER_TO = 20;
const LOWER_FROM = 200;
const LOWER_TO = 340;
const INNER = 0.58;
const OUTER = 0.94;

function point(cx: number, cy: number, radius: number, degrees: number): readonly [number, number] {
  const radians = (degrees * Math.PI) / 180;
  return [cx + radius * Math.cos(radians), cy - radius * Math.sin(radians)];
}

function fixed(value: number): string {
  return value.toFixed(2);
}

export interface Sector {
  readonly cx: number;
  readonly cy: number;
  readonly inner: number;
  readonly outer: number;
  readonly from: number;
  readonly to: number;
}

export function sectorPath({ cx, cy, inner, outer, from, to }: Sector): string {
  const [ox0, oy0] = point(cx, cy, outer, from);
  const [ox1, oy1] = point(cx, cy, outer, to);
  const [ix1, iy1] = point(cx, cy, inner, to);
  const [ix0, iy0] = point(cx, cy, inner, from);
  const sweep = to < from ? 1 : 0;
  const back = sweep === 1 ? 0 : 1;
  return [
    `M${fixed(ox0)} ${fixed(oy0)}`,
    `A${fixed(outer)} ${fixed(outer)} 0 0 ${String(sweep)} ${fixed(ox1)} ${fixed(oy1)}`,
    `L${fixed(ix1)} ${fixed(iy1)}`,
    `A${fixed(inner)} ${fixed(inner)} 0 0 ${String(back)} ${fixed(ix0)} ${fixed(iy0)}`,
    'Z',
  ].join(' ');
}

function archSectors(
  zones: readonly number[],
  from: number,
  to: number,
  size: number,
): MouthZone[] {
  const half = size / 2;
  const span = (to - from) / zones.length;
  return zones.map((zone, index) => {
    const start = from + span * index;
    const end = start + span;
    const middle = (start + end) / 2;
    const [x, y] = point(half, half, half * ((INNER + OUTER) / 2), middle);
    return {
      zone,
      path: sectorPath({
        cx: half,
        cy: half,
        inner: half * INNER,
        outer: half * OUTER,
        from: start,
        to: end,
      }),
      label: { x, y },
    };
  });
}

export function mouthZones(zones: ZoneCount, size: number): readonly MouthZone[] {
  switch (zones) {
    case 6:
      return [
        ...archSectors([1, 2, 3], UPPER_FROM, UPPER_TO, size),
        ...archSectors([6, 5, 4], LOWER_FROM, LOWER_TO, size),
      ].sort((left, right) => left.zone - right.zone);
    case 4:
      return [
        ...archSectors([1, 2], UPPER_FROM, UPPER_TO, size),
        ...archSectors([4, 3], LOWER_FROM, LOWER_TO, size),
      ].sort((left, right) => left.zone - right.zone);
    case 0:
      return [];
  }
}
