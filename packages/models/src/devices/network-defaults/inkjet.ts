import type { ModelSpec } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { box, part } from '../../helpers/geometry';
import {
  ACCENT,
  FAULT,
  HEAT,
  PRIMARY,
  WARNING,
  house,
  leaf,
  look,
  pulse,
  ramp,
  shot,
  whenAll,
} from '../energy/kit';

const W = 0.42;
const D = 0.3;
const FOOT = 0.006;
const BODY_H = 0.11;
const LID_H = 0.03;
const TOP = FOOT + BODY_H + LID_H;
const FRONT = D / 2;
const SLOT_Y = FOOT + 0.05;
const FEED_H = 0.13;
const HEIGHT = TOP + FEED_H * 0.9;
const SCREEN = '#22304F';
const FEET = [
  [-0.17, 0.11],
  [0.17, 0.11],
  [-0.17, -0.11],
  [0.17, -0.11],
] as const;

const PRINTING = whenAll(leaf('phase', 'eq', 'printing'));

export const INKJET_PRINTER_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.printer.inkjet',
  version: '1.0.0',
  title: 'Inkjet printer',
  category: 'printer',
  family: 'printer',
  footprint: { width: W, depth: D + 0.1, height: HEIGHT },
  framing: house('body', 30, 22),
  shots: [
    shot('print', PRINTING, 'sheet', { zoom: 1.2, yaw: 16, pitch: 16, loopS: 3, stillAt: 1.5 }),
  ],
  meta: {
    names: {
      display: 'Inkjet printer',
      synonyms: [
        'printer',
        'home printer',
        'all in one printer',
        'photo printer',
        'ink tank printer',
      ],
    },
    sizeClass: 'medium',
    variants: ['white', 'graphite'],
  },
  materials: {
    body: { finish: 'matte-white' },
    trim: { finish: 'graphite' },
    panel: { finish: 'satin-black', roughness: 0.1, clearcoat: 0.9 },
    accent: ACCENT,
  },
  finishes: {
    white: {},
    graphite: { body: { finish: 'graphite' }, trim: { finish: 'satin-black' } },
  },
  defaultFinish: 'white',
  parts: [
    box('body', [W, BODY_H, D, 0.016], 'body', { at: [0, FOOT + BODY_H / 2, 0] }),
    box('lid', [W - 0.006, LID_H, D - 0.012, 0.012], 'body', {
      at: [0, FOOT + BODY_H + LID_H / 2, -0.004],
    }),
    box('seam', [W + 0.001, 0.0026, D + 0.001, 0.0011], 'trim', {
      at: [0, FOOT + BODY_H, 0],
      minLod: 1,
    }),
    box('slot', [0.27, 0.012, 0.004, 0.003], 'panel', { at: [0, SLOT_Y, FRONT + 0.0004] }),
    box('outTray', [0.25, 0.004, 0.1, 0.0018], 'trim', {
      at: [0, SLOT_Y - 0.012, FRONT + 0.048],
    }),
    box('trayStop', [0.06, 0.012, 0.004, 0.0016], 'trim', {
      at: [0, SLOT_Y - 0.007, FRONT + 0.096],
      minLod: 1,
    }),
    box('sheet', [0.21, 0.0012, 0.12, 0.0004], 'body', {
      at: [0, SLOT_Y - 0.0085, FRONT + 0.02],
    }),
    box('cassette', [W - 0.08, 0.03, 0.004, 0.006], 'trim', {
      at: [0, FOOT + 0.02, FRONT + 0.0006],
      minLod: 1,
    }),
    box('feedTray', [0.24, FEED_H, 0.005, 0.0022], 'trim', {
      at: [0, TOP + FEED_H / 2 - 0.02, -FRONT + 0.012],
      transform: { rotation: [-22, 0, 0] },
    }),
    box('feedSheets', [0.21, FEED_H * 0.78, 0.004, 0.0008], 'body', {
      at: [0, 0.004, 0.0046],
      parent: 'feedTray',
      minLod: 1,
    }),
    box('panel', [0.12, 0.016, 0.054, 0.006], 'panel', {
      at: [0.13, TOP - 0.004, FRONT - 0.032],
      transform: { rotation: [-24, 0, 0] },
    }),
    part(
      'screen',
      { type: 'roundedPlane', width: 0.05, height: 0.026, radius: 0.002, segments: 4 },
      'panel',
      { parent: 'panel', transform: { position: [-0.022, 0.0084, 0], rotation: [-90, 0, 0] } },
    ),
    part(
      'buttons',
      { type: 'grille', width: 0.036, height: 0.01, rows: 1, columns: 3, holeRadius: 0.003 },
      'trim',
      { parent: 'panel', transform: { position: [0.032, 0.0084, 0.012], rotation: [-90, 0, 0] } },
    ),
    {
      id: 'led',
      parent: 'panel',
      geometry: { type: 'sphere', radius: 0.0024, segments: 12 },
      material: 'accent',
      transform: { position: [0.044, 0.0084, -0.014] },
      minLod: 1,
    },
    box('inkBar', [0.05, 0.0016, 0.004, 0.0007], 'accent', {
      at: [-0.022, 0.0088, 0.019],
      parent: 'panel',
      minLod: 1,
    }),
    ...FEET.map(([x, z], index) =>
      box(`foot${String(index)}`, [0.03, FOOT, 0.03, 0.0026], 'panel', {
        at: [x, FOOT / 2, z],
        contact: true,
        minLod: 1,
      }),
    ),
  ],
  anchors: [
    {
      kind: 'screen',
      id: 'display',
      parent: 'panel',
      position: [-0.022, 0.0088, 0],
      width: 0.05,
      height: 0.026,
    },
    {
      kind: 'emitter',
      id: 'panelLight',
      parent: 'panel',
      position: [0, 0.02, 0],
      color: PRIMARY,
      intensity: 0.2,
      radius: 0.1,
    },
    { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, HEIGHT + 0.04, 0] },
    { kind: 'hit', id: 'tap', position: [0, HEIGHT / 2, 0.02], size: [W, HEIGHT, D + 0.1] },
  ],
  channels: [
    look('screenTint', ['screen', 'colour'], ['power', { true: SCREEN }]),
    look('screenLit', ['screen', 'emissive'], ['power', { true: 0.9, false: 0 }]),
    look('screenOffline', ['screen', 'emissive'], ['online', { false: 0 }], 450),
    look('ledShow', ['led', 'opacity'], ['online', { true: 1, false: 0 }]),
    look('ledLit', ['led', 'emissive'], ['power', { true: 0.9, false: 0 }]),
    look('ledOffline', ['led', 'emissive'], ['online', { false: 0 }], 450),
    look('ledBusy', ['led', 'colour'], ['phase', { printing: HEAT }]),
    look('ledFault', ['led', 'colour'], ['fault', { true: FAULT }]),
    pulse('ledPulse', ['led', 'emissive'], ['phase', { printing: 1.6 }], [1, 0.6]),
    ramp('inkLevel', ['inkBar', 'scale', 'x'], ['inkLevels', [0, 1], [0.08, 1]]),
    look('inkShow', ['inkBar', 'opacity'], ['power', { true: 1, false: 0 }]),
    look('inkLit', ['inkBar', 'emissive'], ['power', { true: 0.8, false: 0 }]),
    look('inkLow', ['inkBar', 'colour'], ['fault', { true: WARNING }]),
    look('inkOffline', ['inkBar', 'opacity'], ['online', { false: 0 }], 450),
    look('sheetShow', ['sheet', 'opacity'], ['phase', { printing: 1, done: 1, idle: 0 }]),
    look('sheetOffline', ['sheet', 'opacity'], ['online', { false: 0 }], 450),
    ramp('sheetFeed', ['sheet', 'translate', 'z'], ['progress', [0, 1], [-0.03, 0.04]], 500),
    ...emitterChannels('panelLight', ['power', { true: 0.4 }]),
  ],
  states: {
    off: { power: false, online: true, phase: 'idle', progress: 0, inkLevels: 0.7 },
    idle: { power: true, online: true, phase: 'idle', progress: 0, inkLevels: 0.7 },
    printing: { power: true, online: true, phase: 'printing', progress: 0.45, inkLevels: 0.7 },
    done: { power: true, online: true, phase: 'done', progress: 1, inkLevels: 0.65 },
    fault: { power: true, online: true, phase: 'idle', fault: true, inkLevels: 0.1 },
    offline: { online: false },
  },
};
