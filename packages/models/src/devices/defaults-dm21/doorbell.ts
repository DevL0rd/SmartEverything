import type { ModelSpec } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { box, part } from '../../helpers/geometry';
import {
  ACCENT,
  PRIMARY,
  WARNING,
  anchorsOf,
  ball,
  leaf,
  look,
  pulse,
  puck,
  shot,
  status,
  whenAll,
} from '../energy/kit';

const HOUSE = { yaw: 20, pitch: 10, fov: 28, padding: 0.12, focus: 'button' } as const;
const W = 0.044;
const H = 0.128;
const D = 0.024;
const PLATE = 0.003;
const FRONT = D / 2;
const LENS_Y = 0.038;
const BUTTON_Y = -0.036;
const NIGHT = '#C2505A';

export const VIDEO_DOORBELL_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.doorbell.video',
  version: '1.0.0',
  title: 'Video doorbell',
  category: 'security',
  family: 'doorbell',
  footprint: { width: W, depth: D + PLATE, height: H },
  framing: {
    tile: { ...HOUSE, padding: 0.06 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.16, pitch: 14 },
  },
  shots: [
    shot('ring', whenAll(leaf('ringing', 'eq', true)), 'button', {
      zoom: 1.2,
      yaw: 12,
      pitch: 6,
      loopS: 1,
    }),
  ],
  meta: {
    names: {
      display: 'Video doorbell',
      synonyms: ['doorbell', 'smart doorbell', 'doorbell camera', 'door camera', 'wifi doorbell'],
    },
    sizeClass: 'small',
    variants: ['silver', 'black'],
  },
  materials: {
    body: { finish: 'brushed-aluminium' },
    face: { finish: 'satin-black', roughness: 0.12, clearcoat: 1 },
    metal: { finish: 'chrome' },
    accent: ACCENT,
  },
  finishes: {
    silver: {},
    black: { body: { finish: 'graphite' } },
  },
  defaultFinish: 'silver',
  parts: [
    box('bracket', [W + 0.003, H + 0.003, PLATE, 0.006], 'face', {
      at: [0, H / 2, PLATE / 2],
      minLod: 2,
    }),
    box('shell', [W, H, D, 0.011], 'body', {
      at: [0, H / 2, PLATE + D / 2],
      contact: true,
      segments: 5,
    }),
    box('face', [W - 0.006, 0.07, 0.0016, 0.006], 'face', {
      at: [0, 0.026, FRONT],
      parent: 'shell',
    }),
    part('bezel', { type: 'torus', radius: 0.0094, tube: 0.0012, segments: 40 }, 'metal', {
      parent: 'shell',
      transform: { position: [0, LENS_Y, FRONT + 0.001] },
      minLod: 1,
    }),
    ball('lens', 0.0074, 'face', {
      at: [0, LENS_Y, FRONT + 0.0008],
      parent: 'shell',
      transform: { scale: [1, 1, 0.5] },
      segments: 28,
    }),
    ...[-1, 1].map((side) =>
      ball(`ir${side < 0 ? 'Left' : 'Right'}`, 0.0011, 'accent', {
        at: [side * 0.0145, LENS_Y, FRONT + 0.001],
        parent: 'shell',
        segments: 8,
        minLod: 1,
      }),
    ),
    ball('led', 0.0013, 'accent', {
      at: [0, LENS_Y + 0.0145, FRONT + 0.001],
      parent: 'shell',
      segments: 10,
      minLod: 1,
    }),
    {
      id: 'sensor',
      parent: 'shell',
      geometry: { type: 'roundedPlane', width: 0.022, height: 0.008, radius: 0.004, segments: 6 },
      material: 'metal',
      transform: { position: [0, 0.008, FRONT + 0.001] },
      minLod: 2,
    },
    {
      id: 'speaker',
      parent: 'shell',
      geometry: {
        type: 'grille',
        width: 0.022,
        height: 0.006,
        rows: 2,
        columns: 9,
        holeRadius: 0.0006,
      },
      material: 'face',
      transform: { position: [0, -0.012, FRONT + 0.0004] },
      minLod: 1,
    },
    puck('buttonBed', [0.0148, 0.0014, 0.0005], 'face', {
      at: [0, BUTTON_Y, FRONT + 0.0004],
      parent: 'shell',
      transform: { rotation: [90, 0, 0] },
      segments: 48,
      minLod: 1,
    }),
    puck('button', [0.0122, 0.004, 0.0016], 'metal', {
      at: [0, BUTTON_Y, FRONT + 0.0022],
      parent: 'shell',
      transform: { rotation: [90, 0, 0] },
      segments: 48,
    }),
    part(
      'ring',
      { type: 'ring', innerRadius: 0.0128, outerRadius: 0.0146, segments: 64 },
      'accent',
      { parent: 'shell', transform: { position: [0, BUTTON_Y, FRONT + 0.0016] } },
    ),
  ],
  anchors: [
    ...anchorsOf([W, H, D + PLATE], 'wall'),
    {
      kind: 'emitter',
      id: 'buttonGlow',
      parent: 'shell',
      position: [0, BUTTON_Y, FRONT + 0.008],
      color: PRIMARY,
      intensity: 0.35,
      radius: 0.07,
    },
  ],
  channels: [
    look('ringShow', ['ring', 'opacity'], ['online', { true: 1, false: 0 }]),
    look('ringIdle', ['ring', 'emissive'], ['online', { true: 0.7, false: 0 }]),
    look('ringTint', ['ring', 'colour'], ['ringing', { true: WARNING }]),
    pulse('ringRinging', ['ring', 'emissive'], ['ringing', { true: 1.9 }], [1, 0.8]),
    {
      id: 'buttonPress',
      target: 'button',
      property: 'translate',
      axis: 'z',
      source: 'ringing',
      map: { type: 'enum', table: { true: -0.0016, false: 0 } },
      motion: { type: 'pose', easeMs: 120 },
      reduced: 'hold',
    },
    ...status('led'),
    look('ledMotion', ['led', 'emissive'], ['motion', { true: 1.6 }]),
    ...['irLeft', 'irRight'].flatMap((ir) => [
      look(`${ir}Show`, [ir, 'opacity'], ['mode', { night: 1 }]),
      look(`${ir}Tint`, [ir, 'colour'], ['mode', { night: NIGHT }]),
      look(`${ir}Lit`, [ir, 'emissive'], ['mode', { night: 1.1 }]),
      look(`${ir}Offline`, [ir, 'opacity'], ['online', { false: 0 }], 450),
    ]),
    ...emitterChannels('buttonGlow', ['ringing', { true: 1.2, false: 0.4 }]),
  ],
  states: {
    idle: { power: true, online: true, ringing: false, motion: false },
    ringing: { power: true, online: true, ringing: true },
    motion: { power: true, online: true, motion: true },
    night: { power: true, online: true, mode: 'night' },
    lowBattery: { power: true, online: true, batteryLow: true, battery: 0.1 },
    fault: { power: true, online: true, fault: true },
    offline: { online: false },
  },
};
