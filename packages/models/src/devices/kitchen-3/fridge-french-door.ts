import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { finishSet } from '../../helpers/finishes';
import { box, part } from '../../helpers/geometry';
import { DAYLIGHT, HOUSE, anchorsOf, hingePoses, plane } from '../kitchen-2/look';
import { FRIDGE_MATERIALS, FRIDGE_SHOTS, FRIDGE_STATES, fridgeChannels } from './fridge-parts';

const WIDTH = 0.91;
const HEIGHT = 1.78;
const DEPTH = 0.75;
const BASE = 0.04;
const CAB_D = 0.62;
const BACK = -DEPTH / 2;
const FACE_Z = BACK + CAB_D;
const DOOR_D = 0.075;
const DOOR_W = WIDTH / 2 - 0.003;
const DRAWER_H = 0.6;
const GAP = 0.008;
const DOOR_Y0 = BASE + DRAWER_H + GAP;
const DOOR_H = HEIGHT - DOOR_Y0;
const DOOR_Y = DOOR_Y0 + DOOR_H / 2;
const DOOR_Z = FACE_Z + DOOR_D / 2;
const FRONT = DOOR_D / 2;
const FRAME = { ...HOUSE, pitch: 12, padding: 0.1, focus: 'cabinet' } as const;

function handle(
  id: string,
  parent: string,
  [x, length]: readonly [number, number],
): ModelSpecPart[] {
  return [
    part(
      id,
      {
        type: 'tube',
        points: [
          [0, -length / 2, 0],
          [0, length / 2, 0],
        ],
        radius: 0.012,
        segments: 16,
      },
      'body',
      { parent, transform: { position: [x, 0, FRONT + 0.045] } },
    ),
    ...[-1, 1].map((end) =>
      box(`${id}Post${end < 0 ? 'Low' : 'High'}`, [0.016, 0.02, 0.045, 0.004], 'body', {
        at: [x, end * (length / 2 - 0.03), FRONT + 0.0225],
        parent,
        segments: 3,
      }),
    ),
  ];
}

function door(side: number): ModelSpecPart[] {
  const id = side < 0 ? 'doorLeft' : 'doorRight';
  const hinge = [(side * WIDTH) / 2, DOOR_Y, FACE_Z + DOOR_D] as const;
  return [
    {
      ...box(id, [DOOR_W, DOOR_H, DOOR_D, 0.012], 'body', {
        at: [(side * WIDTH) / 4, DOOR_Y, DOOR_Z],
      }),
      poses: hingePoses(hinge, [(-side * DOOR_W) / 2, 0, -DOOR_D / 2], 'y', { open: side * 105 }),
    },
    ...handle(`${id}Handle`, id, [-side * (DOOR_W / 2 - 0.045), 0.62]),
    box(`${id}Gasket`, [DOOR_W - 0.02, DOOR_H - 0.02, 0.006, 0.004], 'trim', {
      at: [0, 0, -DOOR_D / 2 - 0.002],
      parent: id,
      minLod: 2,
      segments: 3,
    }),
  ];
}

const DISPENSER: ModelSpecPart[] = [
  box('dispenser', [0.2, 0.3, 0.012, 0.012], 'trim', {
    at: [0.03, 0.02, FRONT - 0.002],
    parent: 'doorLeft',
  }),
  box('dispenserPaddle', [0.07, 0.1, 0.012, 0.006], 'body', {
    at: [0, 0.03, 0.008],
    parent: 'dispenser',
    minLod: 1,
    segments: 3,
  }),
  plane('display', [0.16, 0.06, 0.008], 'glass', {
    at: [0.03, 0.25, FRONT + 0.0006],
    parent: 'doorLeft',
  }),
  plane('displayGlow', [0.1, 0.022, 0.004], 'accent', { at: [0, 0, 0.0006], parent: 'display' }),
];

