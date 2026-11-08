import type { ModelSpecGeometry } from '@smarteverything/domain/model-spec';
import {
  BoxGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Path,
  RingGeometry,
  Shape,
  ShapeGeometry,
  ShapePath,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
} from 'three';
import { glowGeometry } from './glow-geometry';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type ModelLod = 0 | 1 | 2;

export const MODEL_LOD_LEVELS: readonly ModelLod[] = [0, 1, 2];

export type ModelParamValues = Readonly<Record<string, number>>;

export type ModelBindable =
  | number
  | {
      readonly param: string;
      readonly scale?: number | undefined;
      readonly offset?: number | undefined;
    };

type Of<T extends ModelSpecGeometry['type']> = Extract<ModelSpecGeometry, { type: T }>;

type PathCommand = Of<'extrude'>['path'][number];

type ArcCommand = Extract<PathCommand, { op: 'arc' }>;

interface EllipseArc {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly phi: number;
  readonly start: number;
  readonly end: number;
}

const LOD_SHARE: Readonly<Record<ModelLod, number>> = { 0: 0.25, 1: 0.5, 2: 1 };

const DEG = Math.PI / 180;

export function resolveValue(value: ModelBindable, params: ModelParamValues): number {
  if (typeof value === 'number') return value;
  const base = params[value.param];
  if (base === undefined) throw new Error(`model param ${value.param} has no value`);
  return base * (value.scale ?? 1) + (value.offset ?? 0);
}

export function lodSegments(base: number, lod: ModelLod, min: number): number {
  return Math.max(min, Math.round(base * LOD_SHARE[lod]));
}

export function triangleCount(geometry: BufferGeometry): number {
  const index = geometry.getIndex();
  if (index) return index.count / 3;
  const position = geometry.getAttribute('position');
  return position.count / 3;
}

function roundedBox(
  spec: Of<'roundedBox'>,
  lod: ModelLod,
  params: ModelParamValues,
): BufferGeometry {
  return new RoundedBoxGeometry(
    resolveValue(spec.width, params),
    resolveValue(spec.height, params),
    resolveValue(spec.depth, params),
    lodSegments(spec.segments ?? 4, lod, 1),
    resolveValue(spec.radius, params),
  );
}

interface Frustum {
  readonly top: number;
  readonly bottom: number;
  readonly height: number;
}

function quarterArc(centre: Vector2, radius: number, from: number, steps: number): Vector2[] {
  return Array.from({ length: steps + 1 }, (_, step) => {
    const angle = from + (Math.PI / 2) * (step / steps);
    return new Vector2(centre.x + Math.cos(angle) * radius, centre.y + Math.sin(angle) * radius);
  });
}

export function bevelledProfile(frustum: Frustum, bevel: number, steps: number): Vector2[] {
  const half = frustum.height / 2;
  const low = Math.min(bevel, frustum.bottom, half);
  const high = Math.min(bevel, frustum.top, half);
  return [
    new Vector2(0, -half),
    ...quarterArc(new Vector2(frustum.bottom - low, -half + low), low, -Math.PI / 2, steps),
    ...quarterArc(new Vector2(frustum.top - high, half - high), high, 0, steps),
    new Vector2(0, half),
  ];
}

function cylinder(spec: Of<'cylinder'>, lod: ModelLod, params: ModelParamValues): BufferGeometry {
  const frustum = {
    top: resolveValue(spec.topRadius, params),
    bottom: resolveValue(spec.bottomRadius, params),
    height: resolveValue(spec.height, params),
  };
  const radial = lodSegments(spec.segments ?? 48, lod, 8);
  const bevel = spec.bevel === undefined ? 0 : resolveValue(spec.bevel, params);
  if (bevel <= 0) {
    return new CylinderGeometry(frustum.top, frustum.bottom, frustum.height, radial);
  }
  return new LatheGeometry(bevelledProfile(frustum, bevel, lodSegments(4, lod, 1)), radial);
}

function capsule(spec: Of<'capsule'>, lod: ModelLod, params: ModelParamValues): BufferGeometry {
  const radial = lodSegments(spec.segments ?? 32, lod, 8);
  return new CapsuleGeometry(
    resolveValue(spec.radius, params),
    resolveValue(spec.length, params),
    Math.max(2, Math.round(radial / 4)),
    radial,
  );
}

function sphere(spec: Of<'sphere'>, lod: ModelLod, params: ModelParamValues): BufferGeometry {
  const width = lodSegments(spec.segments ?? 48, lod, 8);
  return new SphereGeometry(
    resolveValue(spec.radius, params),
    width,
    Math.max(4, Math.round(width / 2)),
    (spec.phiStart ?? 0) * DEG,
    (spec.phiLength ?? 360) * DEG,
    (spec.thetaStart ?? 0) * DEG,
    (spec.thetaLength ?? 180) * DEG,
  );
}

