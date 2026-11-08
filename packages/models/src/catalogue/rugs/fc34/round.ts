import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { WOOL_WAYS, by, cyl, piece, ribbed, rugItem, solid, woven, type Colourway } from './kit';

const THICK = 0.014;

export const RUG_ROUND_MODEL: ModelSpec = rugItem({
  id: 'cat.rugs.rug-round',
  title: 'Rug round',
  footprint: { width: 1.8, depth: 1.8, height: 0.02 },
  size: {
    width: { param: 'diameter', extra: 0, resizes: true },
    depth: { param: 'diameter', extra: 0, resizes: true },
  },
  meta: {
    names: {
      display: 'Rug round',
      synonyms: ['round rug', 'circular rug', 'circle rug', 'area rug round', 'carpet round'],
    },
    sizeClass: 'large',
  },
  params: { diameter: { min: 0.8, max: 3.2, default: 1.8, unit: 'm' } },
  woven: woven(WOOL_WAYS),
  parts: [
    cyl(
      'border',
      'border',
      { height: THICK, top: by('diameter', 0.5), bevel: 0.005, segments: 96 },
      { at: [0, THICK / 2, 0], contact: true },
    ),
    cyl(
      'field',
      'pile',
      { height: 0.004, top: by('diameter', 0.5, -0.08), bevel: 0.002, segments: 96 },
      { at: [0, THICK + 0.0015, 0] },
    ),
    piece(
      'ringOuter',
      'accent',
      {
        type: 'ring',
        innerRadius: by('diameter', 0.5, -0.2),
        outerRadius: by('diameter', 0.5, -0.17),
        segments: 96,
      },
      { at: [0, THICK + 0.0045, 0], turn: [-90, 0, 0], minLod: 1 },
    ),
    cyl(
      'medallion',
      'accent',
      { height: 0.002, top: by('diameter', 0.12), bevel: 0.0006, segments: 64 },
      { at: [0, THICK + 0.0045, 0] },
    ),
  ],
});

const RINGS = 8;
const TUBE = 0.016;
const PITCH = 0.034;
const JUTE_WAYS: Readonly<Record<string, Colourway>> = {
  natural: { pile: '#C9AE80', border: '#A98D5E', accent: '#6A5A3E' },
  bleached: { pile: '#E2D5B8', border: '#C9BA98', accent: '#8F8368' },
  charcoal: { pile: '#6A6258', border: '#4A443C', accent: '#B9A98A' },
};

function braid(index: number): ModelSpecPart {
  return piece(
    `braid${String(index + 1)}`,
    index % 4 === 3 ? 'border' : 'pile',
    {
      type: 'torus',
      radius: by('diameter', 0.5, -0.02 - PITCH * index),
      tube: TUBE,
      segments: 48,
    },
    { at: [0, TUBE, 0], turn: [90, 0, 0], minLod: 1 },
  );
}

export const JUTE_RUG_MODEL: ModelSpec = rugItem({
  id: 'cat.rugs.jute-rug',
  title: 'Jute rug',
  footprint: { width: 2, depth: 2, height: 0.035 },
  size: {
    width: { param: 'diameter', extra: 0, resizes: true },
    depth: { param: 'diameter', extra: 0, resizes: true },
  },
  meta: {
    names: {
      display: 'Jute rug',
      synonyms: [
        'braided rug',
        'natural fibre rug',
        'sisal rug',
        'woven jute rug',
        'round jute rug',
      ],
    },
    sizeClass: 'large',
  },
  params: { diameter: { min: 1, max: 3.2, default: 2, unit: 'm' } },
  woven: woven(JUTE_WAYS, { pile: ribbed, border: solid, accent: solid }),
  parts: [
    cyl(
      'disc',
      'border',
      { height: 0.016, top: by('diameter', 0.5), bevel: 0.006, segments: 96 },
      { at: [0, 0.008, 0], contact: true },
    ),
    ...Array.from({ length: RINGS }, (_, index) => braid(index)),
  ],
});
