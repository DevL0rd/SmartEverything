import type { ModelSpec } from '@smarteverything/domain';
import { finishSet } from '../../helpers/finishes';
import { part } from '../../helpers/geometry';
import { cylinder, emitter, glowShot, lightModel } from '../light-fixtures/kit';
import { lampChannels } from './kit';

const DIAMETER = 0.06;
const HEIGHT = 0.112;
const CENTRE = 0.079;
const VIEW = { yaw: 30, pitch: 14, fov: 28, padding: 0.1, focus: 'dome' } as const;

const DOME: [number, number][] = [
  [0.0236, 0.0505],
  [0.0262, 0.0545],
  [0.0284, 0.0605],
  [0.0297, 0.0675],
  [0.03, 0.075],
  [0.0298, 0.0825],
  [0.0288, 0.0895],
  [0.0268, 0.096],
  [0.0236, 0.1018],
  [0.0192, 0.1065],
  [0.0136, 0.1098],
  [0.0072, 0.1116],
  [0, HEIGHT],
];

const NECK: [number, number][] = [
  [0.0126, 0.0262],
  [0.0136, 0.0272],
  [0.0146, 0.0305],
  [0.0166, 0.0355],
  [0.0194, 0.0415],
  [0.0222, 0.0465],
  [0.0242, 0.0502],
  [0.0246, 0.0516],
  [0.0232, 0.0524],
  [0, 0.0524],
];

const THREAD: [number, number][] = [
  [0.0092, 0.0052],
  [0.0124, 0.0056],
  [0.0134, 0.0075],
  [0.0123, 0.0098],
  [0.0134, 0.0121],
  [0.0123, 0.0144],
  [0.0134, 0.0167],
  [0.0123, 0.019],
  [0.0134, 0.0213],
  [0.0126, 0.0238],
  [0.013, 0.0262],
];

const INSULATOR: [number, number][] = [
  [0.0036, 0.0014],
  [0.0068, 0.0018],
  [0.0092, 0.0034],
  [0.0094, 0.0056],
];

const PARTS: ModelSpec['parts'] = [
  part(
    'tip',
    cylinder({ top: 0.0036, bottom: 0.0032, height: 0.0016, bevel: 0.0005, segments: 24 }),
    'accent',
    { transform: { position: [0, 0.0008, 0] }, contact: true },
  ),
  part('insulator', { type: 'lathe', profile: INSULATOR, segments: 32 }, 'insulator'),
  part('thread', { type: 'lathe', profile: THREAD, segments: 48 }, 'accent'),
  part('neck', { type: 'lathe', profile: NECK, segments: 64 }, 'body'),
  part('dome', { type: 'lathe', profile: DOME, segments: 72 }, 'glass'),
  part('seam', { type: 'torus', radius: 0.0239, tube: 0.0006, segments: 72 }, 'insulator', {
    transform: { position: [0, 0.0512, 0], rotation: [90, 0, 0] },
    minLod: 1,
  }),
  part('ring', { type: 'torus', radius: 0.0131, tube: 0.0005, segments: 48 }, 'accent', {
    transform: { position: [0, 0.0265, 0], rotation: [90, 0, 0] },
    minLod: 2,
  }),
];

export const BULB_A60_MODEL: ModelSpec = lightModel({
  id: 'dev.light.bulb-a60',
  title: 'Smart bulb',
  footprint: { width: DIAMETER, depth: DIAMETER, height: HEIGHT },
  framing: { tile: { ...VIEW, padding: 0.06 }, card: VIEW, hero: { ...VIEW, padding: 0.14 } },
  shots: [glowShot({ focus: 'dome', zoom: 1.2, yaw: 30, pitch: 10 })],
  meta: {
    names: {
      display: 'Smart bulb',
      synonyms: [
        'light bulb',
        'smart bulb',
        'LED bulb',
        'A60 bulb',
        'E27 bulb',
        'colour bulb',
        'lamp',
      ],
    },
    sizeClass: 'small',
    variants: ['white', 'silver'],
  },
  materials: {
    body: { finish: 'matte-white', roughness: 0.55 },
    glass: { finish: 'frosted-glass', opacity: 0.94 },
    insulator: { finish: 'satin-black' },
    accent: { finish: 'brushed-aluminium' },
  },
  ...finishSet(
    {
      white: {},
      silver: { body: { finish: 'brushed-aluminium' } },
    },
    'white',
  ),
  parts: PARTS,
  anchors: [
    emitter({ id: 'light', parent: 'dome', position: [0, CENTRE, 0], radius: 3, intensity: 0.9 }),
    { kind: 'mount', id: 'socket', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, HEIGHT + 0.02, 0] },
    { kind: 'hit', id: 'body', position: [0, HEIGHT / 2, 0], size: [DIAMETER, HEIGHT, DIAMETER] },
  ],
  channels: [...lampChannels('dome', [0.05, 1.6]), ...lampChannels('light', [0.3, 1])],
});