const INTERIOR: ModelSpecPart[] = [
  plane('interior', [WIDTH - 0.06, DOOR_H - 0.07, 0.02], 'accent', {
    at: [0, DOOR_Y, FACE_Z + 0.002],
  }),
  ...[0.25, 0, -0.25].map((y, index) =>
    box(`shelf${String(index + 1)}`, [WIDTH - 0.08, 0.006, 0.02, 0.002], 'glass', {
      at: [0, DOOR_Y + y, FACE_Z + 0.012],
      minLod: 1,
      segments: 3,
    }),
  ),
  box('crisper', [WIDTH - 0.1, 0.16, 0.012, 0.01], 'glass', {
    at: [0, DOOR_Y0 + 0.12, FACE_Z + 0.008],
    minLod: 1,
  }),
];

const BODY: ModelSpecPart[] = [
  box('cabinet', [WIDTH, HEIGHT - BASE, CAB_D, 0.014], 'trim', {
    at: [0, BASE + (HEIGHT - BASE) / 2, BACK + CAB_D / 2],
    contact: true,
  }),
  box('toeKick', [WIDTH - 0.04, BASE, 0.04, 0.004], 'trim', { at: [0, BASE / 2, FACE_Z - 0.03] }),
  part(
    'toeGrille',
    { type: 'slats', count: 3, spacing: 0.009, width: WIDTH - 0.12, height: 0.003, depth: 0.002 },
    'glass',
    { transform: { position: [0, BASE / 2, FACE_Z - 0.009] }, minLod: 1 },
  ),
  box('drawer', [WIDTH - 0.004, DRAWER_H, DOOR_D, 0.012], 'body', {
    at: [0, BASE + DRAWER_H / 2, DOOR_Z],
  }),
  part(
    'drawerHandle',
    {
      type: 'tube',
      points: [
        [-0.32, 0, 0],
        [0.32, 0, 0],
      ],
      radius: 0.012,
      segments: 24,
    },
    'body',
    { parent: 'drawer', transform: { position: [0, DRAWER_H / 2 - 0.06, FRONT + 0.045] } },
  ),
  ...[-1, 1].map((side) =>
    box(`drawerPost${side < 0 ? 'Left' : 'Right'}`, [0.02, 0.016, 0.045, 0.004], 'body', {
      at: [side * 0.29, DRAWER_H / 2 - 0.06, FRONT + 0.0225],
      parent: 'drawer',
      segments: 3,
    }),
  ),
];

export const FRENCH_DOOR_FRIDGE_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.fridge.french-door',
  version: '1.0.0',
  title: 'French door fridge',
  category: 'kitchen',
  family: 'generic',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  framing: { tile: FRAME, card: FRAME, hero: { ...FRAME, padding: 0.12 } },
  shots: FRIDGE_SHOTS,
  meta: {
    names: {
      display: 'French door fridge',
      synonyms: [
        'fridge',
        'refrigerator',
        'fridge freezer',
        'french door refrigerator',
        'american fridge',
      ],
    },
    sizeClass: 'tall',
    variants: ['stainless', 'black', 'white'],
  },
  materials: {
    body: { finish: 'brushed-aluminium', metalness: 0.55, roughness: 0.42, pattern: 'brushed' },
    ...FRIDGE_MATERIALS,
  },
  ...finishSet(
    {
      stainless: {},
      black: { body: { finish: 'satin-black' } },
      white: { body: { finish: 'matte-white' } },
    },
    'stainless',
  ),
  parts: [...BODY, ...INTERIOR, ...door(-1), ...door(1), ...DISPENSER],
  anchors: [
    {
      kind: 'screen',
      id: 'readout',
      parent: 'display',
      position: [0, 0, 0.001],
      width: 0.16,
      height: 0.06,
    },
    {
      kind: 'emitter',
      id: 'interiorLamp',
      position: [0, DOOR_Y + 0.3, FACE_Z + 0.05],
      color: DAYLIGHT,
      intensity: 0.6,
      radius: 0.5,
    },
    ...anchorsOf([WIDTH, HEIGHT, DEPTH], 'floor'),
  ],
  channels: fridgeChannels(['doorLeft', 'doorRight']),
  states: FRIDGE_STATES,
};
