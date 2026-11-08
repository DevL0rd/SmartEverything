import type { ModelSpecPart } from '@smarteverything/domain';
import {
  block,
  by,
  corners,
  ferrules,
  furniture,
  legs,
  piece,
  upholsteryFinishes,
  upholsteryOf,
  woodOf,
  type Vec,
} from '../fc06/kit';

const OTTOMAN_DEPTH = 0.6;
const OTTOMAN_LEG = 0.08;
const OTTOMAN_BODY = 0.33;
const OTTOMAN_TOP = OTTOMAN_LEG + OTTOMAN_BODY;
const OTTOMAN_FEET = corners(
  by('width', 0.5, -0.07),
  OTTOMAN_DEPTH / 2 - 0.07,
  by('width', -0.5, 0.07),
  -OTTOMAN_DEPTH / 2 + 0.07,
);

function tufts(): ModelSpecPart[] {
  return [-1, 0, 1].flatMap((column) =>
    [-1, 1].map((row) =>
      piece(
        `tuft${String(column + 2)}${row < 0 ? 'Back' : 'Front'}`,
        'body',
        { type: 'sphere', radius: 0.012, segments: 12 },
        { at: [by('width', column / 4), OTTOMAN_TOP - 0.004, row * 0.14], minLod: 2 },
      ),
    ),
  );
}

export const OTTOMAN_MODEL = furniture({
  id: 'cat.living.ottoman',
  title: 'Ottoman',
  footprint: { width: 0.9, depth: OTTOMAN_DEPTH, height: OTTOMAN_TOP },
  size: { width: { param: 'width', extra: 0, resizes: true } },
  meta: {
    names: { display: 'Ottoman', synonyms: ['footstool', 'footrest', 'upholstered bench'] },
    sizeClass: 'small',
    aliases: ['cat.living.footstool'],
  },
  params: { width: { min: 0.6, max: 1.3, default: 0.9, unit: 'm' } },
  materials: {
    body: upholsteryOf('oat'),
    frame: woodOf('oak'),
    accent: { finish: 'brushed-aluminium' },
  },
  finishes: upholsteryFinishes(['body']),
  defaultFinish: 'oat',
  parts: [
    block('body', 'body', [by('width', 1), OTTOMAN_BODY - 0.05, OTTOMAN_DEPTH], {
      at: [0, OTTOMAN_LEG + (OTTOMAN_BODY - 0.05) / 2, 0],
      round: 0.04,
      segments: 3,
    }),
    block('top', 'body', [by('width', 1, -0.02), 0.08, OTTOMAN_DEPTH - 0.02], {
      at: [0, OTTOMAN_TOP - 0.04, 0],
      round: 0.035,
    }),
    ...tufts(),
    ...legs('frame', OTTOMAN_FEET, { height: OTTOMAN_LEG, top: 0.02, bottom: 0.015 }),
    ...ferrules(OTTOMAN_FEET, 0.0155),
  ],
});

const POUF_HEIGHT = 0.42;
const POUF_SCALE: Vec = [by('diameter', 2), 1, by('diameter', 2)];

export const POUF_MODEL = furniture({
  id: 'cat.living.pouf',
  title: 'Pouf',
  footprint: { width: 0.504, depth: 0.514, height: POUF_HEIGHT },
  size: {
    width: { param: 'diameter', scale: 1.008, extra: 0, resizes: true },
    depth: { param: 'diameter', scale: 1.028, extra: 0, resizes: true },
  },
  meta: {
    names: { display: 'Pouf', synonyms: ['pouffe', 'floor cushion', 'stool', 'hassock'] },
    sizeClass: 'small',
    aliases: ['cat.living.pouffe', 'cat.living.stool'],
  },
  params: { diameter: { min: 0.38, max: 0.65, default: 0.5, unit: 'm' } },
  materials: {
    body: upholsteryOf('rust'),
    trim: upholsteryOf('cognac'),
  },
  finishes: upholsteryFinishes(['body']),
  defaultFinish: 'rust',
  parts: [
    piece(
      'body',
      'body',
      {
        type: 'lathe',
        profile: [
          [0, 0],
          [0.2, 0],
          [0.235, 0.012],
          [0.25, 0.06],
          [0.252, 0.21],
          [0.25, 0.36],
          [0.235, 0.408],
          [0.2, POUF_HEIGHT],
          [0, POUF_HEIGHT],
        ],
        segments: 64,
      },
      { scale: POUF_SCALE, contact: true },
    ),
    ...[0.024, POUF_HEIGHT - 0.024].map((y, index) =>
      piece(
        index === 0 ? 'pipingLow' : 'pipingHigh',
        'trim',
        { type: 'torus', radius: 0.24, tube: 0.008, segments: 64 },
        { parent: 'body', at: [0, y, 0], turn: [90, 0, 0], minLod: 1 },
      ),
    ),
    block('handle', 'trim', [0.07, 0.03, 0.02], {
      parent: 'body',
      at: [0, 0.3, 0.252],
      round: 0.008,
      segments: 3,
      minLod: 2,
    }),
  ],
});

const BAG_SCALE: Vec = [by('size', 1 / 0.9), by('size', 1 / 0.9), by('size', 1 / 0.9)];

export const BEAN_BAG_MODEL = furniture({
  id: 'cat.living.bean-bag',
  title: 'Bean bag',
  footprint: { width: 0.902, depth: 0.902, height: 0.781 },
  size: {
    width: { param: 'size', scale: 1.0022, extra: 0, resizes: true },
    depth: { param: 'size', scale: 1.0022, extra: 0, resizes: true },
    height: { param: 'size', scale: 0.8678, extra: 0, resizes: false },
  },
  meta: {
    names: { display: 'Bean bag', synonyms: ['beanbag', 'bean bag chair', 'lazy sofa', 'sack'] },
    sizeClass: 'medium',
    aliases: ['cat.living.beanbag', 'cat.living.lazy-sofa'],
  },
  params: { size: { min: 0.7, max: 1.2, default: 0.9, unit: 'm' } },
  materials: {
    body: upholsteryOf('slate'),
    trim: upholsteryOf('ink'),
  },
  finishes: upholsteryFinishes(['body']),
  defaultFinish: 'slate',
  parts: [
    piece(
      'bag',
      'body',
      {
        type: 'lathe',
        profile: [
          [0, 0],
          [0.34, 0],
          [0.42, 0.04],
          [0.45, 0.13],
          [0.43, 0.24],
          [0.36, 0.33],
          [0.22, 0.38],
          [0, 0.4],
        ],
        segments: 64,
      },
      { scale: BAG_SCALE, contact: true },
    ),
    piece(
      'backrest',
      'body',
      { type: 'sphere', radius: 0.3, segments: 48 },
      { parent: 'bag', at: [0, 0.46, -0.16], scale: [1.3, 1.07, 0.82] },
    ),
    piece(
      'seam',
      'trim',
      { type: 'torus', radius: 0.445, tube: 0.006, segments: 64 },
      { parent: 'bag', at: [0, 0.13, 0], turn: [90, 0, 0], minLod: 1 },
    ),
    block('loop', 'trim', [0.1, 0.03, 0.02], {
      parent: 'bag',
      at: [0, 0.62, -0.42],
      turn: [-30, 0, 0],
      round: 0.008,
      segments: 3,
      minLod: 2,
    }),
  ],
});
