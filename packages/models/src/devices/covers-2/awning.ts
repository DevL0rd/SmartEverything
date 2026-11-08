import type { ModelSpec } from '@smarteverything/domain';
import { box } from '../../helpers/geometry';
import { look, MOVING_WHEN, OK, pivot, slide } from './kit';

const HOUSE = { yaw: 34, pitch: 16, fov: 28, padding: 0.1, focus: 'span' } as const;
const WIDTH = 1.84;
const REACH = 1.5;
const TILT = 12;
const PIVOT_Y = 0.36;
const PIVOT_Z = 0.13;
const STRIPES = [-0.68, -0.34, 0, 0.34, 0.68];

export const AWNING_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.cover.awning',
  version: '1.0.0',
  title: 'Retractable awning',
  category: 'cover',
  family: 'cover',
  footprint: { width: WIDTH, depth: REACH + PIVOT_Z, height: 0.44 },
  framing: {
    tile: { ...HOUSE, padding: 0.06 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.14, pitch: 22 },
  },
  shots: [
    {
      id: 'extend',
      when: MOVING_WHEN,
      focus: 'frontBar',
      zoom: 1.1,
      yaw: -12,
      pitch: 6,
      easeMs: 1000,
      loopS: 1,
      symmetry: 360,
      stillAt: 0,
    },
  ],
  meta: {
    names: {
      display: 'Retractable awning',
      synonyms: ['awning', 'patio awning', 'sun shade', 'terrace awning', 'canopy'],
    },
    sizeClass: 'large',
    variants: ['sand', 'stripe'],
  },
  materials: {
    body: { finish: 'graphite' },
    fabric: { finish: 'warm-white', roughness: 0.9, sheen: 0.6, pattern: 'knit' },
    stripe: { color: '#9E4A34', roughness: 0.9, sheen: 0.5, pattern: 'knit' },
    accent: { color: OK, roughness: 0.3, opacity: 0 },
  },
  finishes: {
    sand: { stripe: { color: '#D9CFB8' } },
    stripe: {},
  },
  defaultFinish: 'stripe',
  parts: [
    box('cassette', [WIDTH, 0.13, 0.13, 0.04], 'body', {
      at: [0, 0.36, 0.065],
      contact: true,
    }),
    box('lip', [WIDTH - 0.1, 0.012, 0.05, 0.005], 'fabric', {
      at: [0, -0.05, 0.05],
      parent: 'cassette',
      minLod: 1,
    }),
    box('bracketLeft', [0.05, 0.2, 0.03, 0.01], 'body', {
      at: [-0.8, 0.3, 0.015],
      minLod: 1,
    }),
    box('bracketRight', [0.05, 0.2, 0.03, 0.01], 'body', { at: [0.8, 0.3, 0.015], minLod: 1 }),
    pivot('tilt', { at: [0, PIVOT_Y, PIVOT_Z], transform: { rotation: [TILT, 0, 0] } }),
    pivot('span', { at: [0, 0, 0], parent: 'tilt' }),
    box('fabric', [WIDTH - 0.1, 0.008, 1, 0.003], 'fabric', {
      at: [0, 0, 0.5],
      parent: 'span',
    }),
    ...STRIPES.map((x, index) =>
      box(`stripe${String(index)}`, [0.17, 0.002, 1, 0.0008], 'stripe', {
        at: [x, 0.0044, 0.5],
        parent: 'span',
        minLod: 1,
      }),
    ),
    box('armLeft', [0.03, 0.024, 1, 0.01], 'body', { at: [-0.9, -0.016, 0.5], parent: 'span' }),
    box('armRight', [0.03, 0.024, 1, 0.01], 'body', { at: [0.9, -0.016, 0.5], parent: 'span' }),
    box('frontBar', [WIDTH, 0.04, 0.05, 0.018], 'body', { at: [0, -0.012, 0], parent: 'tilt' }),
    box('valance', [WIDTH - 0.04, 0.1, 0.014, 0.006], 'fabric', {
      at: [0, -0.07, 0.01],
      parent: 'frontBar',
    }),
    {
      id: 'led',
      parent: 'cassette',
      geometry: { type: 'sphere', radius: 0.004, segments: 12 },
      material: 'accent',
      transform: { position: [0.84, 0, 0.066] },
      minLod: 1,
    },
  ],
  anchors: [
    { kind: 'mount', id: 'wall', position: [0, 0, 0], mount: 'wall' },
    { kind: 'label', id: 'pin', position: [0, 0.7, 0.2] },
    {
      kind: 'hit',
      id: 'bodyHit',
      position: [0, 0.22, (REACH + PIVOT_Z) / 2],
      size: [WIDTH, 0.44, REACH + PIVOT_Z],
    },
  ],
  channels: [
    {
      id: 'spanReach',
      target: 'span',
      property: 'scale',
      axis: 'z',
      source: 'position',
      map: { type: 'linear', in: [0, 1], out: [0.04, REACH], clamp: true },
      motion: { type: 'pose', easeMs: 1400 },
      reduced: 'hold',
    },
    slide('frontReach', 'frontBar', ['z', [0.04, REACH]], 1400),
    look('ledShow', ['led', 'opacity'], ['online', { true: 1, false: 0 }]),
    look('ledGlow', ['led', 'emissive'], ['online', { true: 0.9, false: 0 }]),
    look('ledFault', ['led', 'colour'], ['fault', { true: '#F2564E' }]),
  ],
  states: {
    retracted: { position: 0, online: true },
    half: { position: 0.5, online: true },
    extended: { position: 1, online: true },
    fault: { position: 0.3, online: true, fault: true },
    offline: { online: false },
  },
};
