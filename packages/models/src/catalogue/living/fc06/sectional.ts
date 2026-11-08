import type { ModelSpecPart } from '@smarteverything/domain';
import {
  block,
  by,
  ferrules,
  furniture,
  legs,
  upholsteryFinishes,
  upholsteryOf,
  woodOf,
  type Len,
} from './kit';

const SEAT = 0.92;
const CHAISE = 0.92;
const ARM = 0.18;
const HEIGHT = 0.84;
const LEG_H = 0.07;
const BASE_H = 0.2;
const SEAT_Y = LEG_H + BASE_H;

const W = (scale: number, offset = 0): Len => by('width', scale, offset);
const D = (scale: number, offset = 0): Len => by('depth', scale, offset);

const FEET: readonly (readonly [Len, Len])[] = [
  [W(-0.5, 0.09), D(-0.5, 0.08)],
  [W(-0.5, 0.09), D(-0.5, SEAT - 0.08)],
  [W(0.5, -0.08), D(-0.5, 0.08)],
  [W(0.5, -0.08), D(0.5, -0.08)],
  [W(0.5, -CHAISE + 0.08), D(0.5, -0.08)],
  [(ARM - CHAISE) / 2, D(-0.5, SEAT - 0.08)],
];

function frameParts(): ModelSpecPart[] {
  return [
    block('baseMain', 'body', [W(1, -CHAISE - ARM + 0.01), BASE_H, SEAT - 0.04], {
      at: [(ARM - CHAISE) / 2, LEG_H + BASE_H / 2, D(-0.5, SEAT / 2 + 0.01)],
      round: 0.04,
      segments: 3,
    }),
    block('baseChaise', 'body', [CHAISE, BASE_H, D(1, -0.02)], {
      at: [W(0.5, -CHAISE / 2), LEG_H + BASE_H / 2, 0],
      round: 0.04,
      segments: 3,
    }),
    block('back', 'body', [W(1, -ARM), HEIGHT - SEAT_Y, 0.2], {
      at: [ARM / 2, (HEIGHT + SEAT_Y) / 2, D(-0.5, 0.1)],
      round: 0.07,
    }),
    block('arm', 'body', [ARM, 0.56, SEAT], {
      at: [W(-0.5, ARM / 2), LEG_H + 0.28, D(-0.5, SEAT / 2)],
      round: 0.07,
    }),
    block('chaiseEnd', 'body', [CHAISE - 0.04, 0.26, 0.05], {
      at: [W(0.5, -CHAISE / 2), SEAT_Y + 0.02, D(0.5, -0.025)],
      round: 0.02,
      segments: 3,
      minLod: 1,
    }),
    ...legs('frame', FEET, { height: LEG_H, top: 0.022, bottom: 0.016 }),
    ...ferrules(FEET, 0.0165),
  ];
}

function cushionParts(): ModelSpecPart[] {
  const span = W(0.5, -(CHAISE + ARM) / 2 - 0.012);
  const seat = (x: Len, name: string): ModelSpecPart[] => [
    block(`seat${name}`, 'body', [span, 0.17, 0.64], {
      at: [x, SEAT_Y + 0.085, D(-0.5, 0.56)],
      round: 0.055,
    }),
    block(`cushion${name}`, 'body', [span, 0.44, 0.2], {
      at: [x, 0.62, D(-0.5, 0.23)],
      turn: [-10, 0, 0],
      round: 0.08,
      minLod: 1,
    }),
  ];
  return [
    ...seat(W(-0.25, ARM * 0.75 - CHAISE / 4 + 0.003), '1'),
    ...seat(W(0.25, -CHAISE * 0.75 + ARM / 4 - 0.003), '2'),
    block('seatChaise', 'body', [CHAISE - 0.02, 0.17, D(1, -0.3)], {
      at: [W(0.5, -CHAISE / 2), SEAT_Y + 0.085, 0.09],
      round: 0.055,
    }),
    block('cushionChaise', 'body', [CHAISE - 0.04, 0.44, 0.2], {
      at: [W(0.5, -CHAISE / 2), 0.62, D(-0.5, 0.23)],
      turn: [-10, 0, 0],
      round: 0.08,
      minLod: 1,
    }),
  ];
}

export const SECTIONAL_L_MODEL = furniture({
  id: 'cat.living.sectional-l',
  title: 'L-shaped sectional sofa',
  footprint: { width: 2.8, depth: 1.65, height: HEIGHT },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    depth: { param: 'depth', extra: 0, resizes: true },
  },
  meta: {
    names: {
      display: 'L-shaped sectional',
      synonyms: ['sectional', 'corner sofa', 'l sofa', 'modular sofa', 'chaise sofa'],
    },
    sizeClass: 'large',
    aliases: ['cat.living.sectional', 'cat.living.corner-sofa'],
  },
  params: {
    width: { min: 2.3, max: 3.4, default: 2.8, unit: 'm' },
    depth: { min: 1.4, max: 2, default: 1.65, unit: 'm' },
  },
  materials: {
    body: upholsteryOf('oat'),
    frame: woodOf('oak'),
    accent: { finish: 'brushed-aluminium' },
  },
  finishes: upholsteryFinishes(['body']),
  defaultFinish: 'oat',
  parts: [...frameParts(), ...cushionParts()],
});
