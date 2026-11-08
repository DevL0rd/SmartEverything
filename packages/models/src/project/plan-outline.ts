import type { ModelSpecGeometry, ModelSpecPart, ModelSpecTransform } from '@smarteverything/domain';
import { resolveBindable, type ModelParamValues } from '../helpers/estimate';
import type { PathCommand } from '../helpers/path';

export type PlanFillRule = 'nonzero' | 'evenodd';

type Vec3 = readonly [number, number, number];
export type Vec2 = readonly [number, number];
type Rows = readonly [Vec3, Vec3, Vec3];
type Bindable = Parameters<typeof resolveBindable>[0];
type Of<T extends ModelSpecGeometry['type']> = Extract<ModelSpecGeometry, { type: T }>;
type FlatGeometry = Of<'torus' | 'extrude' | 'roundedPlane' | 'glow' | 'ring' | 'grille'>;
type SolidGeometry = Exclude<ModelSpecGeometry, FlatGeometry>;

export interface Affine {
  readonly m: Rows;
  readonly t: Vec3;
}

export type Loops = readonly (readonly Vec2[])[];

interface Outline {
  readonly pieces: readonly (readonly Vec3[])[];
  readonly flat?: Loops;
}

export interface Projected {
  readonly part: ModelSpecPart;
  readonly loops: Loops;
  readonly rule: PlanFillRule;
  readonly top: number;
}

const DEG = Math.PI / 180;
const FLAT_NORMAL = 0.999;
const CURVE_STEPS = 12;
const ORIGIN: Vec3 = [0, 0, 0];
export const IDENTITY: Affine = {
  m: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  t: ORIGIN,
};
const XZ = [0, 2] as const;
const XY = [0, 1] as const;
const YZ = [1, 2] as const;

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const linear = (a: Affine, p: Vec3): Vec3 => [dot(a.m[0], p), dot(a.m[1], p), dot(a.m[2], p)];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const apply = (a: Affine, p: Vec3): Vec3 => add(linear(a, p), a.t);

export function multiply(a: Affine, b: Affine): Affine {
  const c0: Vec3 = [b.m[0][0], b.m[1][0], b.m[2][0]];
  const c1: Vec3 = [b.m[0][1], b.m[1][1], b.m[2][1]];
  const c2: Vec3 = [b.m[0][2], b.m[1][2], b.m[2][2]];
  const row = (r: Vec3): Vec3 => [dot(r, c0), dot(r, c1), dot(r, c2)];
  return { m: [row(a.m[0]), row(a.m[1]), row(a.m[2])], t: apply(a, b.t) };
}

function rotation([x, y, z]: Vec3): Affine {
  const [cx, sx] = [Math.cos(x * DEG), Math.sin(x * DEG)];
  const [cy, sy] = [Math.cos(y * DEG), Math.sin(y * DEG)];
  const [cz, sz] = [Math.cos(z * DEG), Math.sin(z * DEG)];
  const rx: Rows = [
    [1, 0, 0],
    [0, cx, -sx],
    [0, sx, cx],
  ];
  const ry: Rows = [
    [cy, 0, sy],
    [0, 1, 0],
    [-sy, 0, cy],
  ];
  const rz: Rows = [
    [cz, -sz, 0],
    [sz, cz, 0],
    [0, 0, 1],
  ];
  return multiply(multiply({ m: rx, t: ORIGIN }, { m: ry, t: ORIGIN }), { m: rz, t: ORIGIN });
}

function triple(
  values: readonly [Bindable, Bindable, Bindable] | undefined,
  fallback: number,
  params: ModelParamValues,
): Vec3 {
  if (values === undefined) return [fallback, fallback, fallback];
  return [
    resolveBindable(values[0], params),
    resolveBindable(values[1], params),
    resolveBindable(values[2], params),
  ];
}

export function localMatrix(
  transform: ModelSpecTransform | undefined,
  params: ModelParamValues,
): Affine {
  const scale = triple(transform?.scale, 1, params);
  const r = rotation(triple(transform?.rotation, 0, params));
  const row = (v: Vec3): Vec3 => [v[0] * scale[0], v[1] * scale[1], v[2] * scale[2]];
  return {
    m: [row(r.m[0]), row(r.m[1]), row(r.m[2])],
    t: triple(transform?.position, 0, params),
  };
}

