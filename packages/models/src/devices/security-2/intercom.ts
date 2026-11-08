import type { ModelSpec } from '@smarteverything/domain';
import { box } from '../../helpers/geometry';
import { disc, look, OK, pulse, WARM } from './kit';

const HOUSE = { yaw: 20, pitch: 10, fov: 28, padding: 0.12, focus: 'screen' } as const;
const W = 0.134;
const H = 0.232;
const D = 0.03;
const FACE = D;

export const INTERCOM_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.intercom',
  version: '1.0.0',
  title: 'Video intercom',
  category: 'security',
  family: 'doorbell',
  footprint: { width: W, depth: D, height: H },
  framing: {
    tile: { ...HOUSE, padding: 0.06 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.16, pitch: 14 },
  },
  shots: [
    {
      id: 'call',
      when: {
        anyOf: [
          { allOf: [{ signal: 'ringing', op: 'eq', value: true }] },
          { allOf: [{ signal: 'screenOn', op: 'eq', value: true }] },
        ],
      },
      focus: 'screen',
      zoom: 1.35,
      yaw: 12,
      pitch: 8,
      easeMs: 800,
      loopS: 2,
      symmetry: 360,
      stillAt: 1,
    },
  ],
  meta: {
    names: {
      display: 'Video intercom',
      synonyms: ['door station', 'entry panel', 'door phone', 'video door phone', 'gate intercom'],
    },
    sizeClass: 'small',
    variants: ['silver', 'black'],
  },
  materials: {
    body: { finish: 'brushed-aluminium' },
    panel: { finish: 'satin-black', roughness: 0.08, clearcoat: 1 },
    trim: { finish: 'rubber' },
    accent: { color: OK, roughness: 0.3, opacity: 0 },
  },
  finishes: {
    silver: {},
    black: { body: { finish: 'graphite' } },
  },
  defaultFinish: 'silver',
  parts: [
    box('shell', [W, H, D, 0.012], 'body', { at: [0, H / 2, D / 2], contact: true }),
    box('glass', [W - 0.016, H - 0.016, 0.0016, 0.008], 'panel', {
      at: [0, 0, FACE / 2],
      parent: 'shell',
    }),
    {
      id: 'screen',
      parent: 'shell',
      geometry: { type: 'roundedPlane', width: 0.1, height: 0.074, radius: 0.004, segments: 6 },
      material: 'panel',
      transform: { position: [0, 0.03, FACE / 2 + 0.0012] },
    },
    disc('lens', [0.0075, 0.003, 0.0012], 'trim', {
      at: [0, 0.092, FACE / 2 + 0.0014],
      parent: 'shell',
    }),
    disc('lensGlass', [0.0052, 0.0012, 0.0006], 'panel', {
      at: [0, 0.092, FACE / 2 + 0.003],
      parent: 'shell',
      minLod: 1,
    }),
    {
      id: 'speaker',
      parent: 'shell',
      geometry: {
        type: 'grille',
        width: 0.07,
        height: 0.022,
        rows: 3,
        columns: 16,
        holeRadius: 0.0012,
      },
      material: 'trim',
      transform: { position: [0, -0.034, FACE / 2 + 0.0012] },
      minLod: 1,
    },
    disc('call', [0.0145, 0.004, 0.0016], 'trim', {
      at: [0, -0.076, FACE / 2 + 0.0024],
      parent: 'shell',
    }),
    {
      id: 'ring',
      parent: 'shell',
      geometry: { type: 'ring', innerRadius: 0.0158, outerRadius: 0.0186, segments: 64 },
      material: 'accent',
      transform: { position: [0, -0.076, FACE / 2 + 0.0018] },
      minLod: 1,
    },
    {
      id: 'led',
      parent: 'shell',
      geometry: { type: 'sphere', radius: 0.0016, segments: 12 },
      material: 'accent',
      transform: { position: [0.022, 0.092, FACE / 2 + 0.0016] },
      minLod: 1,
    },
  ],
  anchors: [
    {
      kind: 'screen',
      id: 'display',
      parent: 'shell',
      position: [0, 0.03, FACE / 2 + 0.0014],
      width: 0.1,
      height: 0.074,
    },
    { kind: 'mount', id: 'wall', position: [0, 0, 0], mount: 'wall' },
    { kind: 'label', id: 'pin', position: [0, H + 0.03, 0.015] },
    { kind: 'hit', id: 'bodyHit', position: [0, H / 2, D / 2], size: [W, H, D] },
  ],
  channels: [
    look('screenTint', ['screen', 'colour'], ['screenOn', { true: '#22304F' }]),
    look('screenLit', ['screen', 'emissive'], ['screenOn', { true: 0.9, false: 0 }], {
      type: 'pose',
      easeMs: 300,
    }),
    look('screenRing', ['screen', 'emissive'], ['ringing', { true: 0.9 }]),
    look('ringShow', ['ring', 'opacity'], ['online', { true: 1, false: 0 }]),
    look('ringIdle', ['ring', 'emissive'], ['online', { true: 0.6, false: 0 }]),
    pulse('ringRinging', ['ring', 'emissive'], ['ringing', { true: 1.9 }], [1, 0.8]),
    look('ringTint', ['ring', 'colour'], ['ringing', { true: WARM }]),
    look('ledShow', ['led', 'opacity'], ['online', { true: 1, false: 0 }]),
    look('ledMotion', ['led', 'emissive'], ['motion', { true: 1.6, false: 0.6 }]),
    look('ledFault', ['led', 'colour'], ['fault', { true: '#F2564E' }]),
  ],
  states: {
    idle: { online: true, screenOn: false, ringing: false },
    ringing: { online: true, screenOn: true, ringing: true },
    talking: { online: true, screenOn: true, ringing: false },
    motion: { online: true, motion: true },
    fault: { online: true, fault: true },
    offline: { online: false },
  },
};
