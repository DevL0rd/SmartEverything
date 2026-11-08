import type { ModelSpec } from '@smarteverything/domain';
import { finishSet } from '../../helpers/finishes';
import { box, part } from '../../helpers/geometry';
import {
  cylinder,
  emitter,
  glowChannels,
  glowShot,
  lightModel,
  spillChannels,
} from '../light-fixtures/kit';

const CENTRE_Y = 0.11;
const BODY_H = 0.15;
const BODY_R = 0.036;
const BODY_Z = 0.078;
const PLATE_D = 0.012;
const VIEW = { yaw: 14, pitch: 10, fov: 28, padding: 0.08, focus: 'body' } as const;

const FITTING: ModelSpec['parts'] = [
  box('plate', [0.09, 0.17, PLATE_D, 0.0024], 'body', {
    at: [0, CENTRE_Y, PLATE_D / 2],
    segments: 5,
    contact: true,
  }),
  part(
    'arm',
    cylinder({ top: 0.011, height: BODY_Z - PLATE_D, bevel: 0.0015, segments: 32 }),
    'body',
    {
      transform: {
        position: [0, CENTRE_Y, PLATE_D + (BODY_Z - PLATE_D) / 2],
        rotation: [90, 0, 0],
      },
    },
  ),
  part('body', cylinder({ top: BODY_R, height: BODY_H, bevel: 0.0035, segments: 64 }), 'body', {
    transform: { position: [0, CENTRE_Y, BODY_Z] },
  }),
  part('topLens', cylinder({ top: BODY_R - 0.005, height: 0.003, bevel: 0.001 }), 'glass', {
    parent: 'body',
    transform: { position: [0, BODY_H / 2 + 0.0004, 0] },
  }),
  part('bottomLens', cylinder({ top: BODY_R - 0.005, height: 0.003, bevel: 0.001 }), 'glass', {
    parent: 'body',
    transform: { position: [0, -BODY_H / 2 - 0.0004, 0] },
  }),
  ...[1, -1].map((side) =>
    part(
      side > 0 ? 'topRing' : 'bottomRing',
      { type: 'torus', radius: BODY_R - 0.0035, tube: 0.0018, segments: 64 },
      'accent',
      {
        parent: 'body',
        transform: { position: [0, side * (BODY_H / 2 - 0.0005), 0], rotation: [90, 0, 0] },
        minLod: 1,
      },
    ),
  ),
  part('seam', { type: 'torus', radius: BODY_R + 0.0002, tube: 0.0007, segments: 64 }, 'accent', {
    parent: 'body',
    transform: { position: [0, -0.012, 0], rotation: [90, 0, 0] },
    minLod: 2,
  }),
];

const WASHES: ModelSpec['parts'] = [
  part('washUp', { type: 'glow', width: 0.11, height: 0.13, segments: 32 }, 'glass', {
    transform: { position: [0, CENTRE_Y + BODY_H / 2 + 0.055, 0.0015] },
    minLod: 1,
  }),
  part('washDown', { type: 'glow', width: 0.1, height: 0.11, segments: 32 }, 'glass', {
    transform: { position: [0, CENTRE_Y - BODY_H / 2 - 0.045, 0.0015] },
    minLod: 1,
  }),
];

export const WALL_SCONCE_MODEL: ModelSpec = lightModel({
  id: 'dev.light.wall-sconce',
  title: 'Wall sconce',
  footprint: { width: 0.09, depth: BODY_Z + BODY_R, height: 0.22 },
  framing: { tile: VIEW, card: VIEW, hero: { ...VIEW, padding: 0.1 } },
  shots: [glowShot({ focus: 'body', zoom: 1.15, yaw: 24, pitch: 6 })],
  meta: {
    names: {
      display: 'Wall sconce',
      synonyms: ['wall light', 'sconce', 'up down light', 'wall lamp', 'wall washer'],
    },
    sizeClass: 'small',
    variants: ['graphite', 'white', 'black'],
  },
  materials: {
    body: { finish: 'graphite' },
    glass: { finish: 'frosted-glass', opacity: 0.92 },
    accent: { finish: 'brushed-aluminium' },
  },
  ...finishSet(
    {
      graphite: {},
      white: { body: { finish: 'matte-white' } },
      black: { body: { finish: 'satin-black' } },
    },
    'graphite',
  ),
  parts: [...FITTING, ...WASHES],
  anchors: [
    emitter({
      id: 'downLight',
      parent: 'body',
      position: [0, -BODY_H / 2 - 0.01, 0],
      radius: 1.2,
      intensity: 0.7,
      cone: 50,
    }),
    {
      ...emitter({
        id: 'upLight',
        parent: 'body',
        position: [0, BODY_H / 2 + 0.01, 0],
        radius: 2,
        cone: 50,
      }),
      rotation: [180, 0, 0],
    },
    { kind: 'mount', id: 'wall', position: [0, CENTRE_Y, 0], mount: 'wall' },
    { kind: 'label', id: 'pin', position: [0, CENTRE_Y + 0.13, BODY_Z] },
    {
      kind: 'hit',
      id: 'hitBody',
      position: [0, CENTRE_Y, BODY_Z / 2],
      size: [0.09, 0.17, BODY_Z + BODY_R],
    },
  ],
  channels: [
    ...glowChannels('topLens', [0.05, 1.4]),
    ...glowChannels('bottomLens', [0.05, 1.4]),
    ...spillChannels('washUp', [0.25, 0.8]),
    ...spillChannels('washDown', [0.25, 0.8]),
    ...glowChannels('downLight', [0.35, 1]),
    ...glowChannels('upLight', [0.35, 1]),
  ],
});
