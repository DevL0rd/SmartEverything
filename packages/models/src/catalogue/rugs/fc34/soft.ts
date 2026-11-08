import type { ModelSpec } from '@smarteverything/domain';
import {
  SIZE_PARAM,
  WOOL,
  block,
  by,
  cyl,
  piece,
  ribbed,
  rugItem,
  sized,
  solid,
  woven,
  type Colourway,
} from './kit';

const SHAG_WAYS: Readonly<Record<string, Colourway>> = {
  cream: { pile: '#E6DDCB', border: '#BFB29A', accent: '#A2553B' },
  grey: { pile: '#9AA0A6', border: '#6B7178', accent: '#E6DDCB' },
  blush: { pile: '#D9B3AC', border: '#A87F78', accent: '#4C5A66' },
  moss: { pile: '#7F9479', border: '#4C5E49', accent: '#E6DDCB' },
};

const SHAG_ROWS = 24;

export const SHAG_RUG_MODEL: ModelSpec = rugItem({
  id: 'cat.rugs.shag-rug',
  title: 'Shag rug',
  footprint: { width: 2, depth: 1.4, height: 0.06 },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    depth: { param: 'depth', extra: 0, resizes: true },
  },
  meta: {
    names: {
      display: 'Shag rug',
      synonyms: ['shaggy rug', 'fluffy rug', 'high pile rug', 'plush rug', 'long pile rug'],
    },
    sizeClass: 'large',
  },
  params: {
    width: { min: 1.2, max: 3.2, default: 2, unit: 'm' },
    depth: { min: 0.8, max: 2.4, default: 1.4, unit: 'm' },
  },
  woven: woven(SHAG_WAYS),
  parts: [
    block('pad', 'border', [by('width', 1), 0.03, by('depth', 1)], {
      at: [0, 0.015, 0],
      round: 0.012,
      segments: 4,
      contact: true,
    }),
    piece(
      'strands',
      'pile',
      {
        type: 'slats',
        count: SHAG_ROWS,
        spacing: by('depth', 1 / SHAG_ROWS),
        width: by('width', 1, -0.05),
        height: by('depth', 0.72 / SHAG_ROWS),
        depth: 0.034,
      },
      { at: [0, 0.045, 0], turn: [90, 0, 0] },
    ),
  ],
});

const BATH_WAYS: Readonly<Record<string, Colourway>> = {
  white: { pile: '#EDE8DD', border: '#CFC7B6', accent: '#8FA48A' },
  sage: { pile: '#8FA48A', border: '#6B8066', accent: '#EDE8DD' },
  slate: { pile: '#69717C', border: '#4A5159', accent: '#EDE8DD' },
  blush: { pile: '#D9B3AC', border: '#B88F88', accent: '#EDE8DD' },
};

export const BATH_RUG_MODEL: ModelSpec = rugItem({
  id: 'cat.rugs.bath-rug',
  title: 'Bath rug',
  footprint: { width: 0.9, depth: 0.6, height: 0.034 },
  meta: {
    names: {
      display: 'Bath rug',
      synonyms: ['bath mat rug', 'bathroom rug', 'chenille rug', 'oval bath rug', 'shower rug'],
    },
    sizeClass: 'small',
  },
  params: { size: SIZE_PARAM },
  woven: woven(BATH_WAYS, { pile: WOOL.pile, border: WOOL.border, accent: solid }),
  parts: sized('size', [
    block('middle', 'pile', [0.3, 0.028, 0.6], {
      at: [0, 0.014, 0],
      round: 0.012,
      segments: 3,
      contact: true,
    }),
    ...([-1, 1] as const).map((side) =>
      cyl(
        `cap${side < 0 ? 'Left' : 'Right'}`,
        'pile',
        { height: 0.028, top: 0.3, bevel: 0.01, segments: 64 },
        { at: [side * 0.15, 0.014, 0] },
      ),
    ),
    block('panel', 'border', [0.3, 0.004, 0.5], {
      at: [0, 0.03, 0],
      round: 0.0015,
      segments: 3,
      minLod: 1,
    }),
    ...([-1, 1] as const).map((side) =>
      cyl(
        `panelCap${side < 0 ? 'Left' : 'Right'}`,
        'border',
        { height: 0.004, top: 0.25, bevel: 0.0015, segments: 64 },
        { at: [side * 0.15, 0.03, 0], minLod: 1 },
      ),
    ),
    block('stripe', 'accent', [0.3, 0.002, 0.03], {
      at: [0, 0.0335, 0],
      round: 0.0006,
      segments: 3,
      minLod: 1,
    }),
  ]),
});

