import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { finishSet } from '../../helpers/finishes';
import { box, part } from '../../helpers/geometry';
import { DAYLIGHT, HOUSE, anchorsOf, hingePoses, plane } from '../kitchen-2/look';
import { FRIDGE_MATERIALS, FRIDGE_SHOTS, FRIDGE_STATES, fridgeChannels } from './fridge-parts';

const WIDTH = 0.6;
const HEIGHT = 1.86;
const DEPTH = 0.66;
const BASE = 0.03;
const CAB_D = 0.6;
const BACK = -DEPTH / 2;
const FACE_Z = BACK + CAB_D;
const DOOR_D = 0.06;
const DOOR_H = HEIGHT - BASE - 0.004;
const DOOR_Y = BASE + 0.002 + DOOR_H / 2;
const FRONT = DOOR_D / 2;
const FRAME = { ...HOUSE, pitch: 12, padding: 0.1, focus: 'cabinet' } as const;

const DOOR: ModelSpecPart[] = [
  {
    ...box('door', [WIDTH - 0.004, DOOR_H, DOOR_D, 0.014], 'body', {
      at: [0, DOOR_Y, FACE_Z + DOOR_D / 2],
    }),
    poses: hingePoses(
      [WIDTH / 2, DOOR_Y, FACE_Z + DOOR_D],
      [-(WIDTH - 0.004) / 2, 0, -DOOR_D / 2],
      'y',
      {
        open: 105,
      },
    ),
  },
  box('handle', [0.022, 0.56, 0.03, 0.008], 'trim', {
    at: [-WIDTH / 2 + 0.04, 0.32, FRONT + 0.014],
    parent: 'door',
  }),
  plane('display', [0.1, 0.034, 0.006], 'glass', { at: [0, 0.68, FRONT + 0.0006], parent: 'door' }),
  plane('displayGlow', [0.06, 0.012, 0.003], 'accent', { at: [0, 0, 0.0006], parent: 'display' }),
  ...[0.45, 0.05, -0.35].map((y, index) =>
    box(`bin${String(index + 1)}`, [WIDTH - 0.1, 0.07, 0.05, 0.008], 'glass', {
      at: [0, y, -FRONT - 0.026],
      parent: 'door',
      minLod: 1,
      segments: 3,
    }),
  ),
  box('seam', [WIDTH - 0.04, 0.003, 0.002, 0.001], 'trim', {
    at: [0, -DOOR_H / 2 + 0.03, FRONT + 0.0006],
    parent: 'door',
    minLod: 2,
    segments: 3,
  }),
];

const INTERIOR: ModelSpecPart[] = [
  plane('interior', [WIDTH - 0.05, DOOR_H - 0.06, 0.02], 'accent', {
    at: [0, DOOR_Y, FACE_Z + 0.002],
  }),
  ...[0.55, 0.2, -0.15, -0.45].map((y, index) =>
    box(`shelf${String(index + 1)}`, [WIDTH - 0.07, 0.006, 0.02, 0.002], 'glass', {
      at: [0, DOOR_Y + y, FACE_Z + 0.012],
      minLod: 1,
      segments: 3,
    }),
  ),
  box('crisper', [WIDTH - 0.08, 0.2, 0.012, 0.01], 'glass', {
    at: [0, BASE + 0.16, FACE_Z + 0.008],
    minLod: 1,
  }),
];

const BODY: ModelSpecPart[] = [
  box('cabinet', [WIDTH, HEIGHT - BASE, CAB_D, 0.016], 'body', {
    at: [0, BASE + (HEIGHT - BASE) / 2, BACK + CAB_D / 2],
    contact: true,
  }),
  box('toeKick', [WIDTH - 0.04, BASE, 0.03, 0.004], 'trim', { at: [0, BASE / 2, FACE_Z - 0.02] }),
  part(
    'toeGrille',
    { type: 'slats', count: 2, spacing: 0.009, width: WIDTH - 0.1, height: 0.003, depth: 0.002 },
    'glass',
    { transform: { position: [0, BASE / 2, FACE_Z - 0.004] }, minLod: 1 },
  ),
  ...[-1, 1].map((side) =>
    box(`hingeCap${side < 0 ? 'Low' : 'High'}`, [0.03, 0.012, 0.05, 0.003], 'trim', {
      at: [WIDTH / 2 - 0.02, side < 0 ? BASE - 0.004 : HEIGHT + 0.004, FACE_Z + 0.03],
      minLod: 1,
      segments: 3,
    }),
  ),
];

export const SINGLE_DOOR_FRIDGE_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.fridge.single',
  version: '1.0.0',
  title: 'Fridge',
  category: 'kitchen',
  family: 'generic',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT + 0.01 },
  framing: { tile: FRAME, card: FRAME, hero: { ...FRAME, padding: 0.12 } },
  shots: FRIDGE_SHOTS,
  meta: {
    names: {
      display: 'Fridge',
      synonyms: ['refrigerator', 'larder fridge', 'tall fridge', 'single door fridge', 'cooler'],
    },
    sizeClass: 'tall',
    variants: ['white', 'stainless', 'black'],
  },
  materials: { body: { finish: 'matte-white' }, ...FRIDGE_MATERIALS },
  ...finishSet(
    {
      white: {},
      stainless: {
        body: { finish: 'brushed-aluminium', metalness: 0.55, roughness: 0.42, pattern: 'brushed' },
      },
      black: { body: { finish: 'satin-black' } },
    },
    'white',
  ),
  parts: [...BODY, ...INTERIOR, ...DOOR],
  anchors: [
    {
      kind: 'screen',
      id: 'readout',
      parent: 'display',
      position: [0, 0, 0.001],
      width: 0.1,
      height: 0.034,
    },
    {
      kind: 'emitter',
      id: 'interiorLamp',
      position: [0, DOOR_Y + 0.5, FACE_Z + 0.05],
      color: DAYLIGHT,
      intensity: 0.5,
      radius: 0.4,
    },
    ...anchorsOf([WIDTH, HEIGHT, DEPTH], 'floor'),
  ],
  channels: fridgeChannels(['door']),
  states: FRIDGE_STATES,
};