function torus(spec: Of<'torus'>, lod: ModelLod, params: ModelParamValues): BufferGeometry {
  const tubular = lodSegments(spec.segments ?? 48, lod, 8);
  return new TorusGeometry(
    resolveValue(spec.radius, params),
    resolveValue(spec.tube, params),
    Math.max(4, Math.round(tubular / 2)),
    tubular,
  );
}

function lathe(spec: Of<'lathe'>, lod: ModelLod): BufferGeometry {
  const profile = spec.profile.map(([x, y]) => new Vector2(x, y));
  return new LatheGeometry(profile, lodSegments(spec.segments ?? 48, lod, 8));
}

function arcCentre(from: Vector2, command: ArcCommand): EllipseArc {
  const phi = (command.rotation ?? 0) * DEG;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from.x - command.x) / 2;
  const dy = (from.y - command.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const grow = Math.max(1, Math.sqrt((x1 * x1) / command.rx ** 2 + (y1 * y1) / command.ry ** 2));
  const rx = command.rx * grow;
  const ry = command.ry * grow;
  const across = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const reach = Math.max(0, (rx * rx * ry * ry - across) / across);
  const sign = command.large === command.sweep ? -1 : 1;
  const cx1 = (sign * Math.sqrt(reach) * rx * y1) / ry;
  const cy1 = (-sign * Math.sqrt(reach) * ry * x1) / rx;
  return {
    cx: cos * cx1 - sin * cy1 + (from.x + command.x) / 2,
    cy: sin * cx1 + cos * cy1 + (from.y + command.y) / 2,
    rx,
    ry,
    phi,
    start: Math.atan2((y1 - cy1) / ry, (x1 - cx1) / rx),
    end: Math.atan2((-y1 - cy1) / ry, (-x1 - cx1) / rx),
  };
}

function appendArc(path: Path, command: ArcCommand): void {
  const from = path.currentPoint;
  if (from.x === command.x && from.y === command.y) return;
  const arc = arcCentre(from.clone(), command);
  path.absellipse(arc.cx, arc.cy, arc.rx, arc.ry, arc.start, arc.end, !command.sweep, arc.phi);
}

function appendCommand(shape: ShapePath, command: PathCommand): void {
  if (command.op === 'move') {
    shape.moveTo(command.x, command.y);
    return;
  }
  if (command.op === 'line') shape.lineTo(command.x, command.y);
  else if (command.op === 'quadratic')
    shape.quadraticCurveTo(command.cx, command.cy, command.x, command.y);
  else if (command.op === 'cubic')
    shape.bezierCurveTo(command.c1x, command.c1y, command.c2x, command.c2y, command.x, command.y);
  else if (shape.currentPath) appendArc(shape.currentPath, command);
}

export function pathShapes(path: readonly PathCommand[]): Shape[] {
  const shape = new ShapePath();
  for (const command of path) appendCommand(shape, command);
  return shape.toShapes();
}

function extrude(spec: Of<'extrude'>, lod: ModelLod, params: ModelParamValues): BufferGeometry {
  const depth = resolveValue(spec.depth, params);
  const bevel = spec.bevel === undefined ? 0 : resolveValue(spec.bevel, params);
  const geometry = new ExtrudeGeometry(pathShapes(spec.path), {
    depth,
    curveSegments: lodSegments(16, lod, 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: lodSegments(4, lod, 1),
  });
  return geometry.translate(0, 0, -depth / 2);
}

function tube(spec: Of<'tube'>, lod: ModelLod, params: ModelParamValues): BufferGeometry {
  const curve = new CatmullRomCurve3(spec.points.map(([x, y, z]) => new Vector3(x, y, z)));
  const spans = spec.points.length - 1;
  return new TubeGeometry(
    curve,
    lodSegments(spans * 16, lod, spans * 2),
    resolveValue(spec.radius, params),
    lodSegments(spec.segments ?? 16, lod, 4),
  );
}

function roundedRect(target: Path, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2);
  const x = width / 2;
  const y = height / 2;
  if (r <= 0) {
    target.moveTo(-x, -y);
    target.lineTo(x, -y);
    target.lineTo(x, y);
    target.lineTo(-x, y);
    return;
  }
  target.moveTo(-x + r, -y);
  target.lineTo(x - r, -y);
  target.absarc(x - r, -y + r, r, -Math.PI / 2, 0, false);
  target.lineTo(x, y - r);
  target.absarc(x - r, y - r, r, 0, Math.PI / 2, false);
  target.lineTo(-x + r, y);
  target.absarc(-x + r, y - r, r, Math.PI / 2, Math.PI, false);
  target.lineTo(-x, -y + r);
  target.absarc(-x + r, -y + r, r, Math.PI, Math.PI * 1.5, false);
}

