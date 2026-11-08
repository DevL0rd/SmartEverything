import type { ModelSpec } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { box, part } from '../../helpers/geometry';
import {
  ACCENT,
  HEAT,
  anchorsOf,
  cells,
  house,
  leaf,
  look,
  pulse,
  puck,
  shot,
  status,
  whenAll,
} from '../energy/kit';

const RADIUS = 0.235;
const HEIGHT = 1.1;
const PANEL_Y = 0.66;
const FRONT = RADIUS + 0.014;

const HEATING = whenAll(leaf('thermal', 'eq', 'heating'));

const TANK = cells('cell', [5, 'level', true], [0.02, 0.012, 0.0016, 0.0006], (index) => [
  (index - 2) * 0.027,
  PANEL_Y + 0.035,
  FRONT + 0.0128,
]);

export const WATER_HEATER_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.water-heater',
  version: '1.0.0',
  title: 'Water heater',
  category: 'water',
  family: 'heater',
  footprint: { width: RADIUS * 2, depth: RADIUS * 2, height: HEIGHT },
  framing: house('band', 26, 12),
  shots: [
    shot('heating', HEATING, 'band', { zoom: 1.35, yaw: 22, pitch: 8, loopS: 3, stillAt: 1.5 }),
  ],
  meta: {
    names: {
      display: 'Water heater',
      synonyms: ['boiler', 'hot water tank', 'geyser', 'water cylinder', 'immersion heater'],
    },
    sizeClass: 'large',
    variants: ['white', 'graphite'],
  },
  materials: {
    body: { finish: 'matte-white' },
    face: { finish: 'smoked-acrylic', opacity: 1 },
    trim: { finish: 'brushed-aluminium' },
    accent: ACCENT,
  },
  finishes: {
    white: {},
    graphite: { body: { finish: 'graphite' } },
  },
  defaultFinish: 'white',
  parts: [
    puck('tank', [RADIUS, 0.92, 0.06], 'body', { at: [0, 0.5, 0], contact: true }),
    puck('plinth', [RADIUS * 0.9, 0.045, 0.012], 'trim', { at: [0, 0.0225, 0], minLod: 1 }),
    puck('cap', [RADIUS * 0.82, 0.04, 0.014], 'trim', { at: [0, 0.98, 0] }),
    puck('nippleLeft', [0.014, 0.085, 0.004], 'trim', { at: [-0.075, 1.04, 0], minLod: 1 }),
    puck('nippleRight', [0.014, 0.085, 0.004], 'trim', { at: [0.075, 1.04, 0], minLod: 1 }),
    part('band', { type: 'torus', radius: RADIUS + 0.002, tube: 0.0065, segments: 48 }, 'accent', {
      transform: { position: [0, 0.2, 0], rotation: [90, 0, 0] },
    }),
    box('panel', [0.17, 0.22, 0.02, 0.028], 'face', { at: [0, PANEL_Y, RADIUS + 0.004] }),
    box('readout', [0.1, 0.034, 0.0016, 0.012], 'accent', {
      at: [0, PANEL_Y + 0.07, FRONT + 0.0012],
    }),
    ...TANK.parts,
    puck('knob', [0.034, 0.022, 0.008], 'trim', {
      at: [0, PANEL_Y - 0.05, FRONT + 0.006],
      transform: { rotation: [90, 0, 0] },
      minLod: 1,
    }),
    box('led', [0.014, 0.006, 0.0016, 0.0026], 'accent', {
      at: [0, PANEL_Y - 0.098, FRONT + 0.0012],
      minLod: 1,
    }),
  ],
  anchors: [
    ...anchorsOf([RADIUS * 2, HEIGHT, RADIUS * 2], 'floor'),
    { kind: 'effect', id: 'steam', position: [0, HEIGHT, 0], effect: 'steam', size: 0.2 },
    {
      kind: 'emitter',
      id: 'heatLight',
      position: [0, 0.2, RADIUS],
      color: HEAT,
      intensity: 0.5,
      radius: 0.5,
    },
  ],
  channels: [
    look('bandHeating', ['band', 'opacity'], ['thermal', { heating: 1, idle: 0.0, cooling: 0 }]),
    look('bandTint', ['band', 'colour'], ['thermal', { heating: HEAT }]),
    pulse('bandPulse', ['band', 'emissive'], ['thermal', { heating: 1.5 }], [3, 0.9]),
    look('bandOff', ['band', 'opacity'], ['power', { false: 0 }], 450),
    look('bandOffline', ['band', 'opacity'], ['online', { false: 0 }], 450),
    look('readoutOn', ['readout', 'opacity'], ['power', { true: 0.9, false: 0 }]),
    look('readoutLit', ['readout', 'emissive'], ['power', { true: 0.8, false: 0 }]),
    look('readoutHeat', ['readout', 'colour'], ['thermal', { heating: HEAT }]),
    look('readoutOffline', ['readout', 'opacity'], ['online', { false: 0 }], 450),
    ...status('led'),
    ...TANK.channels,
    ...emitterChannels('heatLight', ['thermal', { heating: 1, idle: 0, cooling: 0 }]),
  ],
  states: {
    off: { power: false, online: true, thermal: 'idle', level: 0 },
    hot: { power: true, online: true, thermal: 'idle', level: 1 },
    heating: { power: true, online: true, thermal: 'heating', level: 0.4 },
    low: { power: true, online: true, thermal: 'idle', level: 0.15 },
    fault: { power: true, online: true, fault: true, thermal: 'idle', level: 0.5 },
    offline: { online: false },
  },
};
