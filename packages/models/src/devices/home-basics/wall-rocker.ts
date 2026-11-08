import type { ModelSpec, ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
import { box } from '../../helpers/geometry';
import { enumChannel } from '@smarteverything/domain';
import { anchorsOf, house, leaf, shot, whenAll } from '../energy/kit';
import { OK, hinge, powerLed } from './kit';

const PLATE = 0.086;
const DEPTH = 0.01;
const FRAME = 0.073;
const ROCKER_H = 0.064;
const GAP = 0.002;
const FACE = DEPTH / 2 + 0.0012 + 0.003;
const TILT = { type: 'pose', easeMs: 120 } as const;

type Binding = NonNullable<ModelSpecPart['visible']>;

interface Gang {
  readonly id: string;
  readonly width: number;
  readonly x: number;
  readonly parent: string;
  readonly visible: Binding;
}

function gangSet(count: number, parent: string, visible: Binding): Gang[] {
  const width = (FRAME - 0.004 - GAP * (count - 1)) / count;
  return Array.from({ length: count }, (_, index) => ({
    id: `rocker${String(count)}${String(index)}`,
    width,
    x: (index - (count - 1) / 2) * (width + GAP),
    parent,
    visible,
  }));
}

const GANGS: readonly Gang[] = [
  ...gangSet(1, 'plate', { param: 'gangs', scale: -1, offset: 1.5 }),
  ...gangSet(2, 'pair', { param: 'gangs', scale: -1, offset: 2.5 }),
  ...gangSet(3, 'plate', { param: 'gangs', offset: -2.5 }),
];

function rockerParts({ id, width, x, parent, visible }: Gang): ModelSpecPart[] {
  return [
    box(id, [width, ROCKER_H, 0.006, 0.0028], 'rocker', {
      at: [x, 0, FACE],
      parent,
      visible,
      segments: 4,
    }),
    box(`${id}Well`, [Math.min(0.016, width * 0.6), 0.0048, 0.0008, 0.0014], 'trim', {
      at: [0, -ROCKER_H / 2 + 0.0075, 0.003],
      parent: id,
      segments: 3,
    }),
    box(`${id}Led`, [Math.min(0.013, width * 0.5), 0.0032, 0.001, 0.0012], 'accent', {
      at: [0, -ROCKER_H / 2 + 0.0075, 0.0034],
      parent: id,
      segments: 3,
    }),
    box(`${id}Mark`, [0.0012, 0.007, 0.0004, 0.0002], 'trim', {
      at: [0, ROCKER_H / 2 - 0.012, 0.0031],
      parent: id,
      minLod: 2,
      segments: 3,
    }),
  ];
}

function rockerChannels({ id }: Gang): ModelSpecChannel[] {
  return [
    {
      ...enumChannel(`${id}Tilt`, [id, 'rotate'], ['power', { true: -4, false: 4 }], TILT),
      axis: 'x',
    },
    ...powerLed(`${id}Led`, 1.8),
  ];
}

export const WALL_ROCKER_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.switch.wall-rocker',
  version: '1.0.0',
  title: 'Wall switch',
  category: 'energy',
  family: 'switch',
  footprint: { width: PLATE, depth: DEPTH, height: PLATE },
  framing: house('plate', 20, 10),
  shots: [
    shot('switched', whenAll(leaf('power', 'eq', true)), 'plate', {
      zoom: 1.3,
      yaw: 16,
      pitch: 8,
      loopS: 1,
    }),
  ],
  meta: {
    names: {
      display: 'Wall switch',
      synonyms: ['light switch', 'wall switch', 'rocker switch', 'smart switch', 'gang switch'],
    },
    sizeClass: 'small',
    variants: ['white', 'black'],
  },
  params: { gangs: { min: 1, max: 3, default: 2, unit: 'count' } },
  materials: {
    body: { finish: 'matte-white', roughness: 0.6 },
    rocker: { finish: 'matte-white', roughness: 0.32, clearcoat: 0.6 },
    trim: { finish: 'graphite' },
    accent: { color: OK, roughness: 0.3, opacity: 0 },
  },
  finishes: {
    white: {},
    black: {
      body: { finish: 'satin-black' },
      rocker: { finish: 'satin-black', clearcoat: 0.8 },
      trim: { finish: 'brushed-aluminium' },
    },
  },
  defaultFinish: 'white',
  parts: [
    box('plate', [PLATE, PLATE, DEPTH, 0.007], 'body', {
      at: [0, PLATE / 2, DEPTH / 2],
      contact: true,
      segments: 4,
    }),
    box('frame', [FRAME, FRAME, 0.0024, 0.004], 'trim', {
      at: [0, 0, DEPTH / 2],
      parent: 'plate',
      segments: 3,
    }),
    hinge('pair', { at: [0, 0, 0], parent: 'plate', visible: { param: 'gangs', offset: -1.5 } }),
    box('chamfer', [PLATE - 0.004, PLATE - 0.004, 0.0006, 0.006], 'body', {
      at: [0, 0, -DEPTH / 2 + 0.0002],
      parent: 'plate',
      minLod: 2,
      segments: 3,
    }),
    ...GANGS.flatMap(rockerParts),
  ],
  anchors: anchorsOf([PLATE, PLATE, DEPTH], 'wall'),
  channels: GANGS.flatMap(rockerChannels),
  states: {
    on: { power: true, online: true },
    off: { power: false, online: true },
    offline: { online: false },
  },
};
