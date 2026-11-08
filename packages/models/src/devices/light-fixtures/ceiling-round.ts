import type { ModelSpec } from '@smarteverything/domain';
import { finishSet } from '../../helpers/finishes';
import { part } from '../../helpers/geometry';
import { cylinder, emitter, glowChannels, glowShot, lightModel } from './kit';

const DIAMETER = 0.4;
const HEIGHT = 0.085;
const PLATE_H = 0.05;
const PLATE_Y = HEIGHT - PLATE_H / 2;
const SPAN = { param: 'diameter', scale: 1 / DIAMETER } as const;
const VIEW = { yaw: 30, pitch: -24, fov: 28, padding: 0.1, focus: 'diffuser' } as const;

const DIFFUSER: [number, number][] = [
  [0, -0.034],
  [0.06, -0.0328],
  [0.12, -0.0296],
  [0.16, -0.0248],
  [0.184, -0.0182],
  [0.195, -0.0102],
  [0.198, -0.003],
  [0.198, 0],
];

const PARTS: ModelSpec['parts'] = [
  part('plate', cylinder({ top: 0.2, bottom: 0.197, height: PLATE_H, bevel: 0.008 }), 'body', {
    transform: { position: [0, PLATE_Y, 0], scale: [SPAN, 1, SPAN] },
  }),
  part('canopy', cylinder({ top: 0.15, bottom: 0.165, height: 0.008, bevel: 0.002 }), 'body', {
    parent: 'plate',
    transform: { position: [0, PLATE_H / 2 - 0.002, 0] },
    minLod: 1,
  }),
  part('diffuser', { type: 'lathe', profile: DIFFUSER, segments: 96 }, 'glass', {
    parent: 'plate',
    transform: { position: [0, -PLATE_H / 2 + 0.001, 0] },
  }),
  part('rim', { type: 'torus', radius: 0.1985, tube: 0.0032, segments: 96 }, 'accent', {
    parent: 'plate',
    transform: { position: [0, -PLATE_H / 2 + 0.001, 0], rotation: [90, 0, 0] },
  }),
  part('seam', { type: 'torus', radius: 0.2, tube: 0.0011, segments: 96 }, 'accent', {
    parent: 'plate',
    transform: { position: [0, PLATE_H / 2 - 0.012, 0], rotation: [90, 0, 0] },
    minLod: 2,
  }),
];

export const CEILING_ROUND_MODEL: ModelSpec = lightModel({
  id: 'dev.light.ceiling-round',
  title: 'Round ceiling light',
  footprint: { width: 0.4034, depth: 0.4034, height: HEIGHT },
  size: {
    width: { param: 'diameter', scale: 1.0085, extra: 0, resizes: true },
    depth: { param: 'diameter', scale: 1.0085, extra: 0, resizes: true },
  },
  framing: { tile: VIEW, card: VIEW, hero: { ...VIEW, pitch: -20, padding: 0.12 } },
  shots: [glowShot({ focus: 'diffuser', zoom: 1.15, yaw: 30, pitch: -28 })],
  meta: {
    names: {
      display: 'Round ceiling light',
      synonyms: ['ceiling light', 'flush mount', 'ceiling lamp', 'LED ceiling panel', 'plafond'],
    },
    sizeClass: 'medium',
    variants: ['white', 'black', 'oak'],
  },
  params: { diameter: { min: 0.25, max: 0.8, default: DIAMETER, unit: 'm' } },
  materials: {
    body: { finish: 'matte-white' },
    glass: { finish: 'frosted-glass', opacity: 0.92 },
    accent: { finish: 'brushed-aluminium' },
  },
  ...finishSet(
    {
      white: {},
      black: { body: { finish: 'satin-black' } },
      oak: { body: { finish: 'oak' } },
    },
    'white',
  ),
  parts: PARTS,
  anchors: [
    emitter({ id: 'light', parent: 'plate', position: [0, -0.06, 0], radius: 3.5, cone: 150 }),
    { kind: 'mount', id: 'ceiling', position: [0, HEIGHT, 0], mount: 'ceiling' },
    { kind: 'label', id: 'pin', position: [0, -0.02, 0] },
    { kind: 'hit', id: 'body', position: [0, HEIGHT / 2, 0], size: [DIAMETER, HEIGHT, DIAMETER] },
  ],
  channels: [...glowChannels('diffuser', [0.04, 1.5]), ...glowChannels('light', [0.35, 1])],
});
