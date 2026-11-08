import type {
  ModelSpec,
  ModelSpecAnchor,
  ModelSpecMaterial,
  ModelSpecPart,
} from '@smarteverything/domain';
import type { FinishSet } from '../../../helpers/finishes';
import {
  block,
  by,
  fabric,
  piece,
  woodFinishes,
  woodOf,
  type Footprint,
  type Len,
  type Lod,
  type Place,
  type Vec,
} from '../../living/fc06/kit';

export {
  block,
  by,
  fabric,
  piece,
  woodFinishes,
  woodOf,
  type Footprint,
  type Len,
  type Lod,
  type Place,
  type Vec,
};

type Finishes = NonNullable<ModelSpec['finishes']>;

export function woodAndBlack(slot: string): FinishSet {
  return {
    finishes: { ...woodFinishes([slot]), black: { [slot]: { finish: 'satin-black' } } },
    defaultFinish: 'oak',
  };
}

export function finishesOf(finishes: Finishes, defaultFinish: string): FinishSet {
  return { finishes, defaultFinish };
}

export type DecorMount = 'floor' | 'desk' | 'wall';

export type DecorCategory = 'decor' | 'rugs';

export const MIRROR_GLASS: ModelSpecMaterial = {
  color: '#C3CDD3',
  metalness: 1,
  roughness: 0.08,
};

export const BRASS: ModelSpecMaterial = { color: '#B89A5A', metalness: 1, roughness: 0.3 };

export const PAPER: ModelSpecMaterial = { finish: 'warm-white', roughness: 0.85 };

export interface Cylinder {
  readonly height: Len;
  readonly top: Len;
  readonly bottom?: Len;
  readonly bevel?: number;
  readonly segments?: number;
}

export function cyl(
  id: string,
  material: string,
  shape: Cylinder,
  place: Place = {},
): ModelSpecPart {
  return piece(
    id,
    material,
    {
      type: 'cylinder',
      height: shape.height,
      topRadius: shape.top,
      bottomRadius: shape.bottom ?? shape.top,
      bevel: shape.bevel ?? 0.004,
      segments: shape.segments ?? 48,
    },
    place,
  );
}

export function blob(
  id: string,
  material: string,
  radii: Vec,
  place: Place & { readonly segments?: number } = {},
): ModelSpecPart {
  return piece(
    id,
    material,
    { type: 'sphere', radius: 1, segments: place.segments ?? 32 },
    { ...place, scale: radii },
  );
}

export function ball(
  id: string,
  material: string,
  radius: Len,
  place: Place & { readonly segments?: number } = {},
): ModelSpecPart {
  return piece(id, material, { type: 'sphere', radius, segments: place.segments ?? 32 }, place);
}

