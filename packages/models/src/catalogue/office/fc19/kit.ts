import type { ModelSpec, ModelSpecAnchor, ModelSpecPart } from '@smarteverything/domain';
import {
  furniture,
  piece,
  rod,
  woodOf,
  type FurnitureInput,
  type Wood,
} from '../../living/fc06/kit';

type Override = NonNullable<ModelSpec['finishes']>[string][string];
type Finishes = NonNullable<ModelSpec['finishes']>;

export type Mount = 'floor' | 'desk';

export const METAL_NAMES = ['graphite', 'white', 'steel', 'black'] as const;

export type Metal = (typeof METAL_NAMES)[number];

const METALS: Readonly<Record<Metal, Override>> = {
  graphite: { finish: 'graphite' },
  white: { finish: 'matte-white' },
  steel: { finish: 'brushed-aluminium' },
  black: { finish: 'satin-black' },
};

export function metalFinishes(slots: readonly string[]): Finishes {
  return Object.fromEntries(
    METAL_NAMES.map((name) => [
      name,
      Object.fromEntries(slots.map((slot): [string, Override] => [slot, METALS[name]])),
    ]),
  );
}

const FRAME_OF: Readonly<Record<Wood, Metal>> = {
  oak: 'graphite',
  walnut: 'graphite',
  'white-lacquer': 'white',
};

export const DESK_WOODS: readonly Wood[] = ['oak', 'walnut', 'white-lacquer'];

export function deskFinishes(wood: readonly string[], metal: readonly string[]): Finishes {
  return Object.fromEntries(
    DESK_WOODS.map((name) => [
      name,
      Object.fromEntries([
        ...wood.map((slot): [string, Override] => [slot, woodOf(name)]),
        ...metal.map((slot): [string, Override] => [slot, METALS[FRAME_OF[name]]]),
      ]),
    ]),
  );
}

function deskAnchors(size: FurnitureInput['footprint']): ModelSpecAnchor[] {
  return [
    { kind: 'mount', id: 'surface', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, size.height + 0.1, 0] },
    {
      kind: 'hit',
      id: 'hit',
      position: [0, size.height / 2, 0],
      size: [size.width, size.height, size.depth],
    },
  ];
}

export interface OfficeInput extends FurnitureInput {
  readonly mount?: Mount;
  readonly extraAnchors?: readonly ModelSpecAnchor[];
}

export function officeItem(input: OfficeInput): ModelSpec {
  const { mount, extraAnchors, ...rest } = input;
  const base = furniture(rest);
  const anchors = mount === 'desk' ? deskAnchors(input.footprint) : (base.anchors ?? []);
  return {
    ...base,
    category: 'office',
    states: { rest: {} },
    anchors: [...anchors, ...(extraAnchors ?? [])],
  };
}

const STAR_ARMS = 5;

function polar(radius: number, angle: number): readonly [number, number] {
  const rad = (angle * Math.PI) / 180;
  return [radius * Math.sin(rad), radius * Math.cos(rad)];
}

export interface StarShape {
  readonly radius: number;
  readonly arm: number;
  readonly wheelLod: 1 | 2;
}

export function starBase(shape: StarShape): ModelSpecPart[] {
  return Array.from({ length: STAR_ARMS }, (_, index) => {
    const angle = (360 / STAR_ARMS) * index;
    const [armX, armZ] = polar(shape.radius / 2, angle);
    const [wheelX, wheelZ] = polar(shape.radius - 0.02, angle);
    const name = String(index + 1);
    return [
      piece(
        `spoke${name}`,
        'frame',
        {
          type: 'roundedBox',
          width: shape.arm,
          height: 0.036,
          depth: shape.radius,
          radius: 0.014,
          segments: 3,
        },
        { at: [armX, 0.085, armZ], turn: [0, angle, 0], contact: true },
      ),
      rod(
        `wheel${name}`,
        'frame',
        { height: 0.032, top: 0.027, segments: 24 },
        { at: [wheelX, 0.03, wheelZ], turn: [0, angle, 90], contact: true, minLod: shape.wheelLod },
      ),
    ];
  }).flat();
}
