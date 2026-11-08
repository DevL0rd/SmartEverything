import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { box } from '../../helpers/geometry';
import { look, MOVING_WHEN, OK, slide } from './kit';

const HOUSE = { yaw: 24, pitch: 12, fov: 28, padding: 0.1, focus: 'leaf' } as const;
const POST_A = -0.3;
const POST_B = 1.9;
const POST = 0.3;
const POST_H = 1.9;
const LEAF_W = 2.0;
const LEAF_CX = 0.8;
const LEAF_H = 1.5;
const LEAF_Y = 0.12;
const LEAF_Z = 0.2;
const TRAVEL = -1.95;
const PICKETS = 9;

function picket(index: number): ModelSpecPart {
  const step = (LEAF_W - 0.14) / (PICKETS - 1);
  return box(`picket${String(index)}`, [0.026, LEAF_H - 0.1, 0.026, 0.008], 'body', {
    at: [-(LEAF_W - 0.14) / 2 + index * step, -LEAF_H / 2, 0],
    parent: 'leaf',
    segments: 3,
    minLod: index % 4 === 0 ? 0 : index % 4 === 2 ? 1 : 2,
  });
}

function stub(index: number): ModelSpecPart {
  return box(`stub${String(index)}`, [0.026, 1.2, 0.026, 0.008], 'body', {
    at: [-2.38 + index * 0.34, 0.74, 0],
    segments: 3,
    minLod: index % 3 === 0 ? 1 : 2,
  });
}

export const GATE_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.cover.gate',
  version: '1.0.0',
  title: 'Sliding gate',
  category: 'cover',
  family: 'cover',
  footprint: { width: 4.8, depth: POST, height: POST_H + 0.06 },
  framing: {
    tile: { ...HOUSE, padding: 0.06, focus: 'leaf' },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.14, pitch: 16 },
  },
  shots: [
    {
      id: 'slide',
      when: MOVING_WHEN,
      focus: 'leaf',
      zoom: 1,
      yaw: -10,
      pitch: 6,
      easeMs: 1000,
      loopS: 1,
      symmetry: 360,
      stillAt: 0,
    },
  ],
  meta: {
    names: {
      display: 'Sliding gate',
      synonyms: ['gate', 'driveway gate', 'automatic gate', 'slide gate', 'entrance gate'],
    },
    sizeClass: 'large',
    variants: ['black', 'graphite'],
  },
  materials: {
    body: { finish: 'satin-black' },
    post: { finish: 'graphite' },
    trim: { finish: 'rubber' },
    accent: { color: OK, roughness: 0.3, opacity: 0 },
  },
  finishes: {
    black: {},
    graphite: { body: { finish: 'graphite' }, post: { finish: 'satin-black' } },
  },
  defaultFinish: 'black',
  parts: [
    box('postA', [POST, POST_H, POST, 0.02], 'post', {
      at: [POST_A, POST_H / 2, 0],
      contact: true,
    }),
    box('postB', [POST, POST_H, POST, 0.02], 'post', {
      at: [POST_B, POST_H / 2, 0],
      contact: true,
    }),
    box('capA', [POST + 0.06, 0.06, POST + 0.06, 0.02], 'trim', {
      at: [POST_A, POST_H + 0.03, 0],
      minLod: 1,
    }),
    box('capB', [POST + 0.06, 0.06, POST + 0.06, 0.02], 'trim', {
      at: [POST_B, POST_H + 0.03, 0],
      minLod: 1,
    }),
    box('track', [4.8, 0.02, 0.05, 0.008], 'trim', { at: [0, 0.01, LEAF_Z], contact: true }),
    box('stubTop', [2.1, 0.04, 0.04, 0.012], 'body', { at: [-1.38, 1.38, 0] }),
    box('stubBottom', [2.1, 0.04, 0.04, 0.012], 'body', { at: [-1.38, 0.14, 0] }),
    ...Array.from({ length: 6 }, (_, index) => stub(index)),
    box('leaf', [LEAF_W, 0.05, 0.05, 0.015], 'body', {
      at: [LEAF_CX, LEAF_Y + LEAF_H, LEAF_Z],
    }),
    box('leafBottom', [LEAF_W, 0.05, 0.05, 0.015], 'body', {
      at: [0, -LEAF_H + 0.05, 0],
      parent: 'leaf',
    }),
    box('leafEndLeft', [0.05, LEAF_H, 0.05, 0.015], 'body', {
      at: [-LEAF_W / 2 + 0.025, -LEAF_H / 2, 0],
      parent: 'leaf',
    }),
    box('leafEndRight', [0.05, LEAF_H, 0.05, 0.015], 'body', {
      at: [LEAF_W / 2 - 0.025, -LEAF_H / 2, 0],
      parent: 'leaf',
    }),
    ...Array.from({ length: PICKETS }, (_, index) => picket(index)),
    box('motor', [0.2, 0.26, 0.1, 0.03], 'trim', { at: [POST_B - 0.16, 0.2, LEAF_Z + 0.1] }),
    {
      id: 'led',
      parent: 'motor',
      geometry: { type: 'sphere', radius: 0.012, segments: 16 },
      material: 'accent',
      transform: { position: [0, 0.07, 0.05] },
      minLod: 1,
    },
  ],
  anchors: [
    { kind: 'mount', id: 'floor', position: [0, 0, 0], mount: 'floor' },
    { kind: 'label', id: 'pin', position: [0, POST_H + 0.3, 0] },
    {
      kind: 'hit',
      id: 'bodyHit',
      position: [0, POST_H / 2, 0.1],
      size: [4.8, POST_H, POST],
    },
  ],
  channels: [
    slide('leafSlide', 'leaf', ['x', [0, TRAVEL]], 2000),
    look('ledShow', ['led', 'opacity'], ['online', { true: 1, false: 0 }]),
    look('ledGlow', ['led', 'emissive'], ['online', { true: 0.9, false: 0 }]),
    look('ledFault', ['led', 'colour'], ['fault', { true: '#F2564E' }]),
  ],
  states: {
    closed: { position: 0, online: true },
    half: { position: 0.5, online: true },
    open: { position: 1, online: true },
    fault: { position: 0.4, online: true, fault: true },
    offline: { online: false },
  },
};
