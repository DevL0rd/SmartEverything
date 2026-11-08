import type { ModelSpec } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { box, part } from '../../helpers/geometry';
import {
  ACCENT,
  anchorsOf,
  ball,
  house,
  leaf,
  look,
  pulse,
  puck,
  shot,
  status,
  whenAll,
} from '../energy/kit';

const BASE_R = 0.05;
const BASE_H = 0.034;
const DOME_R = 0.04;
const HEAD_R = 0.026;
const HEIGHT = BASE_H + DOME_R;
const NIGHT = '#C2505A';
const SCAN = '#5ED3CF';

export const DOME_CAMERA_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.camera.dome-indoor',
  version: '1.0.0',
  title: 'Indoor dome camera',
  category: 'security',
  family: 'camera',
  footprint: { width: BASE_R * 2, depth: BASE_R * 2, height: HEIGHT },
  framing: house('head', 30, 18),
  shots: [
    shot('watch', whenAll(leaf('motion', 'eq', true)), 'head', {
      zoom: 1.5,
      yaw: 14,
      pitch: 10,
      loopS: 2,
    }),
    shot('patrol', whenAll(leaf('mode', 'eq', 'cruise')), 'dome', {
      zoom: 1.2,
      yaw: 24,
      pitch: 16,
      loopS: 12,
    }),
  ],
  meta: {
    names: {
      display: 'Indoor camera',
      synonyms: [
        'dome camera',
        'indoor camera',
        'security camera',
        'pan tilt camera',
        'baby monitor',
      ],
    },
    sizeClass: 'small',
    variants: ['white', 'black'],
  },
  materials: {
    shell: { finish: 'matte-white', clearcoat: 0.3 },
    glass: { finish: 'smoked-acrylic', opacity: 0.42, clearcoat: 1 },
    trim: { finish: 'satin-black', clearcoat: 0.8 },
    accent: ACCENT,
  },
  finishes: {
    white: {},
    black: { shell: { finish: 'graphite', clearcoat: 0.3 } },
  },
  defaultFinish: 'white',
  parts: [
    part(
      'base',
      {
        type: 'lathe',
        profile: [
          [0, 0],
          [BASE_R - 0.006, 0],
          [BASE_R - 0.001, 0.003],
          [BASE_R, 0.012],
          [BASE_R - 0.003, 0.026],
          [DOME_R + 0.002, BASE_H - 0.001],
          [DOME_R, BASE_H],
          [0, BASE_H],
        ],
        segments: 64,
      },
      'shell',
      { contact: true },
    ),
    part('collar', { type: 'torus', radius: DOME_R + 0.0006, tube: 0.0018, segments: 64 }, 'trim', {
      transform: { position: [0, BASE_H, 0], rotation: [90, 0, 0] },
      minLod: 1,
    }),
    puck('panJoint', [HEAD_R * 0.8, 0.004, 0.001], 'trim', { at: [0, BASE_H + 0.002, 0] }),
    ball('head', HEAD_R, 'shell', {
      at: [0, HEAD_R * 0.62, 0],
      parent: 'panJoint',
      segments: 40,
    }),
    puck('lens', [0.0115, 0.008, 0.002], 'trim', {
      at: [0, 0, HEAD_R - 0.002],
      parent: 'head',
      transform: { rotation: [90, 0, 0] },
      segments: 40,
    }),
    ball('lensGlass', 0.0076, 'glass', {
      at: [0, 0, HEAD_R + 0.0018],
      parent: 'head',
      transform: { scale: [1, 1, 0.45] },
      segments: 24,
      minLod: 1,
    }),
    part(
      'irRing',
      { type: 'ring', innerRadius: 0.0118, outerRadius: 0.0142, segments: 48 },
      'accent',
      { parent: 'head', transform: { position: [0, 0, HEAD_R + 0.0012] }, minLod: 1 },
    ),
    ball('mic', 0.0012, 'trim', {
      at: [0.016, 0.012, HEAD_R - 0.006],
      parent: 'head',
      segments: 8,
      minLod: 2,
    }),
    part('dome', { type: 'sphere', radius: DOME_R, thetaLength: 90, segments: 56 }, 'glass', {
      transform: { position: [0, BASE_H, 0] },
    }),
    box('led', [0.008, 0.0026, 0.0016, 0.0012], 'accent', {
      at: [0, 0.016, BASE_R - 0.0012],
      transform: { rotation: [-8, 0, 0] },
      minLod: 1,
    }),
    {
      id: 'speaker',
      geometry: {
        type: 'grille',
        width: 0.03,
        height: 0.01,
        rows: 2,
        columns: 10,
        holeRadius: 0.0007,
      },
      material: 'trim',
      transform: { position: [0, 0.014, -BASE_R + 0.001], rotation: [-8, 180, 0] },
      minLod: 2,
    },
  ],
  anchors: [
    ...anchorsOf([BASE_R * 2, HEIGHT, BASE_R * 2], 'floor'),
    {
      kind: 'emitter',
      id: 'statusGlow',
      position: [0, 0.016, BASE_R + 0.004],
      color: SCAN,
      intensity: 0.18,
      radius: 0.04,
    },
  ],
  channels: [
    {
      id: 'pan',
      target: 'panJoint',
      property: 'rotate',
      axis: 'y',
      source: 'cameraPan',
      map: { type: 'linear', in: [-180, 180], out: [-180, 180], clamp: true },
      motion: { type: 'pose', easeMs: 600 },
      reduced: 'hold',
    },
    {
      id: 'tilt',
      target: 'head',
      property: 'rotate',
      axis: 'x',
      source: 'cameraTilt',
      map: { type: 'linear', in: [-90, 90], out: [90, -90], clamp: true },
      motion: { type: 'pose', easeMs: 600 },
      reduced: 'hold',
    },
    {
      id: 'privacy',
      target: 'head',
      property: 'rotate',
      axis: 'x',
      source: 'power',
      map: { type: 'enum', table: { false: 80 } },
      motion: { type: 'pose', easeMs: 450 },
      reduced: 'hold',
    },
    {
      id: 'patrol',
      target: 'panJoint',
      property: 'rotate',
      axis: 'y',
      source: 'mode',
      map: { type: 'enum', table: { cruise: 1 } },
      motion: { type: 'oscillate', limits: [-60, 60], speed: 20 },
      reduced: 'hold',
    },
    ...status('led'),
    look('irMotion', ['irRing', 'opacity'], ['motion', { true: 1 }]),
    look('irNight', ['irRing', 'opacity'], ['mode', { night: 1 }]),
    look('irScanTint', ['irRing', 'colour'], ['motion', { true: SCAN }]),
    look('irNightTint', ['irRing', 'colour'], ['mode', { night: NIGHT }]),
    look('irNightLit', ['irRing', 'emissive'], ['mode', { night: 0.8 }]),
    pulse('irScan', ['irRing', 'emissive'], ['motion', { true: 1.4 }], [2, 0.8]),
    look('irSleep', ['irRing', 'opacity'], ['power', { false: 0 }], 450),
    look('irOffline', ['irRing', 'opacity'], ['online', { false: 0 }], 450),
    ...emitterChannels('statusGlow'),
  ],
  states: {
    idle: { power: true, online: true, mode: 'normal', motion: false },
    motion: { power: true, online: true, mode: 'normal', motion: true },
    night: { power: true, online: true, mode: 'night' },
    patrol: { power: true, online: true, mode: 'cruise' },
    aimed: { power: true, online: true, cameraPan: 40, cameraTilt: -18 },
    privacy: { power: false, online: true },
    fault: { power: true, online: true, fault: true },
    offline: { online: false },
  },
};
