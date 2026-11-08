import type { ModelSpec, ModelSpecChannel } from '@smarteverything/domain';
import {
  ACCENT,
  CHARGE,
  anchorsOf,
  house,
  leaf,
  look,
  puck,
  shot,
  status,
  whenAll,
} from '../energy/kit';
import { box, part } from '../../helpers/geometry';

const W = 0.058;
const H = 0.058;
const D = 0.034;
const FRONT = D;

const ringChannels: ModelSpecChannel[] = [
  look('ringShow', ['ring', 'opacity'], ['power', { true: 1, false: 0 }]),
  look('ringLit', ['ring', 'emissive'], ['power', { true: 1.1, false: 0 }], 300),
  look('ringOffline', ['ring', 'opacity'], ['online', { false: 0 }], 450),
  look('ringWarn', ['ring', 'colour'], ['fault', { true: '#F2564E' }]),
];

export const SMART_PLUG_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.plug.wall',
  version: '1.0.0',
  title: 'Smart plug',
  category: 'energy',
  family: 'plug',
  footprint: { width: W, depth: D, height: H },
  framing: house('button', 24, 16),
  shots: [
    shot('powered', whenAll(leaf('power', 'eq', true)), 'button', {
      zoom: 1.5,
      yaw: 18,
      pitch: 14,
      loopS: 2,
      stillAt: 1,
    }),
  ],
  meta: {
    names: {
      display: 'Smart plug',
      synonyms: ['smart socket', 'wifi plug', 'outlet adapter', 'mini plug', 'power plug'],
    },
    sizeClass: 'small',
    variants: ['white', 'black'],
  },
  materials: {
    body: { finish: 'matte-white' },
    face: { finish: 'satin-black', roughness: 0.12, clearcoat: 1 },
    trim: { finish: 'brushed-aluminium' },
    accent: { ...ACCENT, color: CHARGE },
  },
  finishes: {
    white: {},
    black: { body: { finish: 'graphite' } },
  },
  defaultFinish: 'white',
  parts: [
    box('shell', [W, H, D, 0.014], 'body', { at: [0, H / 2, D / 2], contact: true }),
    box('plate', [W - 0.012, H - 0.012, 0.0018, 0.01], 'face', {
      at: [0, 0, FRONT / 2],
      parent: 'shell',
    }),
    puck('button', [0.0115, 0.004, 0.0016], 'trim', {
      at: [0, 0.004, FRONT / 2 + 0.0024],
      parent: 'shell',
      transform: { rotation: [90, 0, 0] },
    }),
    part(
      'ring',
      { type: 'ring', innerRadius: 0.0145, outerRadius: 0.0172, segments: 64 },
      'accent',
      {
        parent: 'shell',
        transform: { position: [0, 0.004, FRONT / 2 + 0.0019] },
      },
    ),
    box('prongLeft', [0.005, 0.0016, 0.012, 0.0006], 'trim', {
      at: [-0.0115, 0, -D / 2 + 0.002],
      parent: 'shell',
      transform: { rotation: [90, 0, 0] },
      minLod: 1,
    }),
    box('prongRight', [0.005, 0.0016, 0.012, 0.0006], 'trim', {
      at: [0.0115, 0, -D / 2 + 0.002],
      parent: 'shell',
      transform: { rotation: [90, 0, 0] },
      minLod: 1,
    }),
    box('led', [0.007, 0.0026, 0.0014, 0.0012], 'accent', {
      at: [0, -0.0178, FRONT / 2 + 0.0014],
      parent: 'shell',
      minLod: 1,
    }),
  ],
  anchors: anchorsOf([W, H, D], 'wall'),
  channels: [...ringChannels, ...status('led')],
  states: {
    on: { power: true, online: true },
    off: { power: false, online: true },
    fault: { power: true, online: true, fault: true },
    offline: { online: false },
  },
};
