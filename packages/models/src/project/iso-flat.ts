import {
  modelParamValues,
  stillParts,
  type ModelSpec,
  type ModelSpecGeometry,
  type ModelSpecPart,
} from '@smarteverything/domain';
import { resolveBindable, type ModelLod, type ModelParamValues } from '../helpers/estimate';
import {
  IDENTITY,
  flattenPath,
  localMatrix,
  multiply,
  projectPart,
  type Affine,
  type Loops,
  type PlanFillRule,
  type Vec2,
} from './plan-outline';
import {
  loopsPath,
  mixColor,
  type PlanBounds,
  type PlanLayer,
  type PlanSymbolOptions,
  type PlanTheme,
} from './plan-symbol';

export interface IsoCamera {
  readonly yaw: number;
  readonly pitch: number;
}

export const HOUSE_CAMERA: IsoCamera = { yaw: 30, pitch: 18 };

export const ISO_LOD: ModelLod = 1;

export interface IsoFlatOptions extends PlanSymbolOptions {
  readonly camera?: IsoCamera;
  readonly lod?: ModelLod;
}

export type IsoFace = 'side' | 'face' | 'panel';

export interface IsoLayer extends Omit<PlanLayer, 'top'> {
  readonly face: IsoFace;
  readonly shade: number;
}

export interface IsoFlat {
  readonly layers: readonly IsoLayer[];
  readonly bounds: PlanBounds;
  readonly unresolved: readonly string[];
  readonly camera: IsoCamera;
}

type Vec3 = readonly [number, number, number];
type Axis = 0 | 1 | 2;
type Bindable = Parameters<typeof resolveBindable>[0];
type Of<T extends ModelSpecGeometry['type']> = Extract<ModelSpecGeometry, { type: T }>;
type Override = NonNullable<ModelSpec['finishes']>[string][string];

interface View {
  readonly right: Vec3;
  readonly near: Vec3;
  readonly down: Vec3;
  readonly light: Vec3;
}

interface Context {
  readonly part: ModelSpecPart;
  readonly world: Affine;
  readonly params: ModelParamValues;
  readonly view: View;
  readonly theme: PlanTheme;
}

interface Resolved {
  readonly spec: ModelSpec;
  readonly finish: string | undefined;
  readonly colors: Readonly<Record<string, string>> | undefined;
}

interface Shape {
  readonly face: IsoFace;
  readonly loops: Loops;
  readonly rule: PlanFillRule;
  readonly normal: Vec3;
}

interface Box {
  readonly min: Vec3;
  readonly max: Vec3;
}

interface Look {
  readonly color: string;
  readonly opacity: number;
}

interface Cap {
  readonly y: number;
  readonly radius: number;
  readonly up: boolean;
}

const DEG = Math.PI / 180;
const EPS = 1e-9;
const TOUCH = 1e-6;
const AMBIENT = 0.35;
const OUTLINE_DARKEN = 0.35;
const WHITE = '#FFFFFF';
const BLACK = '#000000';
const NEUTRAL: Readonly<Record<PlanTheme, string>> = { light: '#9AA0A6', dark: '#5F6368' };
const SHADE: Readonly<Record<PlanTheme, { readonly lift: number; readonly sink: number }>> = {
  light: { lift: 0.2, sink: 0.3 },
  dark: { lift: 0.12, sink: 0.45 },
};
const AXES: readonly Axis[] = [0, 1, 2];
const OTHERS: Readonly<Record<Axis, readonly [Axis, Axis]>> = { 0: [1, 2], 1: [2, 0], 2: [0, 1] };
const PLANAR: ReadonlySet<string> = new Set(['roundedPlane', 'ring', 'grille', 'torus']);
const E: Readonly<Record<Axis, Vec3>> = { 0: [1, 0, 0], 1: [0, 1, 0], 2: [0, 0, 1] };
const ORIGIN: Vec3 = [0, 0, 0];

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => (length(a) > EPS ? scale(a, 1 / length(a)) : a);
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const linear = (a: Affine, p: Vec3): Vec3 => [dot(a.m[0], p), dot(a.m[1], p), dot(a.m[2], p)];
const apply = (a: Affine, p: Vec3): Vec3 => add(linear(a, p), a.t);

function viewOf({ yaw, pitch }: IsoCamera): View {
  const [cy, sy] = [Math.cos(yaw * DEG), Math.sin(yaw * DEG)];
  const [cp, sp] = [Math.cos(pitch * DEG), Math.sin(pitch * DEG)];
  const right: Vec3 = [cy, 0, -sy];
  const near: Vec3 = [sy * cp, sp, cy * cp];
  const down: Vec3 = [sy * sp, -cp, cy * sp];
  const light = unit(add(add(scale(right, -0.55), scale(E[1], 0.75)), scale(near, 0.45)));
  return { right, near, down, light };
}

