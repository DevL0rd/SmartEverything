import type { ModelSpec, ModelSpecChannel } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { box } from '../../helpers/geometry';
import { disc, FAULT, HEAT, look, OK, pivot, pulse, READOUT } from './kit';

const HOUSE = { yaw: 30, pitch: 16, fov: 28, padding: 0.1, focus: 'head' } as const;
const W = 0.385;
const D = 0.39;
const BASE_H = 0.07;
const CAP_H = 0.03;
const BODY_H = 0.46;
const POST_H = BODY_H - BASE_H - CAP_H;
const POST_Y = BASE_H + POST_H / 2;
const BED_Y = 0.1;
const HEAD_Y = 0.3;
const SPOOL_R = 0.075;
const HEIGHT = BODY_H + 2 * SPOOL_R + 0.004;
const PRINTING = { printing: 1 } as const;

function accentLook(
  id: string,
  target: string,
  property: ModelSpecChannel['property'],
  table: Readonly<Record<string, number | string>>,
): ModelSpecChannel {
  return look(id, [target, property], ['phase', table]);
}

export const PRINTER_3D_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.printer.3d',
  version: '1.0.0',
  title: '3D printer',
  category: 'printer',
  family: 'printer',
  footprint: { width: W, depth: D, height: HEIGHT },
  framing: {
    tile: { ...HOUSE, padding: 0.06, focus: 'case' },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.12, pitch: 14 },
  },
  shots: [
    {
      id: 'print',
      when: { anyOf: [{ allOf: [{ signal: 'phase', op: 'eq', value: 'printing' }] }] },
      focus: 'head',
      zoom: 1.5,
      yaw: -10,
      pitch: 8,
      easeMs: 1000,
      loopS: 4,
      symmetry: 360,
      stillAt: 2,
    },
  ],
  meta: {
    names: {
      display: '3D printer',
      synonyms: ['fdm printer', 'enclosed 3d printer', 'filament printer', 'additive printer'],
    },
    sizeClass: 'medium',
    variants: ['graphite', 'white'],
  },
  materials: {
    body: { finish: 'graphite' },
    glass: { finish: 'smoked-acrylic' },
    trim: { finish: 'brushed-aluminium' },
    accent: { color: OK, roughness: 0.3, opacity: 0 },
  },
  finishes: {
    graphite: {},
    white: { body: { finish: 'matte-white' } },
  },
  defaultFinish: 'graphite',
  parts: [
    box('case', [W, BASE_H, D, 0.014], 'body', { at: [0, BASE_H / 2, 0], contact: true }),
    box('cap', [W, CAP_H, D, 0.014], 'body', { at: [0, BODY_H - CAP_H / 2, 0] }),
    box('postFrontLeft', [0.02, POST_H, 0.02, 0.006], 'body', {
      at: [-W / 2 + 0.01, POST_Y, D / 2 - 0.01],
    }),
    box('postFrontRight', [0.02, POST_H, 0.02, 0.006], 'body', {
      at: [W / 2 - 0.01, POST_Y, D / 2 - 0.01],
    }),
    box('postBackLeft', [0.02, POST_H, 0.02, 0.006], 'body', {
      at: [-W / 2 + 0.01, POST_Y, -D / 2 + 0.01],
      minLod: 1,
    }),
    box('postBackRight', [0.02, POST_H, 0.02, 0.006], 'body', {
      at: [W / 2 - 0.01, POST_Y, -D / 2 + 0.01],
      minLod: 1,
    }),
    box('back', [W - 0.03, POST_H, 0.008, 0.002], 'body', {
      at: [0, POST_Y, -D / 2 + 0.014],
    }),
    box('door', [W - 0.034, POST_H, 0.004, 0.003], 'glass', {
      at: [0, POST_Y, D / 2 - 0.004],
    }),
    box('sideLeft', [0.004, POST_H, D - 0.034, 0.002], 'glass', {
      at: [-W / 2 + 0.004, POST_Y, 0],
    }),
    box('sideRight', [0.004, POST_H, D - 0.034, 0.002], 'glass', {
      at: [W / 2 - 0.004, POST_Y, 0],
    }),
    box('bed', [0.25, 0.008, 0.25, 0.003], 'trim', { at: [0, BED_Y, 0] }),
    pivot('printRoot', { at: [0, BED_Y + 0.004, 0] }),
    box('print', [0.07, 0.07, 0.07, 0.012], 'accent', { at: [0, 0.035, 0], parent: 'printRoot' }),
    box('rail', [W - 0.04, 0.012, 0.014, 0.004], 'trim', { at: [0, HEAD_Y, -0.02] }),
    box('head', [0.05, 0.048, 0.044, 0.01], 'body', { at: [0, HEAD_Y - 0.006, 0.02] }),
    {
      id: 'duct',
      parent: 'head',
      geometry: {
        type: 'cylinder',
        height: 0.012,
        topRadius: 0.002,
        bottomRadius: 0.006,
        bevel: 0.0006,
        segments: 20,
      },
      material: 'trim',
      transform: { position: [0, -0.03, 0] },
      minLod: 1,
    },
    {
      id: 'nozzle',
      parent: 'head',
      geometry: { type: 'sphere', radius: 0.0035, segments: 12 },
      material: 'accent',
      transform: { position: [0, -0.0375, 0] },
      minLod: 1,
    },
    {
      id: 'strip',
      geometry: {
        type: 'roundedPlane',
        width: W - 0.07,
        height: 0.006,
        radius: 0.003,
        segments: 6,
      },
      material: 'accent',
      transform: { position: [0, BODY_H - CAP_H - 0.001, D / 2 - 0.03], rotation: [90, 0, 0] },
      minLod: 1,
    },
    {
      id: 'screen',
      geometry: { type: 'roundedPlane', width: 0.07, height: 0.04, radius: 0.004, segments: 5 },
      material: 'glass',
      transform: { position: [0.1, 0.034, D / 2 + 0.0008] },
    },
    disc('spoolRim', [SPOOL_R, 0.05, 0.004], 'body', {
      at: [0, BODY_H + SPOOL_R, -0.08],
      transform: { rotation: [0, 0, 90] },
    }),
    disc('spoolHub', [0.03, 0.054, 0.003], 'trim', {
      at: [0, BODY_H + SPOOL_R, -0.08],
      transform: { rotation: [0, 0, 90] },
      minLod: 1,
    }),
    box('mast', [0.02, 0.04, 0.02, 0.006], 'body', { at: [0, BODY_H + 0.02, -0.08], minLod: 1 }),
  ],
  anchors: [
    {
      kind: 'screen',
      id: 'display',
      position: [0.1, 0.034, D / 2 + 0.001],
      width: 0.07,
      height: 0.04,
    },
    { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, HEIGHT + 0.04, 0] },
    { kind: 'hit', id: 'bodyHit', position: [0, HEIGHT / 2, 0], size: [W, HEIGHT, D] },
  ],
  channels: [
    {
      id: 'headSweep',
      target: 'head',
      property: 'translate',
      axis: 'x',
      source: 'phase',
      map: { type: 'enum', table: PRINTING },
      motion: { type: 'oscillate', limits: [-0.09, 0.09], speed: 0.18 },
      reduced: 'hold',
    },
    {
      id: 'printGrow',
      target: 'printRoot',
      property: 'scale',
      axis: 'y',
      source: 'progress',
      map: { type: 'linear', in: [0, 1], out: [0.02, 1], clamp: true },
      motion: { type: 'pose', easeMs: 600 },
      reduced: 'hold',
    },
    accentLook('printShow', 'print', 'opacity', { printing: 1, done: 1, idle: 0, heating: 0 }),
    accentLook('printTint', 'print', 'colour', { printing: HEAT, done: HEAT }),
    accentLook('printLit', 'print', 'emissive', { printing: 0.25, done: 0.1 }),
    accentLook('nozzleShow', 'nozzle', 'opacity', { printing: 1, heating: 1, idle: 0, done: 0 }),
    accentLook('nozzleTint', 'nozzle', 'colour', { printing: HEAT, heating: HEAT }),
    pulse(
      'nozzleGlow',
      ['nozzle', 'emissive'],
      ['phase', { printing: 1.8, heating: 1.4 }],
      [1.2, 0.5],
    ),
    look('stripShow', ['strip', 'opacity'], ['lamp', { true: 1, false: 0 }]),
    look('stripTint', ['strip', 'colour'], ['lamp', { true: '#E6EAF0' }]),
    look('stripLit', ['strip', 'emissive'], ['lamp', { true: 1.2, false: 0 }]),
    look('stripFault', ['strip', 'colour'], ['fault', { true: FAULT }]),
    look('screenTint', ['screen', 'colour'], ['power', { true: READOUT }]),
    ...emitterChannels('screen', ['power', { true: 1.1 }]),
    ...emitterChannels('strip'),
    ...emitterChannels('nozzle'),
  ],
  states: {
    off: { power: false, online: true, phase: 'idle', progress: 0 },
    idle: { power: true, online: true, phase: 'idle', progress: 0, lamp: true },
    heating: { power: true, online: true, phase: 'heating', progress: 0, lamp: true },
    printing: { power: true, online: true, phase: 'printing', progress: 0.5, lamp: true },
    done: { power: true, online: true, phase: 'done', progress: 1, lamp: true },
    fault: { power: true, online: true, phase: 'idle', fault: true, lamp: true },
    offline: { online: false },
  },
};
