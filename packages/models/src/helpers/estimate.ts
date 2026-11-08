import { shownParts, type ModelSpec, type ModelSpecGeometry } from '@smarteverything/domain';

export type ModelLod = 0 | 1 | 2;

export const MODEL_LODS: readonly ModelLod[] = [0, 1, 2];

export type ModelParamValues = Readonly<Record<string, number>>;

export type ModelBindable =
  | number
  | {
      readonly param: string;
      readonly scale?: number | undefined;
      readonly offset?: number | undefined;
    };

type Of<T extends ModelSpecGeometry['type']> = Extract<ModelSpecGeometry, { type: T }>;

type PanelGeometry = Of<'extrude' | 'tube' | 'roundedPlane' | 'glow' | 'ring' | 'grille' | 'slats'>;

type SolidGeometry = Exclude<ModelSpecGeometry, PanelGeometry>;

type PathCommand = Of<'extrude'>['path'][number];

const LOD_SHARE: Readonly<Record<ModelLod, number>> = { 0: 0.25, 1: 0.5, 2: 1 };

const DEG = Math.PI / 180;

export function resolveBindable(value: ModelBindable, params: ModelParamValues): number {
  if (typeof value === 'number') return value;
  const base = params[value.param];
  if (base === undefined) throw new Error(`model param ${value.param} has no value`);
  return base * (value.scale ?? 1) + (value.offset ?? 0);
}

export function lodSegmentCount(base: number, lod: ModelLod, min: number): number {
  return Math.max(min, Math.round(base * LOD_SHARE[lod]));
}

function positive(value: ModelBindable | undefined, params: ModelParamValues): boolean {
  return value !== undefined && resolveBindable(value, params) > 0;
}

function roundedBoxTriangles(spec: Of<'roundedBox'>, lod: ModelLod): number {
  const steps = lodSegmentCount(spec.segments ?? 4, lod, 1) * 2 + 1;
  return 12 * steps * steps;
}

function lathedTriangles(points: number, radial: number): number {
  return 2 * (points - 1) * radial;
}

function cylinderTriangles(spec: Of<'cylinder'>, lod: ModelLod, params: ModelParamValues): number {
  const radial = lodSegmentCount(spec.segments ?? 48, lod, 8);
  if (positive(spec.bevel, params)) {
    const steps = lodSegmentCount(4, lod, 1);
    return lathedTriangles(2 * steps + 4, radial);
  }
  const top = positive(spec.topRadius, params) ? 2 * radial : 0;
  const bottom = positive(spec.bottomRadius, params) ? 2 * radial : 0;
  return top + bottom;
}

function capsuleTriangles(spec: Of<'capsule'>, lod: ModelLod): number {
  const radial = lodSegmentCount(spec.segments ?? 32, lod, 8);
  const caps = Math.max(2, Math.round(radial / 4));
  return lathedTriangles(2 * caps + 2, radial);
}

function sphereTriangles(spec: Of<'sphere'>, lod: ModelLod): number {
  const width = lodSegmentCount(spec.segments ?? 48, lod, 8);
  const height = Math.max(4, Math.round(width / 2));
  const start = (spec.thetaStart ?? 0) * DEG;
  const end = start + (spec.thetaLength ?? 180) * DEG;
  const top = start > 0 ? 0 : width;
  const bottom = end < Math.PI ? 0 : width;
  return 2 * width * height - top - bottom;
}

function torusTriangles(spec: Of<'torus'>, lod: ModelLod): number {
  const tubular = lodSegmentCount(spec.segments ?? 48, lod, 8);
  return 2 * Math.max(4, Math.round(tubular / 2)) * tubular;
}

function solidTriangles(spec: SolidGeometry, lod: ModelLod, params: ModelParamValues): number {
  switch (spec.type) {
    case 'roundedBox':
      return roundedBoxTriangles(spec, lod);
    case 'cylinder':
      return cylinderTriangles(spec, lod, params);
    case 'capsule':
      return capsuleTriangles(spec, lod);
    case 'sphere':
      return sphereTriangles(spec, lod);
    case 'torus':
      return torusTriangles(spec, lod);
    case 'lathe':
      return lathedTriangles(spec.profile.length, lodSegmentCount(spec.segments ?? 48, lod, 8));
  }
}

function commandPoints(command: PathCommand, curve: number): number {
  switch (command.op) {
    case 'move':
    case 'line':
      return 1;
    case 'quadratic':
    case 'cubic':
      return curve;
    case 'arc':
      return 2 * curve;
  }
}

