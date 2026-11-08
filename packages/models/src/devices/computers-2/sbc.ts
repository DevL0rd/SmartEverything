import type { ModelSpec } from '@smarteverything/domain';
import { box } from '../../helpers/geometry';
import { HEAT, look, pulse } from './kit';

const HOUSE = { yaw: 30, pitch: 32, fov: 28, padding: 0.12, focus: 'soc' } as const;
const W = 0.085;
const D = 0.056;
const PCB = 0.0016;
const PCB_Y = 0.0032;
const TOP = PCB_Y + PCB / 2;

export const SBC_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.computer.sbc',
  version: '1.0.0',
  title: 'Single-board computer',
  category: 'computer',
  family: 'computer',
  footprint: { width: W, depth: D, height: 0.0195 },
  framing: {
    tile: { ...HOUSE, padding: 0.06 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.12, pitch: 36 },
  },
  shots: [
    {
      id: 'run',
      when: { anyOf: [{ allOf: [{ signal: 'power', op: 'eq', value: true }] }] },
      focus: 'soc',
      zoom: 1.2,
      yaw: 8,
      pitch: 6,
      easeMs: 800,
      loopS: 2,
      symmetry: 360,
      stillAt: 0,
    },
  ],
  meta: {
    names: {
      display: 'Single-board computer',
      synonyms: ['sbc', 'raspberry pi style board', 'dev board', 'micro computer', 'pi'],
    },
    sizeClass: 'small',
    variants: ['green', 'black'],
  },
  materials: {
    board: { color: '#1F6B4A', roughness: 0.45, clearcoat: 0.3 },
    metal: { finish: 'brushed-aluminium' },
    chip: { finish: 'satin-black' },
    accent: { color: '#6BE08A', roughness: 0.3, opacity: 0 },
  },
  finishes: {
    green: {},
    black: { board: { color: '#23262C' } },
  },
  defaultFinish: 'green',
  parts: [
    box('board', [W, PCB, D, 0.004], 'board', { at: [0, PCB_Y, 0], contact: true }),
    box('soc', [0.014, 0.0022, 0.014, 0.0008], 'metal', { at: [-0.006, TOP + 0.0011, 0.002] }),
    box('ram', [0.012, 0.0012, 0.01, 0.0005], 'chip', {
      at: [0.012, TOP + 0.0006, 0.002],
      minLod: 1,
    }),
    box('ethernet', [0.021, 0.0135, 0.0165, 0.0008], 'metal', {
      at: [W / 2 - 0.0105, TOP + 0.00675, -0.0085],
    }),
    box('usbStackA', [0.0165, 0.0155, 0.0135, 0.0008], 'metal', {
      at: [W / 2 - 0.0085, TOP + 0.00775, 0.0105],
    }),
    box('usbStackB', [0.0165, 0.0155, 0.0135, 0.0008], 'metal', {
      at: [W / 2 - 0.0085, TOP + 0.00775, 0.0235],
      minLod: 1,
    }),
    box('header', [0.051, 0.0085, 0.005, 0.0006], 'chip', {
      at: [0, TOP + 0.00425, -D / 2 + 0.004],
    }),
    {
      id: 'pins',
      parent: 'header',
      geometry: {
        type: 'grille',
        width: 0.048,
        height: 0.0034,
        rows: 2,
        columns: 20,
        holeRadius: 0.0003,
      },
      material: 'metal',
      transform: { position: [0, 0.00435, 0], rotation: [-90, 0, 0] },
      minLod: 2,
    },
    box('hdmiA', [0.0065, 0.0032, 0.0075, 0.0004], 'metal', {
      at: [-0.0135, TOP + 0.0016, D / 2 - 0.0035],
      minLod: 1,
    }),
    box('hdmiB', [0.0065, 0.0032, 0.0075, 0.0004], 'metal', {
      at: [-0.003, TOP + 0.0016, D / 2 - 0.0035],
      minLod: 1,
    }),
    box('usbC', [0.0088, 0.0032, 0.0073, 0.0004], 'metal', {
      at: [-0.0265, TOP + 0.0016, D / 2 - 0.0035],
      minLod: 1,
    }),
    box('audio', [0.0072, 0.0058, 0.0125, 0.001], 'chip', {
      at: [0.0125, TOP + 0.0029, D / 2 - 0.0065],
      minLod: 1,
    }),
    box('sd', [0.011, 0.0013, 0.012, 0.0004], 'metal', {
      at: [-W / 2 + 0.0055, PCB_Y - 0.0013, 0],
      minLod: 1,
    }),
    {
      id: 'powerLed',
      parent: 'board',
      geometry: { type: 'sphere', radius: 0.0007, segments: 10 },
      material: 'accent',
      transform: { position: [-0.036, 0.0009, 0.021] },
    },
    {
      id: 'activityLed',
      parent: 'board',
      geometry: { type: 'sphere', radius: 0.0007, segments: 10 },
      material: 'accent',
      transform: { position: [-0.036, 0.0009, 0.0185] },
    },
    {
      id: 'heat',
      parent: 'soc',
      geometry: { type: 'roundedPlane', width: 0.012, height: 0.012, radius: 0.001, segments: 4 },
      material: 'accent',
      transform: { position: [0, 0.0012, 0], rotation: [-90, 0, 0] },
      minLod: 1,
    },
  ],
  anchors: [
    { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, 0.04, 0] },
    { kind: 'hit', id: 'bodyHit', position: [0, 0.0097, 0], size: [W, 0.0195, D] },
  ],
  channels: [
    look('powerShow', ['powerLed', 'opacity'], ['power', { true: 1, false: 0 }]),
    look('powerGlow', ['powerLed', 'emissive'], ['power', { true: 1.2, false: 0 }]),
    look('powerTint', ['powerLed', 'colour'], ['power', { true: '#F2564E' }]),
    look('activityShow', ['activityLed', 'opacity'], ['power', { true: 1, false: 0 }]),
    pulse('activityBlink', ['activityLed', 'emissive'], ['power', { true: 1.6 }], [0.8, 0.9]),
    look('heatShow', ['heat', 'opacity'], ['thermal', { heating: 0.5, idle: 0, cooling: 0 }]),
    look('heatTint', ['heat', 'colour'], ['thermal', { heating: HEAT }]),
    look('heatGlow', ['heat', 'emissive'], ['thermal', { heating: 1.2, idle: 0 }]),
  ],
  states: {
    off: { power: false, online: true },
    running: { power: true, online: true, thermal: 'idle' },
    hot: { power: true, online: true, thermal: 'heating' },
    offline: { online: false },
  },
};
