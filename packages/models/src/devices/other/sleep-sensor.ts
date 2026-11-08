import type { ModelSpec } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { box, part } from '../../helpers/geometry';
import {
  ACCENT,
  PRIMARY,
  anchorsOf,
  house,
  leaf,
  look,
  pipe,
  pulse,
  shot,
  status,
  whenAll,
} from '../energy/kit';

const WIDTH = 0.64;
const DEPTH = 0.22;
const HEIGHT = 0.02;
const PAD_H = 0.012;
const SLEEP = '#8EAEFF';

const ASLEEP = whenAll(leaf('presence', 'eq', true));

export const SLEEP_SENSOR_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.bed.sleep-sensor',
  version: '1.0.0',
  title: 'Bed sensor',
  category: 'sensor',
  family: 'sensor',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  framing: house('pad', 22, 38),
  shots: [shot('asleep', ASLEEP, 'pad', { zoom: 1.2, yaw: 18, pitch: 40, loopS: 4, stillAt: 2 })],
  meta: {
    names: {
      display: 'Bed sensor',
      synonyms: [
        'sleep sensor',
        'sleep tracker',
        'under mattress sensor',
        'bed presence sensor',
        'sleep pad',
      ],
    },
    sizeClass: 'small',
    variants: ['grey', 'sand'],
  },
  materials: {
    pad: { finish: 'knit-fabric', pattern: 'knit' },
    body: { finish: 'matte-white' },
    trim: { finish: 'graphite' },
    accent: ACCENT,
  },
  finishes: {
    grey: {},
    sand: { pad: { color: '#D6CBB8', roughness: 0.9 } },
  },
  defaultFinish: 'grey',
  parts: [
    box('pad', [0.5, PAD_H, DEPTH, 0.0055], 'pad', { at: [-0.07, PAD_H / 2, 0], contact: true }),
    box('edge', [0.5, 0.0022, DEPTH * 0.96, 0.001], 'trim', { at: [-0.07, 0.0011, 0], minLod: 1 }),
    box('module', [0.1, HEIGHT, 0.12, 0.009], 'body', { at: [0.27, HEIGHT / 2, 0] }),
    box('led', [0.016, 0.0016, 0.006, 0.0008], 'accent', {
      at: [0.27, HEIGHT + 0.0004, 0.038],
      minLod: 1,
    }),
    part('breath', { type: 'glow', width: 0.42, height: 0.16, segments: 24 }, 'accent', {
      transform: { position: [-0.07, PAD_H + 0.001, 0], rotation: [-90, 0, 0] },
      minLod: 1,
    }),
    box('zoneLeft', [0.1, 0.0016, 0.012, 0.0006], 'accent', {
      at: [-0.2, PAD_H + 0.0006, 0],
      minLod: 1,
    }),
    box('zoneRight', [0.1, 0.0016, 0.012, 0.0006], 'accent', {
      at: [0.06, PAD_H + 0.0006, 0],
      minLod: 1,
    }),
    pipe(
      'cable',
      [
        [0.32, 0.008, 0.02],
        [0.36, 0.004, 0.04],
        [0.4, 0.004, 0.08],
      ],
      [0.0034, 'trim'],
      { minLod: 1 },
    ),
  ],
  anchors: [
    ...anchorsOf([WIDTH, HEIGHT, DEPTH], 'floor'),
    {
      kind: 'emitter',
      id: 'breathLight',
      position: [-0.07, 0.03, 0],
      color: SLEEP,
      intensity: 0.35,
      radius: 0.3,
    },
  ],
  channels: [
    look('breathTint', ['breath', 'colour'], ['presence', { true: SLEEP }]),
    look('breathShow', ['breath', 'opacity'], ['presence', { true: 0.7, false: 0 }], 600),
    pulse('breathPulse', ['breath', 'emissive'], ['presence', { true: 1.2 }], [4, 0.8]),
    look('breathOffline', ['breath', 'opacity'], ['online', { false: 0 }], 450),
    look('zoneLeftShow', ['zoneLeft', 'opacity'], ['presence', { true: 1, false: 0 }]),
    look('zoneRightShow', ['zoneRight', 'opacity'], ['presence', { true: 1, false: 0 }]),
    look('zoneLeftTint', ['zoneLeft', 'colour'], ['presence', { true: PRIMARY }]),
    look('zoneRightTint', ['zoneRight', 'colour'], ['presence', { true: PRIMARY }]),
    look('zoneLeftOffline', ['zoneLeft', 'opacity'], ['online', { false: 0 }], 450),
    look('zoneRightOffline', ['zoneRight', 'opacity'], ['online', { false: 0 }], 450),
    ...status('led'),
    ...emitterChannels('breathLight', ['presence', { true: 1, false: 0 }]),
  ],
  states: {
    empty: { power: true, online: true, presence: false },
    asleep: { power: true, online: true, presence: true },
    lowBattery: { power: true, online: true, presence: false, batteryLow: true },
    fault: { power: true, online: true, fault: true, presence: false },
    offline: { online: false },
  },
};
