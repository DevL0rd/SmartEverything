import type { ModelSpec, ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { box, part } from '../../helpers/geometry';
import { ACCENT, CHARGE, HEAT, house, leaf, look, shot, whenAll } from '../energy/kit';

const W = 0.312;
const D = 0.218;
const BASE_H = 0.0145;
const LID_T = 0.0055;
const LID_L = 0.205;
const FACE = LID_T / 2;
const HINGE_Y = BASE_H + LID_T / 2 - 0.001;
const HINGE_Z = -D / 2 + 0.006;
const OPEN_DEG = -18;
const CLOSE_DEG = 90 - OPEN_DEG;
const SCREEN_W = 0.288;
const SCREEN_H = 0.182;
const SCREEN_Y = 0.004;
const DECK = BASE_H / 2;
const HEIGHT = 0.21;
const SCREEN = '#22304F';
const SPILL = '#C9D6F2';
const KEY_ROWS = [-0.074, -0.058, -0.042, -0.026, -0.01] as const;

const ON = whenAll(leaf('screenOn', 'eq', true));

const BASE: readonly ModelSpecPart[] = [
  box('base', [W, BASE_H, D, 0.0052], 'body', { at: [0, BASE_H / 2, 0], contact: true }),
  part(
    'keyWell',
    { type: 'roundedPlane', width: 0.27, height: 0.088, radius: 0.004, segments: 4 },
    'keys',
    { parent: 'base', transform: { position: [0, DECK + 0.0003, -0.042], rotation: [-90, 0, 0] } },
  ),
  ...KEY_ROWS.map((z, index) =>
    box(`keys${String(index)}`, [0.258, 0.0012, 0.012, 0.0008], 'keys', {
      at: [0, DECK + 0.0008, z],
      parent: 'base',
      minLod: 1,
    }),
  ),
  part(
    'touchpad',
    { type: 'roundedPlane', width: 0.112, height: 0.07, radius: 0.005, segments: 4 },
    'panel',
    { parent: 'base', transform: { position: [0, DECK + 0.0003, 0.054], rotation: [-90, 0, 0] } },
  ),
  box('notch', [0.05, 0.003, 0.004, 0.0012], 'keys', {
    at: [0, DECK - 0.002, D / 2 - 0.0004],
    parent: 'base',
    minLod: 1,
  }),
  box('powerLed', [0.006, 0.0016, 0.0012, 0.0006], 'accent', {
    at: [0.11, -0.002, D / 2 + 0.0002],
    parent: 'base',
    minLod: 1,
  }),
  ...[-1, 1].map((side, index) =>
    box(`port${String(index)}`, [0.0012, 0.0034, 0.009, 0.0006], 'keys', {
      at: [side * (W / 2 + 0.0002), -0.0005, -0.04],
      parent: 'base',
      minLod: 2,
    }),
  ),
];

const LID: readonly ModelSpecPart[] = [
  box('hinge', [W - 0.08, LID_T, LID_T, 0.0026], 'keys', {
    at: [0, HINGE_Y, HINGE_Z],
    transform: { rotation: [OPEN_DEG, 0, 0] },
  }),
  box('lid', [W, LID_L, LID_T, 0.0045], 'body', {
    at: [0, LID_L / 2, 0],
    parent: 'hinge',
  }),
  part(
    'bezel',
    { type: 'roundedPlane', width: W - 0.006, height: LID_L - 0.006, radius: 0.004, segments: 4 },
    'panel',
    { parent: 'lid', transform: { position: [0, 0, FACE + 0.0004] } },
  ),
  part(
    'screen',
    { type: 'roundedPlane', width: SCREEN_W, height: SCREEN_H, radius: 0.002, segments: 3 },
    'panel',
    { parent: 'lid', transform: { position: [0, SCREEN_Y, FACE + 0.0009] } },
  ),
  part(
    'webcam',
    { type: 'cylinder', height: 0.0006, topRadius: 0.0012, bottomRadius: 0.0012, segments: 16 },
    'keys',
    {
      parent: 'lid',
      transform: { position: [0, LID_L / 2 - 0.0048, FACE + 0.001], rotation: [90, 0, 0] },
      minLod: 2,
    },
  ),
];

const CHANNELS: ModelSpecChannel[] = [
  {
    id: 'lidFold',
    target: 'hinge',
    property: 'rotate',
    axis: 'x',
    source: 'fold',
    map: { type: 'linear', in: [0, 1], out: [CLOSE_DEG, 0], clamp: true },
    motion: { type: 'pose', easeMs: 700 },
    reduced: 'hold',
  },
  look('screenTint', ['screen', 'colour'], ['screenOn', { true: SCREEN }]),
  look('screenLit', ['screen', 'emissive'], ['screenOn', { true: 0.9, false: 0 }]),
  look('screenOff', ['screen', 'emissive'], ['power', { false: 0 }], 450),
  look('screenOffline', ['screen', 'emissive'], ['online', { false: 0 }], 450),
  look('ledShow', ['powerLed', 'opacity'], ['power', { true: 1, false: 0 }]),
  look('ledLit', ['powerLed', 'emissive'], ['power', { true: 0.9, false: 0 }]),
  look('ledCharge', ['powerLed', 'colour'], ['charging', { true: CHARGE }]),
  look('ledHot', ['powerLed', 'colour'], ['thermal', { heating: HEAT }]),
  look('ledOffline', ['powerLed', 'opacity'], ['online', { false: 0 }], 450),
  look('heatShow', ['heat', 'opacity'], ['thermal', { heating: 0.4, idle: 0, cooling: 0 }], 600),
  ...emitterChannels('screenLight', ['screenOn', { true: 0.6, false: 0 }]),
];

export const LAPTOP_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.computer.laptop',
  version: '1.0.0',
  title: 'Laptop',
  category: 'computer',
  family: 'computer',
  footprint: { width: W, depth: D, height: HEIGHT },
  framing: house('lid', 30, 20),
  shots: [shot('screen', ON, 'screen', { zoom: 1.2, yaw: 30, pitch: 8, loopS: 3, stillAt: 1.5 })],
  meta: {
    names: {
      display: 'Laptop',
      synonyms: ['notebook', 'ultrabook', 'laptop computer', 'portable computer', 'thin and light'],
    },
    sizeClass: 'medium',
    variants: ['silver', 'space-grey'],
  },
  materials: {
    body: { finish: 'brushed-aluminium', pattern: 'brushed' },
    keys: { finish: 'satin-black' },
    panel: { finish: 'satin-black', roughness: 0.16, clearcoat: 0.6 },
    accent: ACCENT,
  },
  finishes: {
    silver: {},
    'space-grey': { body: { finish: 'graphite' } },
  },
  defaultFinish: 'silver',
  parts: [...BASE, ...LID],
  anchors: [
    {
      kind: 'screen',
      id: 'display',
      parent: 'lid',
      position: [0, SCREEN_Y, FACE + 0.0012],
      width: SCREEN_W,
      height: SCREEN_H,
    },
    {
      kind: 'emitter',
      id: 'screenLight',
      parent: 'lid',
      position: [0, 0, FACE + 0.02],
      color: SPILL,
      intensity: 0.35,
      radius: 0.25,
      cone: 120,
    },
    {
      kind: 'effect',
      id: 'heat',
      parent: 'base',
      position: [0, 0, -D / 2 - 0.01],
      effect: 'airflow',
      size: 0.08,
    },
    { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, HEIGHT + 0.04, -0.06] },
    { kind: 'hit', id: 'tap', position: [0, HEIGHT / 2, -0.02], size: [W, HEIGHT, D] },
  ],
  channels: CHANNELS,
  states: {
    off: { power: false, online: true, screenOn: false, fold: 1 },
    closed: { power: true, online: true, screenOn: false, fold: 0 },
    on: { power: true, online: true, screenOn: true, fold: 1, thermal: 'idle' },
    busy: { power: true, online: true, screenOn: true, fold: 1, thermal: 'heating' },
    charging: { power: true, online: true, screenOn: true, fold: 1, charging: true },
    offline: { online: false },
  },
};
