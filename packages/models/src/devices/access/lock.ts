import type { ModelSpec } from '@smarteverything/domain';
import {
  ACCENT,
  CHARGE,
  WARNING,
  anchorsOf,
  house,
  leaf,
  look,
  pulse,
  puck,
  shot,
  status,
  whenAll,
} from '../energy/kit';
import { box, part } from '../../helpers/geometry';

const PLATE = 0.064;
const HEIGHT = 0.19;
const DEPTH = 0.026;
const FRONT = DEPTH;
const CENTRE_Y = 0.07;
const KEY_Y = 0.145;

export const DEADBOLT_LOCK_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.lock.deadbolt',
  version: '1.0.0',
  title: 'Smart deadbolt',
  category: 'security',
  family: 'lock',
  footprint: { width: PLATE, depth: DEPTH, height: HEIGHT },
  framing: house('knob', 22, 12),
  shots: [
    shot('turning', whenAll(leaf('locked', 'eq', true)), 'knob', {
      zoom: 1.45,
      yaw: 16,
      pitch: 12,
      loopS: 2,
      stillAt: 1,
    }),
  ],
  meta: {
    names: {
      display: 'Smart deadbolt',
      synonyms: ['smart lock', 'door lock', 'deadbolt', 'keypad lock', 'electronic lock'],
    },
    sizeClass: 'small',
    variants: ['satin-nickel', 'black'],
  },
  materials: {
    body: { finish: 'brushed-aluminium' },
    face: { finish: 'satin-black', roughness: 0.14, clearcoat: 1 },
    knob: { finish: 'graphite' },
    accent: { ...ACCENT, color: CHARGE },
  },
  finishes: {
    'satin-nickel': {},
    black: { body: { finish: 'satin-black' }, knob: { finish: 'satin-black' } },
  },
  defaultFinish: 'satin-nickel',
  parts: [
    box('plate', [PLATE, HEIGHT, DEPTH, 0.02], 'body', {
      at: [0, HEIGHT / 2, DEPTH / 2],
      contact: true,
    }),
    box('keypad', [0.044, 0.05, 0.0016, 0.008], 'face', {
      at: [0, KEY_Y - HEIGHT / 2, FRONT / 2 + 0.0004],
      parent: 'plate',
    }),
    part(
      'keys',
      { type: 'grille', width: 0.032, height: 0.036, rows: 4, columns: 3, holeRadius: 0.0034 },
      'knob',
      {
        parent: 'plate',
        transform: { position: [0, KEY_Y - HEIGHT / 2, FRONT / 2 + 0.0016] },
        minLod: 1,
      },
    ),
    puck('rose', [0.0265, 0.006, 0.0022], 'body', {
      at: [0, CENTRE_Y - HEIGHT / 2, FRONT / 2 + 0.0026],
      parent: 'plate',
      transform: { rotation: [90, 0, 0] },
    }),
    part(
      'ring',
      { type: 'ring', innerRadius: 0.0215, outerRadius: 0.0245, segments: 64 },
      'accent',
      {
        parent: 'plate',
        transform: { position: [0, CENTRE_Y - HEIGHT / 2, FRONT / 2 + 0.0062] },
      },
    ),
    puck('hub', [0.0165, 0.012, 0.004], 'knob', {
      at: [0, CENTRE_Y - HEIGHT / 2, FRONT / 2 + 0.0108],
      parent: 'plate',
      transform: { rotation: [90, 0, 0] },
    }),
    box('knob', [0.054, 0.015, 0.01, 0.0065], 'knob', {
      at: [0, CENTRE_Y - HEIGHT / 2, FRONT / 2 + 0.0185],
      parent: 'plate',
    }),
    box('led', [0.008, 0.0026, 0.0014, 0.0012], 'accent', {
      at: [0, KEY_Y - HEIGHT / 2 + 0.032, FRONT / 2 + 0.001],
      parent: 'plate',
      minLod: 1,
    }),
  ],
  anchors: anchorsOf([PLATE, HEIGHT, DEPTH], 'wall'),
  channels: [
    {
      id: 'knobTurn',
      target: 'knob',
      property: 'rotate',
      axis: 'z',
      source: 'locked',
      map: { type: 'enum', table: { true: 90, false: 0 } },
      motion: { type: 'pose', easeMs: 600 },
      reduced: 'hold',
    },
    look('ringShow', ['ring', 'opacity'], ['online', { true: 1, false: 0 }]),
    look('ringLit', ['ring', 'emissive'], ['online', { true: 1, false: 0 }]),
    look('ringOpen', ['ring', 'colour'], ['locked', { false: WARNING }]),
    pulse('ringOpenBeat', ['ring', 'emissive'], ['locked', { false: 1.5 }], [2, 0.5]),
    look('ringFault', ['ring', 'colour'], ['fault', { true: '#F2564E' }]),
    ...status('led'),
  ],
  states: {
    locked: { locked: true, online: true },
    unlocked: { locked: false, online: true },
    fault: { locked: true, online: true, fault: true },
    lowBattery: { locked: true, online: true, batteryLow: true },
    offline: { online: false },
  },
};