const screen = (view: View, p: Vec3): Vec2 => [dot(view.right, p), dot(view.down, p)];
const viewAffine = (view: View): Affine => ({ m: [view.right, view.near, view.down], t: ORIGIN });

function planarAffine(view: View, world: Affine): Affine {
  const a = multiply(viewAffine(view), world);
  const row = (r: Vec3, z: number): Vec3 => [r[0], r[1], z];
  return { m: [row(a.m[0], 0), row(a.m[1], 1), row(a.m[2], 0)], t: a.t };
}

const planeNormal = (world: Affine): Vec3 => cross(linear(world, E[0]), linear(world, E[1]));

function sideNormal(axis: Vec3, view: View): Vec3 {
  const along = unit(axis);
  const across = sub(view.near, scale(along, dot(view.near, along)));
  return length(across) > EPS ? across : view.near;
}

function positive(loop: readonly Vec2[]): readonly Vec2[] {
  const area = loop.reduce((sum, [x, y], i) => {
    const [nx, ny] = loop[(i + 1) % loop.length] ?? [x, y];
    return sum + x * ny - nx * y;
  }, 0);
  return area < 0 ? [...loop].reverse() : loop;
}

function boxFace(ctx: Context, half: Vec3, k: Axis, sign: number): Shape[] {
  const [i, j] = OTHERS[k];
  const corner = (a: number, b: number): Vec3 => {
    const p: [number, number, number] = [0, 0, 0];
    p[k] = sign * half[k];
    p[i] = a * half[i];
    p[j] = b * half[j];
    return apply(ctx.world, p);
  };
  const quad = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)] as const;
  const raw = cross(sub(quad[1], quad[0]), sub(quad[3], quad[0]));
  const outward = linear(ctx.world, scale(E[k], sign));
  const normal = dot(raw, outward) < 0 ? scale(raw, -1) : raw;
  if (dot(normal, ctx.view.near) <= EPS * length(normal)) return [];
  const loops = [quad.map((p) => screen(ctx.view, p))];
  return [{ face: 'face', loops, rule: 'nonzero', normal }];
}

function boxShapes(ctx: Context, geometry: Of<'roundedBox'>): Shape[] {
  const v = (value: Bindable): number => resolveBindable(value, ctx.params);
  const half: Vec3 = [v(geometry.width) / 2, v(geometry.height) / 2, v(geometry.depth) / 2];
  return AXES.flatMap((k) => [-1, 1].flatMap((sign) => boxFace(ctx, half, k, sign)));
}

function extrudeShapes(ctx: Context, geometry: Of<'extrude'>): Shape[] {
  const v = (value: Bindable): number => resolveBindable(value, ctx.params);
  const half = v(geometry.depth) / 2 + (geometry.bevel === undefined ? 0 : v(geometry.bevel));
  const loops = flattenPath(geometry.path);
  const at = (z: number): Vec3[][] =>
    loops.map((loop) => loop.map(([x, y]) => apply(ctx.world, [x, y, z])));
  const [back, front] = [at(-half), at(half)];
  const axis = planeNormal(ctx.world);
  const frontNear = dot(axis, ctx.view.near) >= 0;
  const toScreen = (loop: readonly Vec3[]): readonly Vec2[] => loop.map((p) => screen(ctx.view, p));
  const cap: Shape = {
    face: 'face',
    loops: (frontNear ? front : back).map(toScreen),
    rule: 'evenodd',
    normal: frontNear ? axis : scale(axis, -1),
  };
  if (half <= EPS) return [cap];
  const walls = back.flatMap((loop, i) =>
    loop.map((a, k): readonly Vec3[] => {
      const [b, near] = [loop[(k + 1) % loop.length] ?? a, front[i] ?? loop];
      return [a, b, near[(k + 1) % loop.length] ?? b, near[k] ?? a];
    }),
  );
  const side: Shape = {
    face: 'side',
    loops: walls.map((quad) => positive(toScreen(quad))),
    rule: 'nonzero',
    normal: sideNormal(axis, ctx.view),
  };
  return [side, cap];
}

