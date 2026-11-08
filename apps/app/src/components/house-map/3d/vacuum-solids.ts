import type { VacuumPoint } from '@smarteverything/domain';
import { groundPosition, type Collector, type Rgb, type Vec3 } from './mesh';

export interface Profile {
  readonly r: number;
  readonly y: number;
}

export interface Lathe {
  readonly centre: VacuumPoint;
  readonly segments: number;
}

export type Paint = (angle: number) => Rgb;

const UV_PER_METRE = 2;

const CORNERS: readonly VacuumPoint[] = [
  { x: 1, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
  { x: 1, y: -1 },
];

export function shade(colour: Rgb, factor: number): Rgb {
  const [red, green, blue] = colour;
  return [red * factor, green * factor, blue * factor];
}

export function mix(from: Rgb, to: Rgb, share: number): Rgb {
  return [
    from[0] + (to[0] - from[0]) * share,
    from[1] + (to[1] - from[1]) * share,
    from[2] + (to[2] - from[2]) * share,
  ];
}

function vertex(collector: Collector, position: Vec3, normal: Vec3, colour: Rgb): number {
  const index = collector.positions.length / 3;
  collector.positions.push(...position);
  collector.normals.push(...normal);
  collector.colours.push(...colour);
  collector.uvs.push(position[0] * UV_PER_METRE, position[2] * UV_PER_METRE);
  return index;
}

function around(lathe: Lathe, radius: number, angle: number): VacuumPoint {
  return {
    x: lathe.centre.x + radius * Math.cos(angle),
    y: lathe.centre.y + radius * Math.sin(angle),
  };
}

function bandNormal(from: Profile, to: Profile, angle: number): Vec3 {
  const radial = to.y - from.y;
  const up = from.r - to.r;
  const length = Math.hypot(radial, up) || 1;
  return [(radial / length) * Math.cos(angle), up / length, (-radial / length) * Math.sin(angle)];
}

export function addBand(
  collector: Collector,
  lathe: Lathe,
  edge: readonly [Profile, Profile],
  paint: Paint,
): void {
  const [from, to] = edge;
  const step = (2 * Math.PI) / lathe.segments;
  for (let index = 0; index < lathe.segments; index += 1) {
    const start = index * step;
    const end = start + step;
    const colour = paint(start + step / 2);
    const corners = [
      [from, start],
      [from, end],
      [to, end],
      [to, start],
    ] as const;
    const first = collector.positions.length / 3;
    for (const [profile, angle] of corners) {
      vertex(
        collector,
        groundPosition(around(lathe, profile.r, angle), profile.y),
        bandNormal(from, to, angle),
        colour,
      );
    }
    collector.indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
}

export function addAnnulus(
  collector: Collector,
  lathe: Lathe,
  ring: { readonly inner: number; readonly outer: number; readonly y: number },
  colour: Rgb,
): void {
  addBand(
    collector,
    lathe,
    [
      { r: ring.outer, y: ring.y },
      { r: ring.inner, y: ring.y },
    ],
    () => colour,
  );
}

export function addCap(
  collector: Collector,
  lathe: Lathe,
  disc: { readonly r: number; readonly y: number },
  colour: Rgb,
): void {
  const centre = vertex(collector, groundPosition(lathe.centre, disc.y), [0, 1, 0], colour);
  const rim = Array.from({ length: lathe.segments }, (_, index) =>
    vertex(
      collector,
      groundPosition(around(lathe, disc.r, (index / lathe.segments) * 2 * Math.PI), disc.y),
      [0, 1, 0],
      colour,
    ),
  );
  rim.forEach((current, index) => {
    collector.indices.push(centre, current, rim[(index + 1) % rim.length] ?? current);
  });
}

export function roundedRing(
  min: VacuumPoint,
  max: VacuumPoint,
  radius: number,
  steps: number,
): readonly VacuumPoint[] {
  const centre = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2 };
  const half = { x: (max.x - min.x) / 2 - radius, y: (max.y - min.y) / 2 - radius };
  return CORNERS.flatMap((corner, quarter) =>
    Array.from({ length: steps + 1 }, (_, index) => {
      const angle = ((quarter + index / steps) * Math.PI) / 2;
      return {
        x: centre.x + corner.x * half.x + radius * Math.cos(angle),
        y: centre.y + corner.y * half.y + radius * Math.sin(angle),
      };
    }),
  );
}
