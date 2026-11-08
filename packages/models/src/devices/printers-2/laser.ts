import type { ModelSpec, ModelSpecCondition } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { box } from '../../helpers/geometry';
import { FAULT, HEAT, look, OK, pulse, READOUT } from './kit';

const HOUSE = { yaw: 30, pitch: 22, fov: 28, padding: 0.1, focus: 'panel' } as const;
const W = 0.405;
const D = 0.36;
const FOOT = 0.008;
const LOWER_H = 0.1;
const UPPER_H = 0.11;
const LOWER_Y = FOOT + LOWER_H / 2;
const UPPER_Y = FOOT + LOWER_H + UPPER_H / 2;
const TOP = FOOT + LOWER_H + UPPER_H;
const FRONT = D / 2;
const PRINT_WHEN: ModelSpecCondition = {
  anyOf: [
    { allOf: [{ signal: 'phase', op: 'eq', value: 'printing' }] },
    { allOf: [{ signal: 'phase', op: 'eq', value: 'done' }] },
  ],
};

export const LASER_PRINTER_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.printer.laser',
  version: '1.0.0',
  title: 'Laser printer',
  category: 'printer',
  family: 'printer',
  footprint: { width: W, depth: D, height: TOP + 0.01 },
  framing: {
    tile: { ...HOUSE, padding: 0.06 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.14, pitch: 26 },
  },
  shots: [
    {
      id: 'print',
      when: PRINT_WHEN,
      focus: 'sheet',
      zoom: 1.1,
      yaw: 14,
      pitch: 18,
      easeMs: 900,
      loopS: 3,
      symmetry: 360,
      stillAt: 1.5,
    },
  ],
  meta: {
    names: {
      display: 'Laser printer',
      synonyms: ['office printer', 'mono laser', 'toner printer', 'laserjet style printer'],
    },
    sizeClass: 'medium',
    variants: ['white', 'graphite'],
  },
  materials: {
    body: { finish: 'matte-white' },
    trim: { finish: 'graphite' },
    panel: { finish: 'satin-black', roughness: 0.1, clearcoat: 0.9 },
    accent: { color: OK, roughness: 0.3, opacity: 0 },
  },
  finishes: {
    white: {},
    graphite: { body: { finish: 'graphite' }, trim: { finish: 'satin-black' } },
  },
  defaultFinish: 'white',
  parts: [
    box('lower', [W, LOWER_H, D, 0.014], 'body', { at: [0, LOWER_Y, 0], contact: true }),
    box('upper', [W - 0.012, UPPER_H, D - 0.02, 0.016], 'body', { at: [0, UPPER_Y, -0.006] }),
    box('seam', [W + 0.001, 0.003, D + 0.001, 0.0012], 'trim', {
      at: [0, FOOT + LOWER_H, 0],
      minLod: 1,
    }),
    box('cassette', [W - 0.06, 0.036, 0.012, 0.008], 'trim', {
      at: [0, FOOT + 0.05, FRONT + 0.002],
    }),
    box('grip', [0.11, 0.008, 0.006, 0.003], 'panel', {
      at: [0, 0.004, 0.008],
      parent: 'cassette',
      minLod: 1,
    }),
    box('outTray', [W - 0.1, 0.004, 0.17, 0.002], 'trim', {
      at: [-0.02, TOP - 0.001, -0.07],
      transform: { rotation: [-5, 0, 0] },
    }),
    box('panel', [0.13, 0.018, 0.062, 0.006], 'panel', {
      at: [0.115, TOP + 0.002, FRONT - 0.06],
      transform: { rotation: [28, 0, 0] },
    }),
    {
      id: 'screen',
      parent: 'panel',
      geometry: { type: 'roundedPlane', width: 0.05, height: 0.028, radius: 0.002, segments: 4 },
      material: 'panel',
      transform: { position: [-0.026, 0.0095, 0], rotation: [-90, 0, 0] },
    },
    {
      id: 'led',
      parent: 'panel',
      geometry: { type: 'sphere', radius: 0.0026, segments: 12 },
      material: 'accent',
      transform: { position: [0.05, 0.0092, -0.016] },
      minLod: 1,
    },
    {
      id: 'buttons',
      parent: 'panel',
      geometry: {
        type: 'grille',
        width: 0.04,
        height: 0.012,
        rows: 1,
        columns: 3,
        holeRadius: 0.0035,
      },
      material: 'trim',
      transform: { position: [0.03, 0.0092, 0.016], rotation: [-90, 0, 0] },
      minLod: 1,
    },
    box('sheet', [0.21, 0.0012, 0.18, 0.0004], 'body', {
      at: [-0.02, TOP + 0.0035, -0.14],
      transform: { rotation: [-5, 0, 0] },
    }),
    box('slot', [0.23, 0.004, 0.014, 0.002], 'panel', {
      at: [-0.02, TOP - 0.0006, -0.148],
      minLod: 1,
    }),
    box('footLeft', [0.03, FOOT, 0.03, 0.004], 'panel', {
      at: [-0.16, FOOT / 2, 0.12],
      contact: true,
      minLod: 1,
    }),
    box('footRight', [0.03, FOOT, 0.03, 0.004], 'panel', {
      at: [0.16, FOOT / 2, 0.12],
      contact: true,
      minLod: 1,
    }),
    box('footBackLeft', [0.03, FOOT, 0.03, 0.004], 'panel', {
      at: [-0.16, FOOT / 2, -0.12],
      contact: true,
      minLod: 1,
    }),
    box('footBackRight', [0.03, FOOT, 0.03, 0.004], 'panel', {
      at: [0.16, FOOT / 2, -0.12],
      contact: true,
      minLod: 1,
    }),
  ],
  anchors: [
    {
      kind: 'screen',
      id: 'display',
      parent: 'panel',
      position: [-0.026, 0.0097, 0],
      width: 0.05,
      height: 0.028,
    },
    { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, TOP + 0.05, 0] },
    { kind: 'hit', id: 'bodyHit', position: [0, (TOP + 0.01) / 2, 0], size: [W, TOP + 0.01, D] },
  ],
  channels: [
    look('screenTint', ['screen', 'colour'], ['power', { true: READOUT }]),
    look('screenFault', ['screen', 'colour'], ['fault', { true: FAULT }]),
    ...emitterChannels('screen', ['power', { true: 1.1 }]),
    look('ledShow', ['led', 'opacity'], ['power', { true: 1, false: 0 }]),
    look('ledHide', ['led', 'opacity'], ['online', { false: 0 }]),
    look('ledFault', ['led', 'colour'], ['fault', { true: FAULT }]),
    look('ledBusy', ['led', 'colour'], ['phase', { printing: HEAT }]),
    look('ledGlow', ['led', 'emissive'], ['power', { true: 0.9 }]),
    pulse('ledPulse', ['led', 'emissive'], ['phase', { printing: 1.6 }], [1, 0.6]),
    ...emitterChannels('led'),
    look('sheetShow', ['sheet', 'opacity'], ['phase', { printing: 1, done: 1, idle: 0 }]),
    {
      id: 'sheetFeed',
      target: 'sheet',
      property: 'translate',
      axis: 'z',
      source: 'progress',
      map: { type: 'linear', in: [0, 1], out: [0, 0.08], clamp: true },
      motion: { type: 'pose', easeMs: 500 },
      reduced: 'hold',
    },
  ],
  states: {
    off: { power: false, online: true, phase: 'idle', progress: 0 },
    idle: { power: true, online: true, phase: 'idle', progress: 0 },
    printing: { power: true, online: true, phase: 'printing', progress: 0.45 },
    done: { power: true, online: true, phase: 'done', progress: 1 },
    fault: { power: true, online: true, phase: 'idle', fault: true },
    offline: { online: false },
  },
};
