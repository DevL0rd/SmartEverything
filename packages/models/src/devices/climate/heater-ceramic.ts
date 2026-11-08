import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { box, part } from '../../helpers/geometry';
import {
  ACCENT,
  HEAT,
  ball,
  house,
  leaf,
  look,
  pulse,
  puck,
  ramp,
  shot,
  whenAll,
} from '../energy/kit';
import { around, floorAnchors, pivot, powerOff, powered, rod } from './kit';

const WIDTH = 0.2;
const HEIGHT = 0.3;
const DEPTH = 0.14;
const FOOT = 0.022;
const BODY_H = 0.25;
const BODY_Y = FOOT + BODY_H / 2;
const FRONT = DEPTH / 2;
const GRILLE_Y = FOOT + 0.105;
const PANEL_Y = FOOT + BODY_H - 0.035;
const BLADES = 5;

const HEATING = whenAll(leaf('thermal', 'eq', 'heating'));

const BLADE_PARTS: ModelSpecPart[] = around(BLADES, 0, 0).flatMap(([angle], index) => [
  pivot('arm' + String(index), {
    at: [0, 0, 0],
    parent: 'rotor',
    transform: { rotation: [0, 0, angle] },
  }),
  box('blade' + String(index), [0.05, 0.034, 0.003, 0.0014], 'face', {
    at: [0.036, 0, 0],
    parent: 'arm' + String(index),
    transform: { rotation: [14, 0, 0] },
    minLod: 1,
  }),
]);

