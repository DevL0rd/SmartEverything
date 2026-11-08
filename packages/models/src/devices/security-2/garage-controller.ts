import type { ModelSpec } from '@smarteverything/domain';
import { box } from '../../helpers/geometry';
import { disc, FAULT, look, OK, pulse, WARM } from './kit';

const HOUSE = { yaw: 20, pitch: 10, fov: 28, padding: 0.12, focus: 'button' } as const;
const W = 0.078;
const H = 0.118;
const D = 0.02;
const FACE = D;

export const GARAGE_CONTROLLER_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.garage.controller',
  version: '1.0.0',
  title: 'Garage door controller',
  category: 'security',
  family: 'switch',
  footprint: { width: W, depth: D, height: H },
  framing: {
    tile: { ...HOUSE, padding: 0.06 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.18, pitch: 14 },
  },
  shots: [
    {
      id: 'press',
      when: {
        anyOf: [
          { allOf: [{ signal: 'pressed', op: 'ne', value: 'none' }] },
          { allOf: [{ signal: 'door', op: 'eq', value: 'open' }] },
        ],
      },
      focus: 'button',
      zoom: 1.5,
      yaw: 12,
      pitch: 8,
      easeMs: 700,
      loopS: 1,
      symmetry: 360,
      stillAt: 0,
    },
  ],
  meta: {
    names: {
      display: 'Garage door controller',
      synonyms: ['garage opener', 'garage door opener', 'garage wall button', 'garage remote'],
    },
    sizeClass: 'small',
    variants: ['white', 'black'],
  },
  materials: {
    body: { finish: 'matte-white' },
    face: { finish: 'graphite' },
    key: { finish: 'rubber' },
    accent: { color: OK, roughness: 0.3, opacity: 0 },
  },
  finishes: {
    white: {},
    black: { body: { finish: 'satin-black' }, face: { finish: 'satin-black' } },
  },
  defaultFinish: 'white',
  parts: [
    box('shell', [W, H, D, 0.009], 'body', { at: [0, H / 2, D / 2], contact: true }),
    box('face', [W - 0.012, H - 0.012, 0.0016, 0.006], 'face', {
      at: [0, 0, FACE / 2],
      parent: 'shell',
    }),
    box('seam', [W - 0.004, 0.0008, 0.0012, 0.0004], 'face', {
      at: [0, H / 2 - 0.0225, FACE / 2 - 0.0002],
      parent: 'shell',
      minLod: 2,
    }),
    disc('keyBed', [0.0245, 0.0016, 0.0006], 'body', {
      at: [0, -0.017, FACE / 2 + 0.0012],
      parent: 'shell',
      minLod: 1,
    }),
    disc('button', [0.0215, 0.0072, 0.0026], 'key', {
      at: [0, -0.017, FACE / 2 + 0.0034],
      parent: 'shell',
    }),
    {
      id: 'ring',
      parent: 'shell',
      geometry: { type: 'ring', innerRadius: 0.0228, outerRadius: 0.0262, segments: 64 },
      material: 'accent',
      transform: { position: [0, -0.017, FACE / 2 + 0.0027] },
      minLod: 1,
    },
    {
      id: 'status',
      parent: 'shell',
      geometry: { type: 'roundedPlane', width: 0.034, height: 0.005, radius: 0.0025, segments: 8 },
      material: 'accent',
      transform: { position: [0, 0.036, FACE / 2 + 0.0012] },
      minLod: 1,
    },
    disc('door', [0.0045, 0.0008, 0.0003], 'key', {
      at: [0, 0.048, FACE / 2 + 0.0009],
      parent: 'shell',
      minLod: 2,
    }),
  ],
  anchors: [
    { kind: 'mount', id: 'wall', position: [0, 0, 0], mount: 'wall' },
    { kind: 'label', id: 'pin', position: [0, H + 0.03, 0.01] },
    { kind: 'hit', id: 'bodyHit', position: [0, H / 2, D / 2], size: [W, H, D] },
  ],
  channels: [
    look('ringShow', ['ring', 'opacity'], ['online', { true: 1, false: 0 }]),
    look('ringGlow', ['ring', 'emissive'], ['online', { true: 0.7, false: 0 }]),
    pulse(
      'ringPress',
      ['ring', 'emissive'],
      ['pressed', { single: 1.8, double: 1.8, long: 1.8 }],
      [0.8, 0.6],
    ),
    look('statusShow', ['status', 'opacity'], ['online', { true: 1, false: 0 }]),
    look('statusClosed', ['status', 'colour'], ['door', { closed: OK, locked: OK, open: WARM }]),
    look('statusFault', ['status', 'colour'], ['fault', { true: FAULT }]),
    look('statusGlow', ['status', 'emissive'], ['online', { true: 0.9, false: 0 }]),
    pulse('statusOpen', ['status', 'emissive'], ['door', { open: 1.4 }], [2, 0.4]),
    {
      id: 'buttonPress',
      target: 'button',
      property: 'translate',
      axis: 'z',
      source: 'pressed',
      map: { type: 'enum', table: { single: -0.0026, double: -0.0026, long: -0.0026 } },
      motion: { type: 'pose', easeMs: 120 },
      reduced: 'hold',
    },
  ],
  states: {
    closed: { online: true, door: 'closed', pressed: 'none' },
    open: { online: true, door: 'open', pressed: 'none' },
    pressed: { online: true, door: 'closed', pressed: 'single' },
    fault: { online: true, door: 'closed', fault: true },
    offline: { online: false },
  },
};
