import type {
  ModelSpec,
  ModelSpecAnchor,
  ModelSpecChannel,
  ModelSpecGeometry,
  ModelSpecMaterial,
  ModelSpecPart,
  ModelSpecShot,
} from '@smarteverything/domain';
import type { FinishSet } from '../../../helpers/finishes';

type Binding = NonNullable<ModelSpecPart['visible']>;

export type Len = number | Binding;
export type Vec = readonly [Len, Len, Len];
export type Lod = 0 | 1 | 2;

export interface Place {
  readonly at?: Vec;
  readonly turn?: Vec;
  readonly scale?: Vec;
  readonly minLod?: Lod;
  readonly parent?: string;
  readonly contact?: boolean;
}

export function by(param: string, scale = 1, offset = 0): Binding {
  return { param, scale, offset };
}

function vec(value: Vec): [Len, Len, Len] {
  return [value[0], value[1], value[2]];
}

function transformOf(place: Place): ModelSpecPart['transform'] {
  return {
    ...(place.at === undefined ? {} : { position: vec(place.at) }),
    ...(place.turn === undefined ? {} : { rotation: vec(place.turn) }),
    ...(place.scale === undefined ? {} : { scale: vec(place.scale) }),
  };
}

export function piece(
  id: string,
  material: string,
  geometry: ModelSpecGeometry,
  place: Place = {},
): ModelSpecPart {
  const transform = transformOf(place);
  return {
    id,
    geometry,
    material,
    ...(transform === undefined || Object.keys(transform).length === 0 ? {} : { transform }),
    ...(place.minLod === undefined ? {} : { minLod: place.minLod }),
    ...(place.parent === undefined ? {} : { parent: place.parent }),
    ...(place.contact === undefined ? {} : { contact: place.contact }),
  };
}

export interface BlockOptions extends Place {
  readonly round?: number;
  readonly segments?: number;
}

export function block(
  id: string,
  material: string,
  size: Vec,
  options: BlockOptions = {},
): ModelSpecPart {
  return piece(
    id,
    material,
    {
      type: 'roundedBox',
      width: size[0],
      height: size[1],
      depth: size[2],
      radius: options.round ?? 0.02,
      segments: options.segments ?? 4,
    },
    options,
  );
}

export interface Rod {
  readonly height: Len;
  readonly top: Len;
  readonly bottom?: Len;
  readonly bevel?: number;
  readonly segments?: number;
}

export function rod(id: string, material: string, shape: Rod, place: Place = {}): ModelSpecPart {
  return piece(
    id,
    material,
    {
      type: 'cylinder',
      height: shape.height,
      topRadius: shape.top,
      bottomRadius: shape.bottom ?? shape.top,
      bevel: shape.bevel ?? 0.006,
      segments: shape.segments ?? 32,
    },
    place,
  );
}

export interface BlobOptions extends Place {
  readonly segments?: number;
}

export function blob(
  id: string,
  material: string,
  radii: Vec,
  options: BlobOptions = {},
): ModelSpecPart {
  return piece(
    id,
    material,
    { type: 'sphere', radius: 1, segments: options.segments ?? 32 },
    { ...options, scale: radii },
  );
}

export interface Turned {
  readonly profile: readonly (readonly [number, number])[];
  readonly segments?: number;
}

export function turned(
  id: string,
  material: string,
  shape: Turned,
  place: Place = {},
): ModelSpecPart {
  return piece(
    id,
    material,
    {
      type: 'lathe',
      profile: shape.profile.map(([x, y]) => [x, y]),
      segments: shape.segments ?? 48,
    },
    place,
  );
}

export function hoop(
  id: string,
  material: string,
  shape: { readonly radius: Len; readonly tube: Len; readonly segments?: number },
  place: Place = {},
): ModelSpecPart {
  return piece(
    id,
    material,
    { type: 'torus', radius: shape.radius, tube: shape.tube, segments: shape.segments ?? 48 },
    { turn: [90, 0, 0], ...place },
  );
}

export interface Arch {
  readonly points: readonly (readonly [number, number, number])[];
  readonly radius: number;
}

export function arch(id: string, material: string, shape: Arch, place: Place = {}): ModelSpecPart {
  return piece(
    id,
    material,
    {
      type: 'tube',
      points: shape.points.map(([x, y, z]) => [x, y, z]),
      radius: shape.radius,
      segments: 16,
    },
    place,
  );
}

const DEG = Math.PI / 180;

export type Point = readonly [number, number, number];

export function lean(from: Point, length: number, tilt: number, yaw: number): Point {
  const a = tilt * DEG;
  const f = yaw * DEG;
  return [
    from[0] - Math.sin(a) * Math.cos(f) * length,
    from[1] + Math.cos(a) * length,
    from[2] + Math.sin(a) * Math.sin(f) * length,
  ];
}