function contours(path: readonly PathCommand[]): readonly (readonly PathCommand[])[] {
  const out: PathCommand[][] = [];
  for (const command of path) {
    const last = out[out.length - 1];
    if (command.op === 'move' || last === undefined) out.push([command]);
    else last.push(command);
  }
  return out;
}

function contourPoints(contour: readonly PathCommand[], curve: number): number {
  const first = contour[0];
  const last = contour[contour.length - 1];
  const total = contour.reduce((sum, command) => sum + commandPoints(command, curve), 0);
  const closed =
    first !== undefined &&
    last !== undefined &&
    contour.length > 2 &&
    last.op !== 'move' &&
    first.op === 'move' &&
    first.x === last.x &&
    first.y === last.y;
  return closed ? total - 1 : total;
}

function extrudeTriangles(spec: Of<'extrude'>, lod: ModelLod, params: ModelParamValues): number {
  const curve = lodSegmentCount(16, lod, 2);
  const layers = positive(spec.bevel, params) ? 2 * lodSegmentCount(4, lod, 1) + 1 : 1;
  return contours(spec.path).reduce((sum, contour) => {
    const points = contourPoints(contour, curve);
    return sum + 2 * points * layers + 2 * (points - 2);
  }, 0);
}

function tubeTriangles(spec: Of<'tube'>, lod: ModelLod): number {
  const spans = spec.points.length - 1;
  const along = lodSegmentCount(spans * 16, lod, spans * 2);
  return 2 * along * lodSegmentCount(spec.segments ?? 16, lod, 4);
}

function roundedPlaneTriangles(
  spec: Of<'roundedPlane'>,
  lod: ModelLod,
  params: ModelParamValues,
): number {
  const rounded =
    positive(spec.radius, params) && positive(spec.width, params) && positive(spec.height, params);
  return rounded ? 8 * lodSegmentCount(spec.segments ?? 4, lod, 1) + 2 : 2;
}

function glowTriangles(around: number): number {
  return around * (2 * Math.max(3, Math.round(around / 4)) - 1);
}

function grilleTriangles(spec: Of<'grille'>, lod: ModelLod): number {
  if (lod === 0) return 2;
  const holes = spec.rows * spec.columns;
  const around = 2 * (lodSegmentCount(12, lod, 6) / 2) + 1;
  return 4 + holes * around + 2 * holes - 2;
}

function slatsTriangles(spec: Of<'slats'>, lod: ModelLod): number {
  const perSlat = lod === 0 ? 12 : 12 * (2 * lod + 1) ** 2;
  return spec.count * perSlat;
}

function panelTriangles(spec: PanelGeometry, lod: ModelLod, params: ModelParamValues): number {
  switch (spec.type) {
    case 'extrude':
      return extrudeTriangles(spec, lod, params);
    case 'tube':
      return tubeTriangles(spec, lod);
    case 'roundedPlane':
      return roundedPlaneTriangles(spec, lod, params);
    case 'glow':
      return glowTriangles(lodSegmentCount(spec.segments ?? 48, lod, 8));
    case 'ring':
      return 2 * lodSegmentCount(spec.segments ?? 48, lod, 8);
    case 'grille':
      return grilleTriangles(spec, lod);
    case 'slats':
      return slatsTriangles(spec, lod);
  }
}

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

export function estimateGeometryTriangles(
  geometry: ModelSpecGeometry,
  lod: ModelLod,
  params: ModelParamValues = {},
): number {
  return isPanel(geometry)
    ? panelTriangles(geometry, lod, params)
    : solidTriangles(geometry, lod, params);
}

export function paramDefaults(spec: Pick<ModelSpec, 'params'>): ModelParamValues {
  return Object.fromEntries(
    Object.entries(spec.params ?? {}).map(([name, param]) => [name, param.default]),
  );
}

export function paramPresets(
  spec: Pick<ModelSpec, 'params'>,
): readonly (readonly [string, ModelParamValues])[] {
  const entries = Object.entries(spec.params ?? {});
  const pick = (key: 'min' | 'default' | 'max'): ModelParamValues =>
    Object.fromEntries(entries.map(([name, param]) => [name, param[key]]));
  return [
    ['min', pick('min')],
    ['default', pick('default')],
    ['max', pick('max')],
  ];
}

export function estimateSpecTriangles(
  spec: Pick<ModelSpec, 'parts' | 'params'>,
  lod: ModelLod,
  params: ModelParamValues = paramDefaults(spec),
): number {
  return shownParts(spec, lod, params).reduce(
    (sum, part) => sum + estimateGeometryTriangles(part.geometry, lod, params),
    0,
  );
}
