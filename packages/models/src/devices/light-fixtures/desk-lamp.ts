import type { ModelSpec } from '@smarteverything/domain';
import { finishSet } from '../../helpers/finishes';
import { part } from '../../helpers/geometry';
import { cylinder, emitter, glowChannels, glowShot, lightModel, spillChannels } from './kit';

type Point = readonly [number, number];

const PIVOT: Point = [0, 0.032];
const ELBOW: Point = [0.07, 0.31];
const HEAD: Point = [0.262, 0.352];
const HEAD_LEAN: readonly [number, number, number] = [-24, 0, 14];
const VIEW = { yaw: 30, pitch: 18, fov: 28, padding: 0.06 } as const;

const SHADE: [number, number][] = [
  [0.068, -0.094],
  [0.0665, -0.086],
  [0.06, -0.064],
  [0.047, -0.038],
  [0.032, -0.016],
  [0.02, -0.004],
  [0.016, 0],
];

const LINER: [number, number][] = SHADE.map(([radius, y]): [number, number] => [
  Math.max(0.012, radius - 0.0025),
  y + 0.0015,
]).reverse();

function rods(name: string, [from, to]: readonly [Point, Point]): ModelSpec['parts'] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  const tilt = (-Math.atan2(dx, dy) * 180) / Math.PI;
  return [-0.0075, 0.0075].map((z, index) =>
    part(
      `${name}${String(index + 1)}`,
      cylinder({ top: 0.0042, height: length, bevel: 0.0008, segments: 16 }),
      'body',
      {
        transform: {
          position: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, z],
          rotation: [0, 0, tilt],
        },
      },
    ),
  );
}

function joint(id: string, [x, y]: Point, radius: number): ModelSpec['parts'][number] {
  return part(id, cylinder({ top: radius, height: 0.026, bevel: 0.002, segments: 40 }), 'accent', {
    transform: { position: [x, y, 0], rotation: [90, 0, 0] },
  });
}

const BASE: ModelSpec['parts'] = [
  part('base', cylinder({ top: 0.068, bottom: 0.075, height: 0.02, bevel: 0.005 }), 'body', {
    transform: { position: [0, 0.01, 0] },
    contact: true,
  }),
  part('baseRing', { type: 'torus', radius: 0.0702, tube: 0.0012, segments: 72 }, 'accent', {
    transform: { position: [0, 0.0172, 0], rotation: [90, 0, 0] },
    minLod: 1,
  }),
  part('switch', cylinder({ top: 0.008, height: 0.004, bevel: 0.0012, segments: 32 }), 'accent', {
    transform: { position: [0.04, 0.0215, 0.03] },
    minLod: 1,
  }),
  part('post', cylinder({ top: 0.011, bottom: 0.014, height: 0.02, bevel: 0.002 }), 'body', {
    transform: { position: [0, 0.028, 0] },
  }),
];

const ARMS: ModelSpec['parts'] = [
  joint('pivot', PIVOT, 0.011),
  ...rods('lower', [PIVOT, ELBOW]),
  joint('elbow', ELBOW, 0.012),
  ...rods('upper', [ELBOW, HEAD]),
  joint('knuckle', HEAD, 0.01),
];

const HEAD_PARTS: ModelSpec['parts'] = [
  part('shade', { type: 'lathe', profile: SHADE, segments: 64 }, 'body', {
    transform: { position: [HEAD[0] + 0.012, HEAD[1] - 0.004, 0], rotation: [...HEAD_LEAN] },
  }),
  part('liner', { type: 'lathe', profile: LINER, segments: 64 }, 'trim', { parent: 'shade' }),
  part('lens', cylinder({ top: 0.05, height: 0.004, bevel: 0.0012 }), 'glass', {
    parent: 'shade',
    transform: { position: [0, -0.07, 0] },
  }),
  part('pool', { type: 'glow', width: 0.3, height: 0.22, segments: 32 }, 'glass', {
    transform: { position: [0.27, 0.0015, 0.035], rotation: [-90, 0, 0] },
    minLod: 1,
  }),
];

export const DESK_LAMP_MODEL: ModelSpec = lightModel({
  id: 'dev.light.desk-lamp',
  title: 'Desk lamp',
  footprint: { width: 0.42, depth: 0.16, height: 0.42 },
  framing: {
    tile: VIEW,
    card: VIEW,
    hero: { ...VIEW, padding: 0.1 },
  },
  shots: [glowShot({ focus: 'shade', zoom: 1.15, yaw: 34, pitch: 22 })],
  meta: {
    names: {
      display: 'Desk lamp',
      synonyms: ['desk lamp', 'table lamp', 'task lamp', 'reading lamp', 'architect lamp'],
    },
    sizeClass: 'small',
    variants: ['black', 'white', 'graphite'],
  },
  materials: {
    body: { finish: 'satin-black' },
    trim: { finish: 'warm-white' },
    glass: { finish: 'frosted-glass', opacity: 0.9 },
    accent: { finish: 'brushed-aluminium' },
  },
  ...finishSet(
    {
      black: {},
      white: { body: { finish: 'matte-white' } },
      graphite: { body: { finish: 'graphite' } },
    },
    'black',
  ),
  parts: [...BASE, ...ARMS, ...HEAD_PARTS],
  anchors: [
    emitter({ id: 'light', parent: 'lens', position: [0, -0.01, 0], radius: 1.4, cone: 90 }),
    { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0.13, 0.44, 0] },
    { kind: 'hit', id: 'body', position: [0.13, 0.21, 0], size: [0.42, 0.42, 0.16] },
  ],
  channels: [
    ...glowChannels('lens', [0.05, 1.8]),
    ...glowChannels('liner', [0, 0.7]),
    ...spillChannels('pool', [0.2, 0.75]),
    ...glowChannels('light', [0.35, 1]),
  ],
});