export function turned(
  id: string,
  material: string,
  profile: readonly (readonly [number, number])[],
  place: Place & { readonly segments?: number } = {},
): ModelSpecPart {
  return piece(
    id,
    material,
    {
      type: 'lathe',
      profile: profile.map(([radius, height]) => [radius, height]),
      segments: place.segments ?? 64,
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
    { type: 'torus', radius: shape.radius, tube: shape.tube, segments: shape.segments ?? 64 },
    place,
  );
}

export function wire(
  id: string,
  material: string,
  shape: {
    readonly points: readonly (readonly [number, number, number])[];
    readonly radius: number;
  },
  place: Place = {},
): ModelSpecPart {
  return piece(
    id,
    material,
    {
      type: 'tube',
      points: shape.points.map(([x, y, z]) => [x, y, z]),
      radius: shape.radius,
      segments: 12,
    },
    place,
  );
}

type Point = readonly [number, number, number];

const DEG = 180 / Math.PI;

export function rodBetween(
  id: string,
  material: string,
  ends: { readonly from: Point; readonly to: Point; readonly radius: number },
  place: Place & { readonly segments?: number } = {},
): ModelSpecPart {
  const dx = ends.to[0] - ends.from[0];
  const dy = ends.to[1] - ends.from[1];
  const dz = ends.to[2] - ends.from[2];
  const length = Math.hypot(dx, dy, dz);
  return cyl(
    id,
    material,
    {
      height: length,
      top: ends.radius,
      bevel: Math.min(0.004, ends.radius / 2),
      segments: place.segments ?? 16,
    },
    {
      ...place,
      at: [
        (ends.from[0] + ends.to[0]) / 2,
        (ends.from[1] + ends.to[1]) / 2,
        (ends.from[2] + ends.to[2]) / 2,
      ],
      turn: [Math.atan2(dz, dy) * DEG, 0, -Math.asin(dx / length) * DEG],
    },
  );
}

export function sized(param: string, parts: readonly ModelSpecPart[]): ModelSpecPart[] {
  return parts.map((part) => {
    if (part.parent !== undefined) return part;
    const position = part.transform?.position ?? [0, 0, 0];
    const scale = part.transform?.scale ?? [1, 1, 1];
    const fixed = (value: Len): number => {
      if (typeof value !== 'number') throw new Error(`part ${part.id} is already bound`);
      return value;
    };
    return {
      ...part,
      transform: {
        ...part.transform,
        position: [
          by(param, fixed(position[0])),
          by(param, fixed(position[1])),
          by(param, fixed(position[2])),
        ],
        scale: [by(param, fixed(scale[0])), by(param, fixed(scale[1])), by(param, fixed(scale[2]))],
      },
    };
  });
}

export const SIZE_PARAM = { min: 0.6, max: 1.6, default: 1, unit: 'ratio' } as const;

function mountAnchors(size: Footprint, mount: DecorMount): ModelSpecAnchor[] {
  const base: ModelSpecAnchor =
    mount === 'wall'
      ? { kind: 'mount', id: 'wall', position: [0, 0, -size.depth / 2], mount: 'wall' }
      : {
          kind: 'mount',
          id: mount === 'desk' ? 'surface' : 'floor',
          position: [0, 0, 0],
          mount,
        };
  return [
    base,
    { kind: 'label', id: 'pin', position: [0, size.height + 0.1, 0] },
    {
      kind: 'hit',
      id: 'hit',
      position: [0, size.height / 2, 0],
      size: [size.width, size.height, size.depth],
    },
  ];
}

function framingOf(pitch: number, yaw: number): ModelSpec['framing'] {
  const view = { yaw, pitch, fov: 28, padding: 0.08 };
  return {
    tile: { ...view, padding: 0.06 },
    card: view,
    hero: { ...view, padding: 0.1 },
  };
}

export interface DecorInput {
  readonly id: string;
  readonly title: string;
  readonly category?: DecorCategory;
  readonly footprint: Footprint;
  readonly meta: NonNullable<ModelSpec['meta']>;
  readonly params?: ModelSpec['params'];
  readonly size?: ModelSpec['size'];
  readonly materials: ModelSpec['materials'];
  readonly finish: FinishSet;
  readonly mount: DecorMount;
  readonly pitch?: number;
  readonly yaw?: number;
  readonly parts: ModelSpecPart[];
}

const PITCH: Readonly<Record<DecorMount, number>> = { floor: 18, desk: 22, wall: 10 };

const YAW: Readonly<Record<DecorMount, number>> = { floor: 30, desk: 30, wall: 20 };

export function decorItem(input: DecorInput): ModelSpec {
  return {
    schema: 1,
    id: input.id,
    version: '1.0.0',
    title: input.title,
    category: input.category ?? 'decor',
    footprint: input.footprint,
    framing: framingOf(input.pitch ?? PITCH[input.mount], input.yaw ?? YAW[input.mount]),
    meta: { ...input.meta, variants: Object.keys(input.finish.finishes) },
    ...(input.params === undefined ? {} : { params: input.params }),
    ...(input.size === undefined ? {} : { size: input.size }),
    materials: input.materials,
    finishes: input.finish.finishes,
    defaultFinish: input.finish.defaultFinish,
    parts: input.parts,
    anchors: mountAnchors(input.footprint, input.mount),
    states: { rest: {} },
  };
}