const MAT_WAYS: Readonly<Record<string, Colourway>> = {
  coir: { pile: '#8A6A47', border: '#2B2B2E', accent: '#C9A25A' },
  charcoal: { pile: '#4A4A4C', border: '#2B2B2E', accent: '#9AA0A6' },
  natural: { pile: '#B99A6B', border: '#3A3A3C', accent: '#6A5A3E' },
};

const MAT_ROWS = 14;

export const DOOR_MAT_MODEL: ModelSpec = rugItem({
  id: 'cat.rugs.door-mat',
  title: 'Door mat',
  footprint: { width: 0.75, depth: 0.45, height: 0.032 },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    depth: { param: 'depth', extra: 0, resizes: true },
  },
  meta: {
    names: {
      display: 'Door mat',
      synonyms: ['doormat', 'welcome mat', 'entrance mat', 'coir mat', 'front door mat'],
    },
    sizeClass: 'small',
  },
  params: {
    width: { min: 0.5, max: 1.2, default: 0.75, unit: 'm' },
    depth: { min: 0.3, max: 0.8, default: 0.45, unit: 'm' },
  },
  woven: woven(MAT_WAYS, {
    pile: ribbed,
    border: (color) => ({ color, roughness: 0.9 }),
    accent: solid,
  }),
  parts: [
    block('tray', 'border', [by('width', 1), 0.026, by('depth', 1)], {
      at: [0, 0.013, 0],
      round: 0.008,
      segments: 3,
      contact: true,
    }),
    piece(
      'bristles',
      'pile',
      {
        type: 'slats',
        count: MAT_ROWS,
        spacing: by('depth', 1 / MAT_ROWS, -0.06 / MAT_ROWS),
        width: by('width', 1, -0.06),
        height: by('depth', 0.95 / MAT_ROWS, -0.057 / MAT_ROWS),
        depth: 0.018,
      },
      { at: [0, 0.02, 0], turn: [90, 0, 0] },
    ),
    block('band', 'accent', [by('width', 1, -0.2), 0.003, 0.04], {
      at: [0, 0.0305, 0],
      round: 0.001,
      segments: 3,
      minLod: 1,
    }),
  ],
});

const OUTDOOR_WAYS: Readonly<Record<string, Colourway>> = {
  sand: { pile: '#D9CDB2', border: '#8A7B66', accent: '#3F7F82' },
  slate: { pile: '#9AA0A6', border: '#4A5159', accent: '#E6DDCB' },
  olive: { pile: '#C9C0A0', border: '#6F7A55', accent: '#A2553B' },
};

const STRIPES = 5;

export const OUTDOOR_RUG_MODEL: ModelSpec = rugItem({
  id: 'cat.rugs.outdoor-rug',
  title: 'Outdoor rug',
  footprint: { width: 2.4, depth: 1.6, height: 0.012 },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    depth: { param: 'depth', extra: 0, resizes: true },
  },
  meta: {
    names: {
      display: 'Outdoor rug',
      synonyms: [
        'patio rug',
        'garden rug',
        'striped outdoor rug',
        'weatherproof rug',
        'balcony rug',
      ],
    },
    sizeClass: 'large',
  },
  params: {
    width: { min: 1.5, max: 4, default: 2.4, unit: 'm' },
    depth: { min: 1, max: 3, default: 1.6, unit: 'm' },
  },
  woven: woven(OUTDOOR_WAYS, { pile: ribbed, border: ribbed, accent: solid }),
  parts: [
    block('weave', 'pile', [by('width', 1), 0.008, by('depth', 1)], {
      at: [0, 0.004, 0],
      round: 0.003,
      segments: 3,
      contact: true,
    }),
    piece(
      'stripes',
      'accent',
      {
        type: 'slats',
        count: STRIPES,
        spacing: by('depth', 2 / 9),
        width: by('width', 1, -0.04),
        height: by('depth', 1 / 9),
        depth: 0.003,
      },
      { at: [0, 0.0095, 0], turn: [90, 0, 0] },
    ),
    ...([-1, 1] as const).map((side) =>
      block(
        `edge${side < 0 ? 'Left' : 'Right'}`,
        'border',
        [0.024, 0.004, by('depth', 1, -0.048)],
        {
          at: [by('width', side * 0.5, -side * 0.012), 0.01, 0],
          round: 0.001,
          segments: 3,
          minLod: 1,
        },
      ),
    ),
  ],
});
