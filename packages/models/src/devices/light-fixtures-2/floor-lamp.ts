import type { ModelSpec } from '@smarteverything/domain';
import { finishSet } from '../../helpers/finishes';
import { box, part } from '../../helpers/geometry';
import { cylinder, emitter, glowChannels, glowShot, lightModel } from '../light-fixtures/kit';

const HEIGHT = 1.6;
const SHADE_H = 0.32;
const SHADE_DROP = 0.36;
const BASE_H = 0.026;
const POLE_TRIM = 0.225;
const VIEW = { yaw: 30, pitch: 12, fov: 28, padding: 0.06, focus: 'pole' } as const;

function tall(offset: number, scale = 1): { param: string; scale: number; offset: number } {
  return { param: 'height', scale, offset };
}

const SHADE: [number, number][] = [
  [0.2, 0],
  [0.1995, 0.004],
  [0.19, SHADE_H / 2],
  [0.1805, SHADE_H - 0.004],
  [0.18, SHADE_H],
];

const LINER: [number, number][] = SHADE.map(([radius, y]): [number, number] => [
  radius - 0.002,
  y,
]).reverse();

const STAND: ModelSpec['parts'] = [
  part('base', cylinder({ top: 0.13, bottom: 0.14, height: BASE_H, bevel: 0.007 }), 'body', {
    transform: { position: [0, BASE_H / 2, 0] },
    contact: true,
  }),
  part('collar', cylinder({ top: 0.024, bottom: 0.032, height: 0.03, bevel: 0.004 }), 'accent', {
    transform: { position: [0, BASE_H + 0.015, 0] },
  }),
  part(
    'footSwitch',
    cylinder({ top: 0.012, height: 0.006, bevel: 0.002, segments: 32 }),
    'accent',
    {
      transform: { position: [0.09, BASE_H + 0.003, 0.05] },
      minLod: 2,
    },
  ),
  part(
    'pole',
    {
      type: 'cylinder',
      height: tall(-POLE_TRIM),
      topRadius: 0.0105,
      bottomRadius: 0.0105,
      bevel: 0.002,
      segments: 24,
    },
    'body',
    { transform: { position: [0, tall(BASE_H - POLE_TRIM / 2, 0.5), 0] } },
  ),
  part('socket', cylinder({ top: 0.02, height: 0.05, bevel: 0.003, segments: 32 }), 'accent', {
    transform: { position: [0, tall(-0.245), 0] },
    minLod: 1,
  }),
  part('bulb', { type: 'sphere', radius: 0.032, segments: 40 }, 'glass', {
    transform: { position: [0, tall(-0.19), 0] },
  }),
];

const SHADE_PARTS: ModelSpec['parts'] = [
  part('shade', { type: 'lathe', profile: SHADE, segments: 64 }, 'fabric', {
    transform: { position: [0, tall(-SHADE_DROP), 0] },
  }),
  part('liner', { type: 'lathe', profile: LINER, segments: 64 }, 'fabric', { parent: 'shade' }),
  part('hemTop', { type: 'torus', radius: 0.1802, tube: 0.0022, segments: 64 }, 'accent', {
    parent: 'shade',
    transform: { position: [0, SHADE_H, 0], rotation: [90, 0, 0] },
    minLod: 1,
  }),
  part('hemBottom', { type: 'torus', radius: 0.2, tube: 0.0022, segments: 64 }, 'accent', {
    parent: 'shade',
    transform: { rotation: [90, 0, 0] },
    minLod: 1,
  }),
  ...[0, 90].map((turn) =>
    box(`spider${String(turn)}`, [0.355, 0.003, 0.003, 0.0006], 'accent', {
      at: [0, SHADE_H - 0.006, 0],
      segments: 3,
      parent: 'shade',
      transform: { rotation: [0, turn, 0] },
      minLod: 2,
    }),
  ),
];

export const FLOOR_LAMP_MODEL: ModelSpec = lightModel({
  id: 'dev.light.floor-lamp',
  title: 'Floor lamp',
  footprint: { width: 0.4, depth: 0.4, height: 1.5622 },
  size: { height: { param: 'height', extra: -0.0378, resizes: true } },
  framing: { tile: VIEW, card: VIEW, hero: { ...VIEW, padding: 0.08 } },
  shots: [glowShot({ focus: 'shade', zoom: 1.6, yaw: 30, pitch: 10 })],
  meta: {
    names: {
      display: 'Floor lamp',
      synonyms: ['floor lamp', 'standing lamp', 'standard lamp', 'drum lamp', 'reading light'],
    },
    sizeClass: 'tall',
    variants: ['black', 'brass', 'white'],
  },
  params: { height: { min: 1.2, max: 1.9, default: HEIGHT, unit: 'm' } },
  materials: {
    body: { finish: 'satin-black' },
    fabric: { color: '#E9E1D3', roughness: 0.9, sheen: 0.5, pattern: 'knit' },
    glass: { finish: 'frosted-glass', opacity: 0.95 },
    accent: { finish: 'brushed-aluminium' },
  },
  ...finishSet(
    {
      black: {},
      brass: { body: { color: '#B08D57', roughness: 0.32 }, accent: { finish: 'satin-black' } },
      white: { body: { finish: 'matte-white' } },
    },
    'black',
  ),
  parts: [...STAND, ...SHADE_PARTS],
  anchors: [
    emitter({ id: 'light', parent: 'bulb', position: [0, 0, 0], radius: 3.2 }),
    { kind: 'mount', id: 'floor', position: [0, 0, 0], mount: 'floor' },
    { kind: 'label', id: 'pin', position: [0, HEIGHT + 0.05, 0] },
    { kind: 'hit', id: 'body', position: [0, HEIGHT / 2, 0], size: [0.4, HEIGHT, 0.4] },
  ],
  channels: [
    ...glowChannels('bulb', [0.05, 1.8]),
    ...glowChannels('shade', [0, 0.75]),
    ...glowChannels('liner', [0, 1.1]),
    ...glowChannels('light', [0.35, 1]),
  ],
});