function circle(
  centre: Vec3,
  radius: number,
  count: number,
  axes: readonly [0 | 1 | 2, 0 | 1 | 2],
): Vec3[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count;
    const offset: [number, number, number] = [0, 0, 0];
    offset[axes[0]] = Math.cos(angle) * radius;
    offset[axes[1]] = Math.sin(angle) * radius;
    return add(centre, offset);
  });
}

const ball = (centre: Vec3, radius: number): Vec3[] => [
  ...circle(centre, radius, 12, XZ),
  ...circle(centre, radius, 12, XY),
  ...circle(centre, radius, 12, YZ),
];

const ringLoop = (radius: number, count: number): Vec2[] =>
  circle(ORIGIN, radius, count, XY).map(([x, y]) => [x, y]);

function boxShell(size: Vec3, radius: number, y = 0): Vec3[] {
  const r = Math.min(radius, size[0] / 2, size[1] / 2, size[2] / 2);
  const inner: Vec3 = [size[0] / 2 - r, size[1] / 2 - r, size[2] / 2 - r];
  const signs = [-1, 1];
  return signs.flatMap((sx) =>
    signs.flatMap((sy) =>
      signs.flatMap((sz) => ball([sx * inner[0], y + sy * inner[1], sz * inner[2]], r)),
    ),
  );
}

function roundedRectLoop(width: number, height: number, radius: number): Vec2[] {
  const r = Math.min(radius, width / 2, height / 2);
  const [x, y] = [width / 2 - r, height / 2 - r];
  const corners: readonly Vec2[] = [
    [x, y],
    [-x, y],
    [-x, -y],
    [x, -y],
  ];
  return corners.flatMap(([cx, cy], index) =>
    Array.from({ length: 5 }, (_, step): Vec2 => {
      const angle = ((index + step / 4) * Math.PI) / 2;
      return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
    }),
  );
}

function sphereShell(spec: Of<'sphere'>, radius: number): Vec3[] {
  const [phi0, phiLength] = [(spec.phiStart ?? 0) * DEG, (spec.phiLength ?? 360) * DEG];
  const [theta0, thetaLength] = [(spec.thetaStart ?? 0) * DEG, (spec.thetaLength ?? 180) * DEG];
  return Array.from({ length: 9 }, (_, i) => theta0 + (thetaLength * i) / 8).flatMap((theta) =>
    Array.from({ length: 25 }, (_, j): Vec3 => {
      const phi = phi0 + (phiLength * j) / 24;
      const across = Math.sin(theta) * radius;
      return [-Math.cos(phi) * across, Math.cos(theta) * radius, Math.sin(phi) * across];
    }),
  );
}

function slatShells(spec: Of<'slats'>, v: (value: Bindable) => number): Vec3[][] {
  const size: Vec3 = [v(spec.width), v(spec.height), v(spec.depth)];
  const spacing = v(spec.spacing);
  const span = (spec.count - 1) * spacing;
  return Array.from({ length: spec.count }, (_, i) => boxShell(size, 0, span / 2 - i * spacing));
}

function tubeShells(spec: Of<'tube'>, radius: number): Vec3[][] {
  return spec.points
    .slice(1)
    .map((point, i) => [...ball(spec.points[i] ?? point, radius), ...ball(point, radius)]);
}

function segmentsOf(spec: ModelSpecGeometry): number {
  return 'segments' in spec ? (spec.segments ?? 48) : 48;
}

