import type { ModelSpec } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { box, part } from '../../helpers/geometry';
import {
  ACCENT,
  PRIMARY,
  anchorsOf,
  ball,
  cells,
  house,
  leaf,
  puck,
  shot,
  spin,
  status,
  whenAll,
} from '../energy/kit';

const WIDTH = 0.5;
const DEPTH = 0.55;
const HEIGHT = 0.66;
const GLOBE_R = 0.235;
const GLOBE_Y = 0.4;
const OPEN_DEG = 38;
const RIM_R = Math.sin((OPEN_DEG * Math.PI) / 180) * GLOBE_R;
const RIM_Z = Math.cos((OPEN_DEG * Math.PI) / 180) * GLOBE_R;
const FRONT = DEPTH / 2 + 0.002;

const LINER_R = GLOBE_R - 0.006;
const LINER = Array.from({ length: 13 }, (_, index): [number, number] => {
  const theta = ((OPEN_DEG + ((180 - OPEN_DEG) * index) / 12) * Math.PI) / 180;
  return [Math.max(0.001, Math.sin(theta) * LINER_R), Math.cos(theta) * LINER_R];
});
const SEAMS = [0, 180].map((phiStart, index) =>
  part(
    `seam${String(index)}`,
    {
      type: 'sphere',
      radius: GLOBE_R + 0.0012,
      phiStart,
      phiLength: 3,
      thetaStart: OPEN_DEG + 4,
      thetaLength: 176 - OPEN_DEG,
      segments: 48,
    },
    'base',
    { parent: 'drum', transform: { rotation: [90, 0, 0] } },
  ),
);

const CLEANING = whenAll(leaf('speed', 'gt', 0));

const WASTE = cells('waste', [5, 'fill'], [0.024, 0.014, 0.0016, 0.0006], (index) => [
  -0.12 + index * 0.03,
  0.085,
  FRONT + 0.0008,
]);

export const LITTER_BOX_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.litter-box',
  version: '1.0.0',
  title: 'Litter box',
  category: 'pet',
  family: 'generic',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  framing: house('drum', 30, 16),
  shots: [
    shot('cleaning', CLEANING, 'drum', { zoom: 1.25, yaw: 24, pitch: 14, loopS: 10, stillAt: 0 }),
  ],
  meta: {
    names: {
      display: 'Litter box',
      synonyms: [
        'cat litter box',
        'self cleaning litter box',
        'automatic litter box',
        'cat toilet',
      ],
    },
    sizeClass: 'medium',
    variants: ['white', 'graphite'],
  },
  materials: {
    shell: { finish: 'matte-white' },
    base: { finish: 'graphite' },
    trim: { finish: 'brushed-aluminium' },
    accent: ACCENT,
  },
  finishes: {
    white: {},
    graphite: { shell: { finish: 'graphite' }, base: { finish: 'satin-black' } },
  },
  defaultFinish: 'white',
  parts: [
    box('base', [WIDTH, 0.19, DEPTH, 0.05], 'base', { at: [0, 0.095, 0], contact: true }),
    puck('seat', [0.225, 0.04, 0.012], 'trim', { at: [0, 0.205, 0], minLod: 1 }),
    box('drawer', [0.24, 0.07, 0.004, 0.02], 'trim', { at: [0, 0.07, FRONT - 0.0008], minLod: 1 }),
    ...WASTE.parts,
    box('led', [0.014, 0.006, 0.0016, 0.0026], 'accent', {
      at: [0, 0.13, FRONT + 0.0006],
      minLod: 1,
    }),
    ball('drum', 0.012, 'shell', { at: [0, GLOBE_Y, 0], segments: 8 }),
    part(
      'globe',
      {
        type: 'sphere',
        radius: GLOBE_R,
        thetaStart: OPEN_DEG,
        thetaLength: 180 - OPEN_DEG,
        segments: 48,
      },
      'shell',
      { parent: 'drum', transform: { rotation: [90, 0, 0] } },
    ),
    part('liner', { type: 'lathe', profile: LINER, segments: 48 }, 'shell', {
      parent: 'drum',
      transform: { rotation: [90, 0, 0] },
    }),
    ...SEAMS,
    part('rim', { type: 'torus', radius: RIM_R, tube: 0.0075, segments: 48 }, 'accent', {
      parent: 'drum',
      transform: { position: [0, 0, RIM_Z] },
      minLod: 1,
    }),
  ],
  anchors: [
    ...anchorsOf([WIDTH, HEIGHT, DEPTH], 'floor'),
    {
      kind: 'emitter',
      id: 'rimLight',
      position: [0, GLOBE_Y, RIM_Z + 0.02],
      color: PRIMARY,
      intensity: 0.3,
      radius: 0.25,
    },
  ],
  channels: [
    spin('drumTurn', ['drum', 'z'], ['speed', [0, 1], [0, 0.1]]),
    ...status('rim'),
    ...status('led'),
    ...WASTE.channels,
    ...emitterChannels('rimLight'),
  ],
  states: {
    off: { power: false, online: true, speed: 0, fill: 0.2 },
    ready: { power: true, online: true, speed: 0, fill: 0.2 },
    cleaning: { power: true, online: true, speed: 0.7, fill: 0.4 },
    full: { power: true, online: true, speed: 0, fill: 1, batteryLow: true },
    fault: { power: true, online: true, fault: true, fill: 0.5 },
    offline: { online: false },
  },
};
