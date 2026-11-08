import type { ModelSpec } from '@smarteverything/domain';
import { box } from '../../helpers/geometry';
import { disc, HEAT, look, OK, pulse } from './kit';

const HOUSE = { yaw: 30, pitch: 22, fov: 28, padding: 0.12, focus: 'shell' } as const;
const W = 0.117;
const D = 0.112;
const H = 0.038;
const FOOT = 0.004;
const BODY_H = H - FOOT;
const BODY_Y = FOOT + BODY_H / 2;
const FRONT = D / 2;

export const MINI_PC_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.computer.mini-pc',
  version: '1.0.0',
  title: 'Mini PC',
  category: 'computer',
  family: 'computer',
  footprint: { width: W, depth: D, height: H },
  framing: {
    tile: { ...HOUSE, padding: 0.08 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.18, pitch: 26 },
  },
  shots: [
    {
      id: 'run',
      when: { anyOf: [{ allOf: [{ signal: 'thermal', op: 'eq', value: 'heating' }] }] },
      focus: 'vent',
      zoom: 1.5,
      yaw: 12,
      pitch: 8,
      easeMs: 800,
      loopS: 2,
      symmetry: 360,
      stillAt: 0,
    },
  ],
  meta: {
    names: {
      display: 'Mini PC',
      synonyms: ['nuc', 'small form factor', 'micro pc', 'mini computer', 'home server'],
    },
    sizeClass: 'small',
    variants: ['black', 'silver'],
  },
  materials: {
    body: { finish: 'graphite' },
    top: { finish: 'satin-black', roughness: 0.18, clearcoat: 0.8 },
    trim: { finish: 'rubber' },
    accent: { color: OK, roughness: 0.3, opacity: 0 },
  },
  finishes: {
    black: {},
    silver: { body: { finish: 'brushed-aluminium' } },
  },
  defaultFinish: 'black',
  parts: [
    box('shell', [W, BODY_H, D, 0.009], 'body', { at: [0, BODY_Y, 0], contact: true }),
    box('lid', [W - 0.006, 0.004, D - 0.006, 0.0018], 'top', {
      at: [0, BODY_H / 2 - 0.0008, 0],
      parent: 'shell',
    }),
    {
      id: 'vent',
      parent: 'shell',
      geometry: {
        type: 'grille',
        width: 0.07,
        height: 0.05,
        rows: 5,
        columns: 12,
        holeRadius: 0.0022,
      },
      material: 'trim',
      transform: { position: [0, BODY_H / 2 + 0.0012, -0.012], rotation: [-90, 0, 0] },
      minLod: 1,
    },
    box('slotUsbA', [0.014, 0.006, 0.003, 0.0012], 'trim', {
      at: [-0.03, -0.004, FRONT + 0.0004],
      parent: 'shell',
      minLod: 1,
    }),
    box('slotUsbB', [0.014, 0.006, 0.003, 0.0012], 'trim', {
      at: [-0.01, -0.004, FRONT + 0.0004],
      parent: 'shell',
      minLod: 1,
    }),
    disc('button', [0.0055, 0.0026, 0.0012], 'top', {
      at: [0.036, -0.004, FRONT + 0.0006],
      parent: 'shell',
    }),
    {
      id: 'ring',
      parent: 'shell',
      geometry: { type: 'ring', innerRadius: 0.0058, outerRadius: 0.0072, segments: 32 },
      material: 'accent',
      transform: { position: [0.036, -0.004, FRONT + 0.0018] },
      minLod: 1,
    },
    {
      id: 'underGlow',
      parent: 'shell',
      geometry: {
        type: 'roundedPlane',
        width: W - 0.02,
        height: 0.004,
        radius: 0.002,
        segments: 6,
      },
      material: 'accent',
      transform: { position: [0, -BODY_H / 2 + 0.0015, FRONT + 0.0006] },
      minLod: 1,
    },
    box('footLeft', [0.022, FOOT, 0.022, 0.0016], 'trim', {
      at: [-0.04, FOOT / 2, 0.036],
      contact: true,
      minLod: 1,
    }),
    box('footRight', [0.022, FOOT, 0.022, 0.0016], 'trim', {
      at: [0.04, FOOT / 2, 0.036],
      contact: true,
      minLod: 1,
    }),
    box('footBackLeft', [0.022, FOOT, 0.022, 0.0016], 'trim', {
      at: [-0.04, FOOT / 2, -0.036],
      contact: true,
      minLod: 1,
    }),
    box('footBackRight', [0.022, FOOT, 0.022, 0.0016], 'trim', {
      at: [0.04, FOOT / 2, -0.036],
      contact: true,
      minLod: 1,
    }),
  ],
  anchors: [
    { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, H + 0.03, 0] },
    { kind: 'hit', id: 'bodyHit', position: [0, H / 2, 0], size: [W, H, D] },
    {
      kind: 'effect',
      id: 'heat',
      parent: 'shell',
      position: [0, BODY_H / 2, -0.012],
      effect: 'airflow',
      size: 0.05,
    },
  ],
  channels: [
    look('ringShow', ['ring', 'opacity'], ['power', { true: 1, false: 0 }]),
    look('ringGlow', ['ring', 'emissive'], ['power', { true: 1, false: 0 }]),
    look('glowShow', ['underGlow', 'opacity'], ['power', { true: 1, false: 0 }]),
    look(
      'glowTint',
      ['underGlow', 'colour'],
      ['thermal', { heating: HEAT, idle: OK, cooling: OK }],
    ),
    look('glowLit', ['underGlow', 'emissive'], ['power', { true: 0.8, false: 0 }]),
    pulse('glowBusy', ['underGlow', 'emissive'], ['thermal', { heating: 1.6 }], [1.2, 0.5]),
  ],
  states: {
    off: { power: false, online: true },
    idle: { power: true, online: true, thermal: 'idle' },
    busy: { power: true, online: true, thermal: 'heating' },
    offline: { online: false },
  },
};