function solidOutline(spec: SolidGeometry, v: (value: Bindable) => number): Outline {
  const count = segmentsOf(spec);
  switch (spec.type) {
    case 'roundedBox':
      return { pieces: [boxShell([v(spec.width), v(spec.height), v(spec.depth)], v(spec.radius))] };
    case 'cylinder': {
      const half = v(spec.height) / 2;
      const top = circle([0, half, 0], v(spec.topRadius), count, XZ);
      return { pieces: [[...top, ...circle([0, -half, 0], v(spec.bottomRadius), count, XZ)]] };
    }
    case 'capsule': {
      const [r, half] = [v(spec.radius), v(spec.length) / 2];
      return { pieces: [[...ball([0, half, 0], r), ...ball([0, -half, 0], r)]] };
    }
    case 'sphere':
      return { pieces: [sphereShell(spec, v(spec.radius))] };
    case 'lathe':
      return {
        pieces: [spec.profile.flatMap(([x, y]) => circle([0, y, 0], Math.abs(x), count, XZ))],
      };
    case 'tube':
      return { pieces: tubeShells(spec, v(spec.radius)) };
    case 'slats':
      return { pieces: slatShells(spec, v) };
  }
}

function curvePoints(from: Vec2, command: PathCommand): Vec2[] {
  if (command.op === 'move' || command.op === 'line') return [[command.x, command.y]];
  if (command.op === 'arc') return arcPoints(from, command);
  const c1: Vec2 =
    command.op === 'quadratic' ? [command.cx, command.cy] : [command.c1x, command.c1y];
  const c2: Vec2 = command.op === 'quadratic' ? c1 : [command.c2x, command.c2y];
  return Array.from({ length: CURVE_STEPS }, (_, i): Vec2 => {
    const t = (i + 1) / CURVE_STEPS;
    const u = 1 - t;
    const w =
      command.op === 'quadratic'
        ? [u * u, u * t, u * t, t * t]
        : [u ** 3, 3 * u * u * t, 3 * u * t * t, t ** 3];
    const [a, b, c, d] = [w[0] ?? 0, w[1] ?? 0, w[2] ?? 0, w[3] ?? 0];
    const axis = (k: 0 | 1): number =>
      a * from[k] + b * c1[k] + c * c2[k] + d * (k === 0 ? command.x : command.y);
    return [axis(0), axis(1)];
  });
}

function arcPoints(from: Vec2, command: Extract<PathCommand, { op: 'arc' }>): Vec2[] {
  if (from[0] === command.x && from[1] === command.y) return [];
  const phi = (command.rotation ?? 0) * DEG;
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
  const [dx, dy] = [(from[0] - command.x) / 2, (from[1] - command.y) / 2];
  const [x1, y1] = [cos * dx + sin * dy, -sin * dx + cos * dy];
  const grow = Math.max(1, Math.sqrt((x1 * x1) / command.rx ** 2 + (y1 * y1) / command.ry ** 2));
  const [rx, ry] = [command.rx * grow, command.ry * grow];
  const across = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const reach = Math.sqrt(Math.max(0, (rx * rx * ry * ry - across) / across));
  const sign = command.large === command.sweep ? -1 : 1;
  const [cx1, cy1] = [(sign * reach * rx * y1) / ry, (-sign * reach * ry * x1) / rx];
  const start = Math.atan2((y1 - cy1) / ry, (x1 - cx1) / rx);
  let delta = Math.atan2((-y1 - cy1) / ry, (-x1 - cx1) / rx) - start;
  if (command.sweep && delta < 0) delta += 2 * Math.PI;
  if (!command.sweep && delta > 0) delta -= 2 * Math.PI;
  const [mx, my] = [(from[0] + command.x) / 2, (from[1] + command.y) / 2];
  return Array.from({ length: CURVE_STEPS }, (_, i): Vec2 => {
    const angle = start + (delta * (i + 1)) / CURVE_STEPS;
    const [ex, ey] = [rx * Math.cos(angle), ry * Math.sin(angle)];
    return [
      cos * ex - sin * ey + cx1 * cos - cy1 * sin + mx,
      sin * ex + cos * ey + cx1 * sin + cy1 * cos + my,
    ];
  });
}

function openLoop(loop: readonly Vec2[]): readonly Vec2[] {
  const first = loop[0];
  const last = loop[loop.length - 1];
  const closed = loop.length > 1 && first?.[0] === last?.[0] && first?.[1] === last?.[1];
  return closed ? loop.slice(0, -1) : loop;
}