function roundedPlane(
  spec: Of<'roundedPlane'>,
  lod: ModelLod,
  params: ModelParamValues,
): BufferGeometry {
  const shape = new Shape();
  const width = resolveValue(spec.width, params);
  const height = resolveValue(spec.height, params);
  roundedRect(shape, width, height, resolveValue(spec.radius, params));
  return new ShapeGeometry(shape, lodSegments(spec.segments ?? 4, lod, 1));
}

function ring(spec: Of<'ring'>, lod: ModelLod, params: ModelParamValues): BufferGeometry {
  return new RingGeometry(
    resolveValue(spec.innerRadius, params),
    resolveValue(spec.outerRadius, params),
    lodSegments(spec.segments ?? 48, lod, 8),
  );
}

export function grilleHoleRadius(
  cellWidth: number,
  cellHeight: number,
  holeRadius: number,
): number {
  return Math.min(holeRadius, 0.45 * Math.min(cellWidth, cellHeight));
}

function grille(spec: Of<'grille'>, lod: ModelLod, params: ModelParamValues): BufferGeometry {
  const width = resolveValue(spec.width, params);
  const height = resolveValue(spec.height, params);
  const shape = new Shape();
  roundedRect(shape, width, height, 0);
  if (lod === 0) return new ShapeGeometry(shape, 1);
  const cellWidth = width / spec.columns;
  const cellHeight = height / spec.rows;
  const radius = grilleHoleRadius(cellWidth, cellHeight, resolveValue(spec.holeRadius, params));
  for (let row = 0; row < spec.rows; row += 1) {
    for (let column = 0; column < spec.columns; column += 1) {
      const hole = new Path();
      const x = -width / 2 + (column + 0.5) * cellWidth;
      const y = -height / 2 + (row + 0.5) * cellHeight;
      hole.absarc(x, y, radius, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
  }
  return new ShapeGeometry(shape, lodSegments(12, lod, 6) / 2);
}

function slat(width: number, height: number, depth: number, lod: ModelLod): BufferGeometry {
  if (lod === 0) return new BoxGeometry(width, height, depth).toNonIndexed();
  const radius = 0.25 * Math.min(width, height, depth);
  return new RoundedBoxGeometry(width, height, depth, lod, radius);
}

function slats(spec: Of<'slats'>, lod: ModelLod, params: ModelParamValues): BufferGeometry {
  const width = resolveValue(spec.width, params);
  const height = resolveValue(spec.height, params);
  const depth = resolveValue(spec.depth, params);
  const spacing = resolveValue(spec.spacing, params);
  const span = (spec.count - 1) * spacing;
  const pieces = Array.from({ length: spec.count }, (_, index) =>
    slat(width, height, depth, lod).translate(0, span / 2 - index * spacing, 0),
  );
  const merged = mergeGeometries(pieces, false);
  for (const piece of pieces) piece.dispose();
  return merged;
}

type PanelGeometry = Of<'extrude' | 'tube' | 'roundedPlane' | 'glow' | 'ring' | 'grille' | 'slats'>;

function buildPanel(spec: PanelGeometry, lod: ModelLod, params: ModelParamValues): BufferGeometry {
  switch (spec.type) {
    case 'extrude':
      return extrude(spec, lod, params);
    case 'tube':
      return tube(spec, lod, params);
    case 'roundedPlane':
      return roundedPlane(spec, lod, params);
    case 'glow':
      return glowGeometry({
        width: resolveValue(spec.width, params),
        height: resolveValue(spec.height, params),
        around: lodSegments(spec.segments ?? 48, lod, 8),
      });
    case 'ring':
      return ring(spec, lod, params);
    case 'grille':
      return grille(spec, lod, params);
    case 'slats':
      return slats(spec, lod, params);
  }
}

type SolidGeometry = Exclude<ModelSpecGeometry, PanelGeometry>;

function isPanel(spec: ModelSpecGeometry): spec is PanelGeometry {
  return (
    spec.type === 'extrude' ||
    spec.type === 'tube' ||
    spec.type === 'roundedPlane' ||
    spec.type === 'glow' ||
    spec.type === 'ring' ||
    spec.type === 'grille' ||
    spec.type === 'slats'
  );
}

function buildSolid(spec: SolidGeometry, lod: ModelLod, params: ModelParamValues): BufferGeometry {
  switch (spec.type) {
    case 'roundedBox':
      return roundedBox(spec, lod, params);
    case 'cylinder':
      return cylinder(spec, lod, params);
    case 'capsule':
      return capsule(spec, lod, params);
    case 'sphere':
      return sphere(spec, lod, params);
    case 'torus':
      return torus(spec, lod, params);
    case 'lathe':
      return lathe(spec, lod);
  }
}

export function buildGeometry(
  spec: ModelSpecGeometry,
  lod: ModelLod,
  params: ModelParamValues = {},
): BufferGeometry {
  return isPanel(spec) ? buildPanel(spec, lod, params) : buildSolid(spec, lod, params);
}