export const CERAMIC_HEATER_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.heater.ceramic',
  version: '1.0.0',
  title: 'Ceramic heater',
  category: 'climate',
  family: 'heater',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  framing: house('grille', 28, 14),
  shots: [
    shot('heating', HEATING, 'grille', { zoom: 1.45, yaw: 18, pitch: 8, loopS: 1, symmetry: 72 }),
  ],
  meta: {
    names: {
      display: 'Ceramic heater',
      synonyms: ['fan heater', 'space heater', 'electric heater', 'ptc heater', 'room heater'],
    },
    sizeClass: 'small',
    variants: ['white', 'graphite'],
  },
  materials: {
    body: { finish: 'matte-white', clearcoat: 0.4 },
    face: { finish: 'graphite' },
    trim: { finish: 'satin-black' },
    accent: { ...ACCENT, color: HEAT },
  },
  finishes: {
    white: {},
    graphite: { body: { finish: 'graphite' }, face: { finish: 'satin-black' } },
  },
  defaultFinish: 'white',
  parts: [
    box('foot', [WIDTH * 0.9, FOOT, DEPTH * 0.92, 0.008], 'trim', {
      at: [0, FOOT / 2, 0],
      contact: true,
    }),
    box('body', [WIDTH, BODY_H, DEPTH, 0.028], 'body', { at: [0, BODY_Y, 0], segments: 4 }),
    box('well', [0.156, 0.15, 0.01, 0.018], 'trim', { at: [0, GRILLE_Y, FRONT - 0.003] }),
    box('element', [0.13, 0.124, 0.002, 0.012], 'accent', { at: [0, GRILLE_Y, FRONT + 0.0015] }),
    ball('rotor', 0.012, 'face', { at: [0, GRILLE_Y, FRONT + 0.007] }),
    ...BLADE_PARTS,
    part(
      'grille',
      { type: 'slats', count: 9, spacing: 0.0155, width: 0.15, height: 0.006, depth: 0.008 },
      'face',
      { transform: { position: [0, GRILLE_Y, FRONT + 0.017] } },
    ),
    rod('bezelTop', [0.0055, 0.166], 'face', {
      at: [0, GRILLE_Y + 0.078, FRONT + 0.0105],
      transform: { rotation: [0, 0, 90] },
    }),
    rod('bezelLow', [0.0055, 0.166], 'face', {
      at: [0, GRILLE_Y - 0.078, FRONT + 0.0105],
      transform: { rotation: [0, 0, 90] },
    }),
    rod('bezelLeft', [0.0055, 0.156], 'face', { at: [-0.083, GRILLE_Y, FRONT + 0.0105] }),
    rod('bezelRight', [0.0055, 0.156], 'face', { at: [0.083, GRILLE_Y, FRONT + 0.0105] }),
    box('panel', [0.15, 0.044, 0.006, 0.01], 'trim', { at: [0, PANEL_Y, FRONT + 0.001] }),
    pivot('dial', { at: [0.04, PANEL_Y, FRONT + 0.009] }),
    puck('knob', [0.016, 0.014, 0.004], 'face', {
      at: [0, 0, 0],
      parent: 'dial',
      transform: { rotation: [90, 0, 0] },
    }),
    box('pointer', [0.003, 0.011, 0.002, 0.001], 'body', {
      at: [0, 0.008, 0.0075],
      parent: 'dial',
      minLod: 1,
    }),
    puck('mode', [0.011, 0.01, 0.003], 'face', {
      at: [-0.02, PANEL_Y, FRONT + 0.007],
      transform: { rotation: [90, 0, 0] },
      minLod: 1,
      segments: 24,
    }),
    box('led', [0.012, 0.005, 0.002, 0.0012], 'accent', {
      at: [-0.052, PANEL_Y, FRONT + 0.005],
      minLod: 1,
    }),
    part(
      'handle',
      {
        type: 'tube',
        points: [
          [-0.05, 0, 0],
          [-0.042, 0.022, 0],
          [0, 0.03, 0],
          [0.042, 0.022, 0],
          [0.05, 0, 0],
        ],
        radius: 0.008,
        segments: 12,
      },
      'trim',
      { transform: { position: [0, FOOT + BODY_H - 0.004, -0.01] } },
    ),
  ],
  anchors: [
    ...floorAnchors([WIDTH, HEIGHT, DEPTH]),
    {
      kind: 'effect',
      id: 'warmAir',
      position: [0, GRILLE_Y, FRONT + 0.08],
      effect: 'airflow',
      size: 0.24,
    },
    {
      kind: 'emitter',
      id: 'heatLight',
      position: [0, GRILLE_Y, FRONT + 0.04],
      color: HEAT,
      intensity: 0.5,
      radius: 0.35,
    },
  ],
  channels: [
    {
      id: 'rotorSpin',
      target: 'rotor',
      property: 'rotate',
      axis: 'z',
      source: 'speed',
      map: { type: 'speed', in: [0, 1], perSecond: [0.5, 3] },
      motion: { type: 'spin' },
      reduced: 'hold',
    },
    look('elementShow', ['element', 'opacity'], ['thermal', { heating: 1, idle: 0, cooling: 0 }]),
    look(
      'elementLit',
      ['element', 'emissive'],
      ['thermal', { heating: 0.75, idle: 0, cooling: 0 }],
    ),
    pulse('elementGlow', ['element', 'emissive'], ['thermal', { heating: 0.9 }], [2.4, 0.3]),
    ...powerOff('element'),
    look(
      'heatLightLit',
      ['heatLight', 'emissive'],
      ['thermal', { heating: 1, idle: 0, cooling: 0 }],
    ),
    look('heatLightOff', ['heatLight', 'emissive'], ['power', { false: 0 }], 450),
    look('heatLightOffline', ['heatLight', 'emissive'], ['online', { false: 0 }], 450),
    ramp('dialTurn', ['dial', 'rotate', 'z'], ['target', [5, 35], [135, -135]], 600),
    ramp('warmAirShow', ['warmAir', 'opacity'], ['speed', [0, 1], [0, 0.5]]),
    ...powerOff('warmAir'),
    ...powered('led', [1, 0.9]),
  ],
  states: {
    off: { power: false, online: true, speed: 0, thermal: 'idle', target: 20 },
    idle: { power: true, online: true, speed: 0, thermal: 'idle', target: 20 },
    heating: { power: true, online: true, speed: 0.7, thermal: 'heating', target: 24 },
    boost: { power: true, online: true, speed: 1, thermal: 'heating', target: 30 },
    fault: { power: true, online: true, fault: true, speed: 0, thermal: 'idle' },
    offline: { online: false },
  },
};
