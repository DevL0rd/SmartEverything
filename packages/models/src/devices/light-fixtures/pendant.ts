import type { ModelSpec } from '@smarteverything/domain';
import { finishSet } from '../../helpers/finishes';
import { part } from '../../helpers/geometry';
import { cylinder, emitter, glowChannels, glowShot, lightModel } from './kit';

const RIM = 0.16;
const SHADE_TOP = 0.2;
const DROP = 0.3;
const CANOPY_H = 0.025;
const HEIGHT = SHADE_TOP + DROP + CANOPY_H;
const VIEW = { yaw: 30, pitch: -10, fov: 28, padding: 0.08, focus: 'shade' } as const;

const SHADE: [number, number][] = [
  [RIM, 0],
  [0.1585, 0.012],
  [0.151, 0.04],
  [0.132, 0.08],
  [0.102, 0.12],
  [0.064, 0.154],
  [0.034, 0.171],
  [0.023, 0.178],
];

const LINER: [number, number][] = SHADE.map(([radius, y]): [number, number] => [
  Math.max(0.02, radius - 0.003),
  y + 0.002,
]).reverse();

const PARTS: ModelSpec['parts'] = [
  part('shade', { type: 'lathe', profile: SHADE, segments: 72 }, 'body'),
  part('liner', { type: 'lathe', profile: LINER, segments: 72 }, 'trim'),
  part('lip', { type: 'torus', radius: RIM - 0.0005, tube: 0.0032, segments: 96 }, 'accent', {
    transform: { rotation: [90, 0, 0] },
  }),
  part('cap', cylinder({ top: 0.02, bottom: 0.026, height: 0.03, bevel: 0.003 }), 'accent', {
    transform: { position: [0, 0.188, 0] },
  }),
  part('socket', cylinder({ top: 0.016, height: 0.04, bevel: 0.002, segments: 48 }), 'body', {
    transform: { position: [0, 0.135, 0] },
    minLod: 1,
  }),
  part('bulb', { type: 'sphere', radius: 0.034, segments: 40 }, 'glass', {
    transform: { position: [0, 0.085, 0] },
  }),
  part('cord', cylinder({ top: 0.0028, height: DROP, bevel: 0.0004, segments: 12 }), 'body', {
    transform: {
      position: [0, { param: 'drop', scale: 0.5, offset: SHADE_TOP }, 0],
      scale: [1, { param: 'drop', scale: 1 / DROP }, 1],
    },
  }),
  part('canopy', cylinder({ top: 0.055, bottom: 0.06, height: CANOPY_H, bevel: 0.005 }), 'body', {
    transform: { position: [0, { param: 'drop', offset: SHADE_TOP + CANOPY_H / 2 }, 0] },
  }),
  part('collar', cylinder({ top: 0.008, height: 0.012, bevel: 0.0015, segments: 32 }), 'accent', {
    transform: { position: [0, { param: 'drop', offset: SHADE_TOP - 0.006 }, 0] },
    minLod: 1,
  }),
];

export const PENDANT_MODEL: ModelSpec = lightModel({
  id: 'dev.light.pendant',
  title: 'Pendant light',
  footprint: { width: RIM * 2, depth: RIM * 2, height: 0.5282 },
  size: { height: { param: 'drop', extra: 0.2282, resizes: true } },
  framing: { tile: VIEW, card: VIEW, hero: { ...VIEW, padding: 0.1 } },
  shots: [glowShot({ focus: 'bulb', zoom: 1.3, yaw: 30, pitch: -18 })],
  meta: {
    names: {
      display: 'Pendant light',
      synonyms: ['pendant', 'hanging light', 'pendant lamp', 'dome pendant', 'suspended light'],
    },
    sizeClass: 'medium',
    variants: ['black', 'white', 'sage'],
  },
  params: { drop: { min: 0.2, max: 2, default: DROP, unit: 'm' } },
  materials: {
    body: { finish: 'satin-black' },
    trim: { finish: 'warm-white' },
    glass: { finish: 'frosted-glass', opacity: 0.95 },
    accent: { color: '#B08D57', roughness: 0.32, metalness: 0.9 },
  },
  ...finishSet(
    {
      black: {},
      white: { body: { finish: 'matte-white' } },
      sage: { body: { color: '#6F8574', roughness: 0.5 } },
    },
    'black',
  ),
  parts: PARTS,
  anchors: [
    emitter({ id: 'light', parent: 'bulb', position: [0, 0, 0], radius: 3, cone: 120 }),
    { kind: 'mount', id: 'ceiling', position: [0, HEIGHT, 0], mount: 'ceiling' },
    { kind: 'label', id: 'pin', position: [0, -0.03, 0] },
    { kind: 'hit', id: 'body', position: [0, 0.1, 0], size: [RIM * 2, 0.2, RIM * 2] },
  ],
  channels: [
    ...glowChannels('bulb', [0.05, 1.8]),
    ...glowChannels('liner', [0, 0.55]),
    ...glowChannels('light', [0.35, 1]),
  ],
});
