import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import {
  block,
  by,
  corners,
  ferrules,
  furniture,
  legs,
  upholsteryFinishes,
  upholsteryOf,
  woodOf,
} from './kit';

const DEPTH = 0.92;
const HEIGHT = 0.84;
const LEG_H = 0.07;
const BASE_H = 0.2;
const SEAT_Y = LEG_H + BASE_H;
const ARM_H = 0.56;

interface Range {
  readonly min: number;
  readonly max: number;
  readonly default: number;
}

interface SofaShape {
  readonly id: string;
  readonly title: string;
  readonly seats: number;
  readonly width: Range;
  readonly arm: number;
  readonly meta: NonNullable<ModelSpec['meta']>;
}

function seatParts(seats: number, arm: number): ModelSpecPart[] {
  return Array.from({ length: seats }, (_, index) => {
    const share = (index + 0.5) / seats - 0.5;
    const x = by('width', share, -2 * arm * share);
    const width = by('width', 1 / seats, (-2 * arm) / seats - 0.012);
    const name = String(index + 1);
    return [
      block(`seat${name}`, 'body', [width, 0.17, 0.64], {
        at: [x, SEAT_Y + 0.085, 0.1],
        round: 0.055,
      }),
      block(`cushion${name}`, 'body', [width, 0.44, 0.2], {
        at: [x, 0.62, -0.23],
        turn: [-10, 0, 0],
        round: 0.08,
        minLod: 1,
      }),
    ];
  }).flat();
}

function armParts(arm: number): ModelSpecPart[] {
  return [-1, 1].flatMap((side) => {
    const name = side < 0 ? 'Left' : 'Right';
    const x = by('width', side / 2, (-side * arm) / 2);
    return [
      block(`arm${name}`, 'body', [arm, ARM_H, DEPTH], {
        at: [x, LEG_H + ARM_H / 2, 0],
        round: 0.07,
      }),
      block(`armFace${name}`, 'body', [arm - 0.03, ARM_H - 0.06, 0.02], {
        at: [x, LEG_H + ARM_H / 2, DEPTH / 2 + 0.002],
        round: 0.008,
        segments: 3,
        minLod: 2,
      }),
    ];
  });
}

function frameParts(arm: number): ModelSpecPart[] {
  const x = by('width', 0.5, -arm / 2);
  const negX = by('width', -0.5, arm / 2);
  const feet = corners(x, DEPTH / 2 - 0.08, negX, -DEPTH / 2 + 0.08);
  return [
    block('base', 'body', [by('width', 1, -2 * arm + 0.02), BASE_H, DEPTH - 0.04], {
      at: [0, LEG_H + BASE_H / 2, 0.01],
      round: 0.04,
      segments: 3,
    }),
    block('back', 'body', [by('width', 1, -2 * arm + 0.02), HEIGHT - SEAT_Y, 0.2], {
      at: [0, (HEIGHT + SEAT_Y) / 2, -DEPTH / 2 + 0.1],
      round: 0.07,
    }),
    ...legs('frame', feet, { height: LEG_H, top: 0.022, bottom: 0.016 }),
    ...ferrules(feet, 0.0165),
  ];
}

export function sofa(shape: SofaShape): ModelSpec {
  return furniture({
    id: shape.id,
    title: shape.title,
    footprint: { width: shape.width.default, depth: DEPTH, height: HEIGHT },
    size: { width: { param: 'width', extra: 0, resizes: true } },
    meta: shape.meta,
    params: { width: { ...shape.width, unit: 'm' } },
    materials: {
      body: upholsteryOf('oat'),
      frame: woodOf('oak'),
      accent: { finish: 'brushed-aluminium' },
    },
    finishes: upholsteryFinishes(['body']),
    defaultFinish: 'oat',
    parts: [...frameParts(shape.arm), ...armParts(shape.arm), ...seatParts(shape.seats, shape.arm)],
  });
}

export const SOFA_2_SEAT_MODEL = sofa({
  id: 'cat.living.sofa-2-seat',
  title: 'Two-seat sofa',
  seats: 2,
  width: { min: 1.4, max: 2, default: 1.7 },
  arm: 0.17,
  meta: {
    names: { display: 'Two-seat sofa', synonyms: ['loveseat', 'love seat', 'small sofa', 'couch'] },
    sizeClass: 'large',
    aliases: ['cat.living.sofa-2', 'cat.living.loveseat'],
  },
});

export const SOFA_3_SEAT_MODEL = sofa({
  id: 'cat.living.sofa-3-seat',
  title: 'Three-seat sofa',
  seats: 3,
  width: { min: 1.9, max: 2.6, default: 2.2 },
  arm: 0.18,
  meta: {
    names: { display: 'Three-seat sofa', synonyms: ['sofa', 'couch', 'settee', 'three seater'] },
    sizeClass: 'large',
    aliases: ['cat.living.sofa', 'cat.living.sofa-3'],
  },
});

export const ARMCHAIR_MODEL = sofa({
  id: 'cat.living.armchair',
  title: 'Armchair',
  seats: 1,
  width: { min: 0.72, max: 1, default: 0.86 },
  arm: 0.16,
  meta: {
    names: { display: 'Armchair', synonyms: ['easy chair', 'club chair', 'single seat sofa'] },
    sizeClass: 'medium',
    aliases: ['cat.living.single-seat'],
  },
});