function planarShape(ctx: Context): Shape {
  const projected = projectPart(ctx.part, planarAffine(ctx.view, ctx.world), ctx.params);
  const raw = planeNormal(ctx.world);
  const normal = dot(raw, ctx.view.near) < 0 ? scale(raw, -1) : raw;
  return { face: 'panel', loops: projected.loops, rule: projected.rule, normal };
}

function solidShape(ctx: Context): Shape {
  const projected = projectPart(ctx.part, multiply(viewAffine(ctx.view), ctx.world), ctx.params);
  const round = ctx.part.geometry.type === 'sphere';
  const normal = round ? ctx.view.near : sideNormal(linear(ctx.world, E[1]), ctx.view);
  return { face: 'side', loops: projected.loops, rule: 'nonzero', normal };
}

function capEnds(geometry: ModelSpecGeometry, params: ModelParamValues): readonly Cap[] {
  const v = (value: Bindable): number => resolveBindable(value, params);
  if (geometry.type === 'cylinder') {
    const half = v(geometry.height) / 2;
    return [
      { y: half, radius: v(geometry.topRadius), up: true },
      { y: -half, radius: v(geometry.bottomRadius), up: false },
    ];
  }
  if (geometry.type !== 'lathe') return [];
  const sorted = [...geometry.profile].sort((a, b) => b[1] - a[1]);
  return [sorted[0], sorted[sorted.length - 1]].flatMap((point, i) =>
    point === undefined ? [] : [{ y: point[1], radius: Math.abs(point[0]), up: i === 0 }],
  );
}

function capShape(ctx: Context, cap: Cap): Shape[] {
  if (cap.radius <= EPS) return [];
  const tilt = cap.up ? -90 : 90;
  const world = multiply(
    ctx.world,
    localMatrix({ position: [0, cap.y, 0], rotation: [tilt, 0, 0] }, {}),
  );
  const normal = planeNormal(world);
  if (dot(normal, ctx.view.near) <= EPS * length(normal)) return [];
  const disc: ModelSpecPart = {
    id: ctx.part.id,
    material: ctx.part.material,
    geometry: { type: 'ring', innerRadius: 0, outerRadius: cap.radius },
  };
  const projected = projectPart(disc, planarAffine(ctx.view, world), ctx.params);
  return [{ face: 'face', loops: projected.loops, rule: 'nonzero', normal }];
}

function partShapes(ctx: Context): readonly Shape[] {
  const geometry = ctx.part.geometry;
  if (geometry.type === 'roundedBox') return boxShapes(ctx, geometry);
  if (geometry.type === 'extrude') return extrudeShapes(ctx, geometry);
  if (PLANAR.has(geometry.type)) return [planarShape(ctx)];
  const caps = capEnds(geometry, ctx.params).flatMap((cap) => capShape(ctx, cap));
  return [solidShape(ctx), ...caps];
}

function reach(ctx: Context, k: Axis, sign: number): number {
  const probe: Affine = { m: [E[0], scale(E[k], sign), E[2]], t: ORIGIN };
  return sign * projectPart(ctx.part, multiply(probe, ctx.world), ctx.params).top;
}

function worldBox(ctx: Context): Box {
  const end = (sign: number): Vec3 => [
    reach(ctx, 0, sign),
    reach(ctx, 1, sign),
    reach(ctx, 2, sign),
  ];
  return { min: end(-1), max: end(1) };
}

function inFront(a: Box, b: Box, near: Vec3): boolean {
  return AXES.some((k) => {
    if (Math.abs(near[k]) <= EPS) return false;
    return near[k] > 0 ? a.min[k] >= b.max[k] - TOUCH : a.max[k] <= b.min[k] + TOUCH;
  });
}

function paintOrder(boxes: readonly Box[], near: Vec3): readonly number[] {
  const after = boxes.map((a, i) =>
    boxes.flatMap((b, j) => (j !== i && inFront(b, a, near) && !inFront(a, b, near) ? [j] : [])),
  );
  const blocked = boxes.map((_, i) => after.filter((list) => list.includes(i)).length);
  const keys = boxes.map((box) => dot(scale(add(box.min, box.max), 0.5), near));
  const pending = new Set(boxes.map((_, i) => i));
  const order: number[] = [];
  while (pending.size > 0) {
    const all = [...pending];
    const ready = all.filter((i) => blocked[i] === 0);
    const pool = ready.length > 0 ? ready : all;
    const next = pool.reduce((best, i) => ((keys[i] ?? 0) < (keys[best] ?? 0) ? i : best));
    pending.delete(next);
    order.push(next);
    for (const j of after[next] ?? []) blocked[j] = (blocked[j] ?? 0) - 1;
  }
  return order;
}

