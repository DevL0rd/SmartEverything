import type {
  ModelSpec,
  ModelSpecAnchor,
  ModelSpecChannel,
  ModelSpecMaterial,
  ModelSpecPart,
  ModelSpecShot,
} from '@smarteverything/domain';
import type { FinishSet } from '../../../helpers/finishes';
import {
  GROUND_VIEW,
  anchorsFor,
  framingOf,
  midpoint,
  piece,
  rod,
  type Footprint,
  type Len,
  type Place,
  type Point,
  type View,
} from '../../outdoor/fc25/kit';

export {
  arch,
  blob,
  block,
  by,
  hoop,
  lean,
  midpoint,
  piece,
  rod,
  scaleBy,
  strut,
  turned,
  FLAT_VIEW,
  GROUND_VIEW,
  TALL_VIEW,
  type Footprint,
  type Len,
  type Place,
  type Point,
  type Vec,
  type View,
} from '../../outdoor/fc25/kit';

type Meta = NonNullable<ModelSpec['meta']>;

type Override = NonNullable<ModelSpec['finishes']>[string][string];

export interface ItemInput {
  readonly id: string;
  readonly title: string;
  readonly category: 'kids-pets' | 'fitness-hobby';
  readonly footprint: Footprint;
  readonly meta: Omit<Meta, 'variants'>;
  readonly params?: ModelSpec['params'];
  readonly size?: ModelSpec['size'];
  readonly materials: Readonly<Record<string, ModelSpecMaterial>>;
  readonly finish: FinishSet;
  readonly parts: ModelSpecPart[];
  readonly anchors?: ModelSpecAnchor[];
  readonly view?: View;
  readonly shots?: ModelSpecShot[];
  readonly channels?: ModelSpecChannel[];
}

export function catalogueItem(input: ItemInput): ModelSpec {
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
    anchors: [...anchorsFor(input.footprint), ...(input.anchors ?? [])],
    ...(input.channels === undefined ? {} : { channels: input.channels }),
    states: { rest: {} },
  };
}

const DEG = 180 / Math.PI;

export interface Link {
  readonly from: Point;
  readonly to: Point;
  readonly top: number;
  readonly bottom?: number;
  readonly segments?: number;
  readonly bevel?: number;
}

export function link(
  id: string,
  material: string,
  shape: Link,
  place: Omit<Place, 'at' | 'turn'> = {},
): ModelSpecPart {
  const dx = shape.to[0] - shape.from[0];
  const dy = shape.to[1] - shape.from[1];
  const dz = shape.to[2] - shape.from[2];
  const flat = Math.hypot(dx, dz);
  return rod(
    id,
    material,
    {
      height: Math.hypot(flat, dy),
      top: shape.top,
      bottom: shape.bottom ?? shape.top,
      bevel: shape.bevel ?? Math.min(0.006, shape.top / 2),
      segments: shape.segments ?? 16,
    },
    {
      ...place,
      at: midpoint(shape.from, shape.to),
      turn: [0, flat === 0 ? 0 : Math.atan2(dz, -dx) * DEG, Math.atan2(flat, dy) * DEG],
    },
  );
}

export function plane(
  id: string,
  material: string,
  size: readonly [Len, Len],
  place: Place = {},
): ModelSpecPart {
  return piece(
    id,
    material,
    { type: 'roundedPlane', width: size[0], height: size[1], radius: 0, segments: 3 },
    place,
  );
}

export interface Wire {
  readonly points: readonly Point[];
  readonly radius: number;
}

export function wire(id: string, material: string, shape: Wire, place: Place = {}): ModelSpecPart {
  return piece(
    id,
    material,
    {
      type: 'tube',
      points: shape.points.map(([x, y, z]) => [x, y, z]),
      radius: shape.radius,
      segments: 6,
    },
    place,
  );
}

export function paint(color: string): Override {
  return { color, roughness: 0.45, clearcoat: 0.3 };
}

export function fabricOf(color: string): Override {
  return { color, roughness: 0.9, sheen: 0.8, pattern: 'knit' };
}

export function everyOf(slots: readonly string[], look: Override): Record<string, Override> {
  return Object.fromEntries(slots.map((slot) => [slot, look]));
}

export const PAINT_NAMES = ['white', 'sage', 'sky', 'blush'] as const;

export type PaintName = (typeof PAINT_NAMES)[number];

export const PAINTS: Readonly<Record<PaintName, string>> = {
  white: '#F1EFEA',
  sage: '#9DB8A0',
  sky: '#9FC1D9',
  blush: '#E3B7B0',
};

export function paintedFinishes(
  painted: readonly string[],
  kept: Readonly<Record<string, Override>> = {},
  natural = 'oak',
): Record<string, Record<string, Override>> {
  return {
    [natural]: {},
    ...Object.fromEntries(
      PAINT_NAMES.map((name) => [name, { ...everyOf(painted, paint(PAINTS[name])), ...kept }]),
    ),
  };
}

export const FABRICS = {
  oat: ['#CBBDA5', '#E4DAC8'],
  slate: ['#69717C', '#98A0AA'],
  forest: ['#3E5A49', '#6B8573'],
  rust: ['#A2553B', '#CE8E73'],
  ink: ['#2B3242', '#566078'],
} as const;

export function fabricFinishes(
  slots: readonly [string, string],
  extra: Readonly<Record<string, Override>> = {},
): Record<string, Record<string, Override>> {
  return Object.fromEntries(
    Object.entries(FABRICS).map(([name, [dark, light]]) => [
      name,
      { [slots[0]]: fabricOf(dark), [slots[1]]: fabricOf(light), ...extra },
    ]),
  );
}
