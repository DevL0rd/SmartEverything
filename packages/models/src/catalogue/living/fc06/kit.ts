import type {
  ModelSpec,
  ModelSpecAnchor,
  ModelSpecGeometry,
  ModelSpecMaterial,
  ModelSpecPart,
} from '@smarteverything/domain';

type Binding = NonNullable<ModelSpecPart['visible']>;
type Override = NonNullable<ModelSpec['finishes']>[string][string];
type Finishes = NonNullable<ModelSpec['finishes']>;

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

export interface BlockOptions extends Place {
  readonly round?: number;
  readonly segments?: number;
}

export function by(param: string, scale: number, offset = 0): Binding {
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
      bevel: 0.004,
      segments: shape.segments ?? 24,
    },
    place,
  );
}

export function legs(
  material: string,
  corners: readonly (readonly [Len, Len])[],
  shape: Rod,
): ModelSpecPart[] {
  return corners.map(([x, z], index) =>
    rod(`leg${String(index + 1)}`, material, shape, {
      at: [x, typeof shape.height === 'number' ? shape.height / 2 : 0, z],
      contact: true,
    }),
  );
}

export function ferrules(
  corners: readonly (readonly [Len, Len])[],
  radius: number,
): ModelSpecPart[] {
  return corners.map(([x, z], index) =>
    rod(
      `ferrule${String(index + 1)}`,
      'accent',
      { height: 0.014, top: radius, segments: 24 },
      { at: [x, 0.007, z], minLod: 2 },
    ),
  );
}

export function corners(x: Len, z: Len, negX: Len, negZ: Len): readonly (readonly [Len, Len])[] {
  return [
    [negX, negZ],
    [x, negZ],
    [negX, z],
    [x, z],
  ];
}

const FABRIC = {
  oat: '#CBBDA5',
  slate: '#69717C',
  forest: '#3E5A49',
  rust: '#A2553B',
  ink: '#2B3242',
} as const;

const LEATHER = { cognac: '#8C5531', black: '#2A2A2E' } as const;

const LACQUER = { color: '#F1EFEA', roughness: 0.25, clearcoat: 0.8 } as const;

export type Upholstery = keyof typeof FABRIC | keyof typeof LEATHER;

export const UPHOLSTERY: readonly Upholstery[] = [
  'oat',
  'slate',
  'forest',
  'rust',
  'ink',
  'cognac',
  'black',
];

export const WOODS = ['oak', 'walnut', 'white-lacquer'] as const;

export type Wood = (typeof WOODS)[number];

export function fabric(color: string): ModelSpecMaterial {
  return { color, roughness: 0.9, sheen: 0.8, pattern: 'knit' };
}

export function leather(color: string): ModelSpecMaterial {
  return { color, roughness: 0.55, clearcoat: 0.15, sheen: 0.2, pattern: 'leather' };
}

export function upholsteryOf(name: Upholstery): ModelSpecMaterial {
  return name === 'cognac' || name === 'black' ? leather(LEATHER[name]) : fabric(FABRIC[name]);
}

export function upholsteryFinishes(slots: readonly string[]): Finishes {
  return Object.fromEntries(
    UPHOLSTERY.map((name) => [
      name,
      Object.fromEntries(slots.map((slot): [string, Override] => [slot, upholsteryOf(name)])),
    ]),
  );
}

export function woodOf(name: Wood, surface: Override = {}): ModelSpecMaterial {
  return name === 'white-lacquer' ? { ...LACQUER, ...surface } : { finish: name, ...surface };
}

export function woodFinishes(
  slots: readonly string[],
  surface: Readonly<Record<string, Override>> = {},
): Finishes {
  return Object.fromEntries(
    WOODS.map((name) => [
      name,
      Object.fromEntries(
        slots.map((slot): [string, Override] => [slot, woodOf(name, surface[slot] ?? {})]),
      ),
    ]),
  );
}

const HOUSE = { yaw: 30, pitch: 18, fov: 28, padding: 0.08 } as const;

export function framing(pitch: number = HOUSE.pitch): ModelSpec['framing'] {
  const view = { ...HOUSE, pitch };
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

export function anchorsFor(size: Footprint, wall = false): ModelSpecAnchor[] {
  const back: ModelSpecAnchor = {
    kind: 'mount',
    id: 'wall',
    position: [0, 0, -size.depth / 2],
    mount: 'wall',
  };
  return [
    { kind: 'mount', id: 'floor', position: [0, 0, 0], mount: 'floor' },
    ...(wall ? [back] : []),
    { kind: 'label', id: 'pin', position: [0, size.height + 0.12, 0] },
    {
      kind: 'hit',
      id: 'hit',
      position: [0, size.height / 2, 0],
      size: [size.width, size.height, size.depth],
    },
  ];
}

export interface FurnitureInput {
  readonly id: string;
  readonly title: string;
  readonly footprint: Footprint;
  readonly meta: NonNullable<ModelSpec['meta']>;
  readonly params?: ModelSpec['params'];
  readonly size?: ModelSpec['size'];
  readonly materials: ModelSpec['materials'];
  readonly finishes: Finishes;
  readonly defaultFinish: string;
  readonly parts: ModelSpecPart[];
  readonly pitch?: number;
  readonly wall?: boolean;
}

export function furniture(input: FurnitureInput): ModelSpec {
  return {
    schema: 1,
    id: input.id,
    version: '1.0.0',
    title: input.title,
    category: 'living',
    footprint: input.footprint,
    framing: framing(input.pitch),
    meta: { ...input.meta, variants: Object.keys(input.finishes) },
    ...(input.params === undefined ? {} : { params: input.params }),
    ...(input.size === undefined ? {} : { size: input.size }),
    materials: input.materials,
    finishes: input.finishes,
    defaultFinish: input.defaultFinish,
    parts: input.parts,
    anchors: anchorsFor(input.footprint, input.wall),
  };
}
