import type { ModelSpec } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { box, lathe, part } from '../../helpers/geometry';
import { ACCENT, WARNING, WATER, house, look, puck, ramp, shot } from '../energy/kit';
import { floorAnchors, pivot, powerOff, rod } from '../climate/kit';
import { RUNNING, lit, sleepDim } from './kit';

const RADIUS = 0.104;
const BASE_H = 0.085;
const TANK_R = 0.097;
const TANK_H = 0.17;
const TANK_Y = BASE_H + TANK_H / 2;
const CAP_Y = BASE_H + TANK_H;
const HEIGHT = 0.31;
const NOZZLE_Y = HEIGHT - 0.012;

export const GENERIC_HUMIDIFIER_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.humidifier.generic',
  version: '1.0.0',
  title: 'Humidifier',
  category: 'climate',
  family: 'humidifier',
  footprint: { width: RADIUS * 2, depth: RADIUS * 2, height: HEIGHT },
  framing: house('tank', 28, 16),
  shots: [
    shot('misting', RUNNING, 'tank', { zoom: 1.15, yaw: 20, pitch: 14, loopS: 4, stillAt: 2 }),
  ],
  meta: {
    names: {
      display: 'Humidifier',
      synonyms: [
        'air humidifier',
        'mist humidifier',
        'ultrasonic humidifier',
        'cool mist humidifier',
        'tabletop humidifier',
      ],
    },
    sizeClass: 'small',
    variants: ['white', 'graphite'],
  },
  materials: {
    body: { finish: 'matte-white', clearcoat: 0.4 },
    trim: { finish: 'graphite' },
    glass: { finish: 'clear-glass', opacity: 0.28 },
    accent: { ...ACCENT, color: WATER },
  },
  finishes: {
    white: {},
    graphite: { body: { finish: 'graphite', clearcoat: 0.5 }, trim: { finish: 'satin-black' } },
  },
  defaultFinish: 'white',
  parts: [
    part(
      'base',
      lathe({
        profile: [
          [0.001, 0],
          [0.092, 0],
          [0.101, 0.008],
          [RADIUS, 0.04],
          [0.102, 0.075],
          [0.099, BASE_H],
          [0.001, BASE_H],
        ],
        segments: 56,
      }),
      'body',
      { contact: true },
    ),
    part('glowRing', { type: 'torus', radius: 0.1, tube: 0.0026, segments: 64 }, 'accent', {
      transform: { position: [0, BASE_H - 0.004, 0], rotation: [90, 0, 0] },
    }),
    puck('dial', [0.02, 0.008, 0.003], 'trim', {
      at: [0, 0.04, RADIUS + 0.002],
      transform: { rotation: [90, 0, 0] },
      minLod: 1,
    }),
    box('dialMark', [0.003, 0.0012, 0.01, 0.0005], 'body', {
      at: [0, 0.0045, -0.006],
      parent: 'dial',
      minLod: 2,
      segments: 3,
    }),
    pivot('waterline', { at: [0, BASE_H + 0.004, 0] }),
    part(
      'water',
      {
        type: 'cylinder',
        height: TANK_H - 0.012,
        topRadius: TANK_R - 0.008,
        bottomRadius: TANK_R - 0.008,
        segments: 48,
      },
      'accent',
      { parent: 'waterline', transform: { position: [0, (TANK_H - 0.012) / 2, 0] } },
    ),
    rod('duct', [0.012, TANK_H], 'trim', { at: [0, TANK_Y, 0], segments: 20, minLod: 1 }),
    puck('tank', [TANK_R, TANK_H, 0.006], 'glass', { at: [0, TANK_Y, 0], segments: 56 }),
    part(
      'cap',
      lathe({
        profile: [
          [0.001, CAP_Y],
          [0.099, CAP_Y],
          [0.1, CAP_Y + 0.012],
          [0.09, CAP_Y + 0.036],
          [0.06, HEIGHT - 0.014],
          [0.03, HEIGHT - 0.012],
          [0.001, HEIGHT - 0.012],
        ],
        segments: 56,
      }),
      'body',
    ),
    puck('nozzle', [0.026, 0.014, 0.004], 'trim', { at: [0, NOZZLE_Y, 0] }),
    puck('nozzleBore', [0.012, 0.004, 0.0015], 'body', {
      at: [0, NOZZLE_Y + 0.006, 0],
      minLod: 1,
    }),
    box('led', [0.018, 0.004, 0.003, 0.0014], 'accent', {
      at: [0, 0.066, RADIUS - 0.001],
      minLod: 1,
      segments: 3,
    }),
  ],
  anchors: [
    ...floorAnchors([RADIUS * 2, HEIGHT, RADIUS * 2]),
    { kind: 'effect', id: 'mist', position: [0, HEIGHT + 0.004, 0], effect: 'mist', size: 0.14 },
    {
      kind: 'emitter',
      id: 'tankGlow',
      position: [0, BASE_H + 0.02, 0],
      color: WATER,
      intensity: 0.3,
      radius: 0.16,
    },
  ],
  channels: [
    ramp('waterFill', ['waterline', 'scale', 'y'], ['waterLevel', [0, 1], [0.02, 1]], 900),
    ramp('waterShow', ['water', 'opacity'], ['waterLevel', [0, 0.04], [0, 0.55]], 900),
    look('waterLit', ['water', 'emissive'], ['power', { true: 0.35, false: 0 }]),
    look('waterDark', ['water', 'emissive'], ['online', { false: 0 }], 450),
    ramp('mistShow', ['mist', 'opacity'], ['speed', [0, 1], [0, 0.6]]),
    ramp('mistReach', ['mist', 'scale', 'y'], ['speed', [0, 1], [0.4, 1]]),
    ...powerOff('mist'),
    look('mistDry', ['mist', 'opacity'], ['waterLow', { true: 0 }], 450),
    look('glowRingLow', ['glowRing', 'colour'], ['waterLow', { true: WARNING }], 250),
    ...lit('glowRing', [0.9, 0.9], [sleepDim('glowRing')]),
    ...lit('led', [1, 0.9], [sleepDim('led')]),
    ...emitterChannels('tankGlow', ['power', { true: 0.5 }]),
  ],
  states: {
    off: { power: false, online: true, speed: 0, waterLevel: 0.6 },
    auto: { power: true, online: true, mode: 'auto', speed: 0.5, waterLevel: 0.7 },
    high: { power: true, online: true, mode: 'high', speed: 1, waterLevel: 0.5 },
    sleep: { power: true, online: true, mode: 'sleep', speed: 0.2, waterLevel: 0.6 },
    waterLow: { power: true, online: true, speed: 0, waterLow: true, waterLevel: 0.04 },
    fault: { power: true, online: true, fault: true, speed: 0, waterLevel: 0.4 },
    offline: { online: false },
  },
};