export function flattenPath(path: readonly PathCommand[]): Loops {
  const loops: Vec2[][] = [];
  for (const command of path) {
    const loop = loops[loops.length - 1];
    const from = loop?.[loop.length - 1];
    if (command.op === 'move' || loop === undefined || from === undefined)
      loops.push([[command.x, command.y]]);
    else loop.push(...curvePoints(from, command));
  }
  return loops.map(openLoop).filter((loop) => loop.length > 2);
}

function lifted(loops: Loops, zs: readonly number[]): Vec3[][] {
  return [loops.flatMap((loop) => zs.flatMap((z) => loop.map(([x, y]): Vec3 => [x, y, z])))];
}

function flatOutline(spec: FlatGeometry, v: (value: Bindable) => number): Outline {
  const count = segmentsOf(spec);
  switch (spec.type) {
    case 'torus': {
      const [r, tube] = [v(spec.radius), v(spec.tube)];
      const flat = [ringLoop(r + tube, count), ...(r > tube ? [ringLoop(r - tube, count)] : [])];
      return { flat, pieces: [circle(ORIGIN, r, count, XY).flatMap((c) => ball(c, tube))] };
    }
    case 'extrude': {
      const flat = flattenPath(spec.path);
      const half = v(spec.depth) / 2 + (spec.bevel === undefined ? 0 : v(spec.bevel));
      return { flat, pieces: lifted(flat, [-half, half]) };
    }
    case 'roundedPlane': {
      const flat = [roundedRectLoop(v(spec.width), v(spec.height), v(spec.radius))];
      return { flat, pieces: lifted(flat, [0]) };
    }
    case 'glow': {
      const [width, height] = [v(spec.width), v(spec.height)];
      const flat = [roundedRectLoop(width, height, Math.min(width, height) / 2)];
      return { flat, pieces: lifted(flat, [0]) };
    }
    case 'ring': {
      const flat = [ringLoop(v(spec.outerRadius), count), ringLoop(v(spec.innerRadius), count)];
      return { flat: v(spec.innerRadius) > 0 ? flat : flat.slice(0, 1), pieces: lifted(flat, [0]) };
    }
    case 'grille': {
      const flat = [roundedRectLoop(v(spec.width), v(spec.height), 0)];
      return { flat, pieces: lifted(flat, [0]) };
    }
  }
}

function isFlat(spec: ModelSpecGeometry): spec is FlatGeometry {
  return ['torus', 'extrude', 'roundedPlane', 'glow', 'ring', 'grille'].includes(spec.type);
}

function hull(points: readonly Vec2[]): Vec2[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Vec2, a: Vec2, b: Vec2): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const chain = (list: readonly Vec2[]): Vec2[] => {
    const out: Vec2[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2] ?? p, out[out.length - 1] ?? p, p) <= 0)
        out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...chain(sorted), ...chain([...sorted].reverse())];
}

const plan = (p: Vec3): Vec2 => [p[0], p[2]];

export function projectPart(
  part: ModelSpecPart,
  world: Affine,
  params: ModelParamValues,
): Projected {
  const v = (value: Bindable): number => resolveBindable(value, params);
  const outline = isFlat(part.geometry)
    ? flatOutline(part.geometry, v)
    : solidOutline(part.geometry, v);
  const worldPieces = outline.pieces.map((piece) => piece.map((p) => apply(world, p)));
  const top = Math.max(...worldPieces.flat().map((p) => p[1]));
  const normal = linear(world, [0, 0, 1]);
  const facesUp = Math.abs(normal[1]) >= FLAT_NORMAL * Math.hypot(...normal);
  if (outline.flat !== undefined && facesUp) {
    const loops = outline.flat.map((loop) => loop.map(([x, y]) => plan(apply(world, [x, y, 0]))));
    return { part, loops, rule: 'evenodd', top };
  }
  const loops = worldPieces.map((piece) => hull(piece.map(plan))).filter((loop) => loop.length > 2);
  return { part, loops, rule: 'nonzero', top };
}