function worldMatrices(spec: ModelSpec, params: ModelParamValues): ReadonlyMap<string, Affine> {
  const byId = new Map(spec.parts.map((part) => [part.id, part]));
  const worlds = new Map<string, Affine>();
  const worldOf = (part: ModelSpecPart): Affine => {
    const known = worlds.get(part.id);
    if (known !== undefined) return known;
    const parent = part.parent === undefined ? undefined : byId.get(part.parent);
    const base = parent === undefined ? IDENTITY : worldOf(parent);
    const world = multiply(base, localMatrix(part.transform, params));
    worlds.set(part.id, world);
    return world;
  };
  spec.parts.forEach(worldOf);
  return worlds;
}

function finishName(spec: ModelSpec, finish: string | undefined): string | undefined {
  if (finish !== undefined && spec.finishes?.[finish] === undefined) {
    throw new Error(`model ${spec.id} has no finish ${finish}`);
  }
  return finish ?? spec.defaultFinish;
}

function overrideOf(at: Resolved, slot: string): Override {
  return at.finish === undefined ? {} : (at.spec.finishes?.[at.finish]?.[slot] ?? {});
}

function slotLook(slot: string, at: Resolved): Look | string {
  const base = at.spec.materials[slot];
  if (base === undefined) return `slot:${slot}`;
  const override = overrideOf(at, slot);
  const look = override.color !== undefined || override.finish !== undefined ? override : base;
  const opacity = override.opacity ?? base.opacity ?? 1;
  if (look.color !== undefined) return { color: look.color, opacity };
  const token = look.finish ?? '';
  const color = at.colors?.[token];
  return color === undefined ? `token:${token}` : { color, opacity };
}

function layerOf(ctx: Context, shape: Shape, look: Look): IsoLayer {
  const shade = AMBIENT + (1 - AMBIENT) * Math.max(0, dot(unit(shape.normal), ctx.view.light));
  const { lift, sink } = SHADE[ctx.theme];
  const fill = mixColor(mixColor(look.color, BLACK, sink * (1 - shade)), WHITE, lift * shade);
  return {
    partId: ctx.part.id,
    face: shape.face,
    d: loopsPath(shape.loops),
    fill,
    fillOpacity: look.opacity,
    fillRule: shape.rule,
    stroke: mixColor(fill, BLACK, OUTLINE_DARKEN),
    strokeWidth: 1,
    vectorEffect: 'non-scaling-stroke',
    shade,
  };
}

function boundsOf(points: readonly Vec2[], spec: ModelSpec, view: View): PlanBounds {
  const { width, depth, height } = spec.footprint;
  const corners = [-1, 1].flatMap((x) =>
    [0, 1].flatMap((y) =>
      [-1, 1].map((z) => screen(view, [(x * width) / 2, y * height, (z * depth) / 2])),
    ),
  );
  const all = points.length > 0 ? points : corners;
  const [xs, ys] = [all.map((p) => p[0]), all.map((p) => p[1])];
  const [x, y] = [Math.min(...xs), Math.min(...ys)];
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function isoFlat(spec: ModelSpec, options: IsoFlatOptions): IsoFlat {
  const camera = options.camera ?? HOUSE_CAMERA;
  const view = viewOf(camera);
  const params = modelParamValues(spec, options.params);
  const at: Resolved = { spec, finish: finishName(spec, options.finish), colors: options.colors };
  const worlds = worldMatrices(spec, params);
  const { theme } = options;
  const contexts = stillParts(spec, options.lod ?? ISO_LOD, params).map((part): Context => ({
    part,
    world: worlds.get(part.id) ?? IDENTITY,
    params,
    view,
    theme,
  }));
  const order = paintOrder(contexts.map(worldBox), view.near);
  const unresolved = new Set<string>();
  const drawn = order.flatMap((index) => {
    const ctx = contexts[index];
    if (ctx === undefined) return [];
    const found = slotLook(ctx.part.material, at);
    if (typeof found === 'string') unresolved.add(found);
    const look = typeof found === 'string' ? { color: NEUTRAL[theme], opacity: 1 } : found;
    const shapes = partShapes(ctx).filter((shape) => shape.loops.length > 0);
    return shapes.map((shape) => ({ shape, layer: layerOf(ctx, shape, look) }));
  });
  const points = drawn.flatMap(({ shape }) => shape.loops.flat());
  return {
    layers: drawn.map(({ layer }) => layer),
    bounds: boundsOf(points, spec, view),
    unresolved: [...unresolved],
    camera,
  };
}
