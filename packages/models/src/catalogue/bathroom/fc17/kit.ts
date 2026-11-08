import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { furniture, piece, type FurnitureInput, type Len, type Place } from '../../living/fc06/kit';

type Override = NonNullable<ModelSpec['finishes']>[string][string];
type Finishes = NonNullable<ModelSpec['finishes']>;

export const BATH_FINISH_NAMES = [
  'ceramic-white',
  'matte-black',
  'brushed-brass',
  'terrazzo',
] as const;

export type BathFinish = (typeof BATH_FINISH_NAMES)[number];

export type BathRole = 'ware' | 'fixture' | 'cabinet' | 'panel' | 'wicker' | 'soft';

const BRASS = { color: '#B8975A', metalness: 1, roughness: 0.34, pattern: 'brushed' } as const;

const ROLE_LOOKS: Readonly<Record<BathRole, Readonly<Record<BathFinish, Override>>>> = {
  ware: {
    'ceramic-white': { finish: 'ceramic' },
    'matte-black': { color: '#2A2B2F', roughness: 0.5, clearcoat: 0.2 },
    'brushed-brass': { finish: 'ceramic' },
    terrazzo: { finish: 'terrazzo' },
  },
  fixture: {
    'ceramic-white': { finish: 'chrome' },
    'matte-black': { finish: 'satin-black' },
    'brushed-brass': BRASS,
    terrazzo: { finish: 'chrome' },
  },
  cabinet: {
    'ceramic-white': { finish: 'warm-white' },
    'matte-black': { finish: 'satin-black' },
    'brushed-brass': { finish: 'warm-white' },
    terrazzo: { finish: 'oak' },
  },
  panel: {
    'ceramic-white': { finish: 'matte-white' },
    'matte-black': { finish: 'graphite' },
    'brushed-brass': { finish: 'matte-white' },
    terrazzo: { finish: 'terrazzo' },
  },
  wicker: {
    'ceramic-white': { color: '#E7E2D8' },
    'matte-black': { color: '#2B2C30' },
    'brushed-brass': { color: '#B79A74' },
    terrazzo: { color: '#C9BBA3' },
  },
  soft: {
    'ceramic-white': { color: '#ECE8DF' },
    'matte-black': { color: '#34363B' },
    'brushed-brass': { color: '#CDBA93' },
    terrazzo: { color: '#CFC8BC' },
  },
};

export function bathFinishes(slots: Readonly<Record<string, BathRole>>): Finishes {
  return Object.fromEntries(
    BATH_FINISH_NAMES.map((name) => [
      name,
      Object.fromEntries(
        Object.entries(slots).map(([slot, role]): [string, Override] => [
          slot,
          ROLE_LOOKS[role][name],
        ]),
      ),
    ]),
  );
}

export interface BathroomInput extends Omit<FurnitureInput, 'finishes' | 'defaultFinish'> {
  readonly roles: Readonly<Record<string, BathRole>>;
}

export function bathroomItem(input: BathroomInput): ModelSpec {
  const { roles, ...rest } = input;
  return {
    ...furniture({ ...rest, finishes: bathFinishes(roles), defaultFinish: 'ceramic-white' }),
    category: 'bathroom',
    states: { rest: {} },
  };
}

export interface SlabShape {
  readonly plan: readonly [Len, Len];
  readonly height: number;
}

export function ellipseSlab(
  id: string,
  material: string,
  shape: SlabShape,
  place: Place = {},
): ModelSpecPart {
  return piece(
    id,
    material,
    {
      type: 'cylinder',
      height: shape.height,
      topRadius: 0.5,
      bottomRadius: 0.5,
      bevel: shape.height / 2.2,
      segments: 64,
    },
    { ...place, scale: [shape.plan[0], 1, shape.plan[1]] },
  );
}