export function midpoint(from: Point, to: Point): Point {
  return [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
}

export interface Strut {
  readonly from: Point;
  readonly length: number;
  readonly tilt: number;
  readonly yaw: number;
  readonly top: number;
  readonly bottom?: number;
  readonly bevel?: number;
  readonly segments?: number;
}

export function strut(
  id: string,
  material: string,
  shape: Strut,
  place: Place = {},
): ModelSpecPart {
  const end = lean(shape.from, shape.length, shape.tilt, shape.yaw);
  return rod(
    id,
    material,
    {
      height: shape.length,
      top: shape.top,
      bottom: shape.bottom ?? shape.top,
      bevel: shape.bevel ?? Math.min(0.006, shape.top / 2),
      segments: shape.segments ?? 16,
    },
    { ...place, at: midpoint(shape.from, end), turn: [0, shape.yaw, shape.tilt] },
  );
}

export interface LeafShape {
  readonly base: Point;
  readonly length: number;
  readonly width: number;
  readonly thick: number;
  readonly tilt: number;
  readonly yaw: number;
  readonly segments?: number;
}

export function leafBlob(
  id: string,
  material: string,
  shape: LeafShape,
  place: Place = {},
): ModelSpecPart {
  const centre = lean(shape.base, shape.length, shape.tilt, shape.yaw);
  return blob(id, material, [shape.thick, shape.length, shape.width], {
    ...place,
    at: centre,
    turn: [0, shape.yaw, shape.tilt],
    segments: shape.segments ?? 24,
  });
}

export const GROUND_VIEW = { yaw: 30, pitch: 18, fov: 28, padding: 0.08 } as const;

export const TALL_VIEW = { yaw: 30, pitch: 12, fov: 28, padding: 0.08 } as const;

export const FLAT_VIEW = { yaw: 30, pitch: 35, fov: 28, padding: 0.08 } as const;

export interface View {
  readonly yaw: number;
  readonly pitch: number;
  readonly fov: number;
  readonly padding: number;
}

export function framingOf(view: View): ModelSpec['framing'] {
  return {
    tile: { ...view, padding: 0.06 },
    card: view,
    hero: { ...view, padding: 0.1 },
  };
}

export interface Footprint {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

export type Mount = 'floor' | 'ceiling';

export function anchorsFor(
  size: Footprint,
  parent?: string,
  mount: Mount = 'floor',
): ModelSpecAnchor[] {
  const bind = parent === undefined ? {} : { parent };
  const hung = mount === 'ceiling';
  const top = hung && parent !== undefined ? 0 : size.height;
  const centre = hung && parent !== undefined ? -size.height / 2 : size.height / 2;
  return [
    {
      kind: 'mount',
      id: 'floor',
      position: [0, hung ? top : 0, 0],
      mount,
      ...bind,
    },
    { kind: 'label', id: 'pin', position: [0, (hung ? 0 : size.height) + 0.12, 0], ...bind },
    {
      kind: 'hit',
      id: 'hit',
      position: [0, centre, 0],
      size: [size.width, size.height, size.depth],
      ...bind,
    },
  ];
}

export const SIZE_PARAM = { min: 0.5, max: 1.8, default: 1, unit: 'ratio' } as const;

export function scaleBy(param: string): Vec {
  return [by(param), by(param), by(param)];
}

type Meta = NonNullable<ModelSpec['meta']>;

export interface CatalogueInput {
  readonly id: string;
  readonly title: string;
  readonly category: 'outdoor' | 'plants';
  readonly footprint: Footprint;
  readonly meta: Omit<Meta, 'variants'>;
  readonly params?: ModelSpec['params'];
  readonly size?: ModelSpec['size'];
  readonly materials: Readonly<Record<string, ModelSpecMaterial>>;
  readonly finish: FinishSet;
  readonly parts: ModelSpecPart[];
  readonly anchors?: ModelSpecAnchor[];
  readonly anchorParent?: string;
  readonly mount?: Mount;
  readonly view?: View;
  readonly shots?: ModelSpecShot[];
  readonly channels?: ModelSpecChannel[];
  readonly states?: ModelSpec['states'];
}

export function catalogueModel(input: CatalogueInput): ModelSpec {
  return {
    schema: 1,
    id: input.id,
    version: '1.0.0',
    title: input.title,
    category: input.category,
    footprint: input.footprint,
    framing: framingOf(input.view ?? GROUND_VIEW),
    ...(input.shots === undefined ? {} : { shots: input.shots }),
    meta: { ...input.meta, variants: Object.keys(input.finish.finishes) },
    ...(input.params === undefined ? {} : { params: input.params }),
    ...(input.size === undefined ? {} : { size: input.size }),
    materials: input.materials,
    finishes: input.finish.finishes,
    defaultFinish: input.finish.defaultFinish,
    parts: input.parts,
    anchors: [
      ...anchorsFor(input.footprint, input.anchorParent, input.mount),
      ...(input.anchors ?? []),
    ],
    ...(input.channels === undefined ? {} : { channels: input.channels }),
    states: input.states ?? { rest: {} },
  };
}

export function glowChannel(
  id: string,
  target: string,
  source: 'power' | 'brightness',
): ModelSpecChannel {
  return {
    id,
    target,
    property: 'emissive',
    source,
    map:
      source === 'power'
        ? { type: 'enum', table: { true: 1, false: 0 } }
        : { type: 'linear', in: [0, 1], out: [0, 1], clamp: true },
    motion: { type: 'pose', easeMs: 300 },
    reduced: 'hold',
  };
}

export interface ShotOptions {
  readonly id: string;
  readonly signal: string;
  readonly focus: string;
  readonly zoom: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly loopS: number;
  readonly stillAt: number;
}

export function whileOn(options: ShotOptions): ModelSpecShot {
  return {
    id: options.id,
    when: { anyOf: [{ allOf: [{ signal: options.signal, op: 'eq', value: true }] }] },
    focus: options.focus,
    zoom: options.zoom,
    yaw: options.yaw,
    pitch: options.pitch,
    easeMs: 900,
    loopS: options.loopS,
    symmetry: 360,
    stillAt: options.stillAt,
  };
}
