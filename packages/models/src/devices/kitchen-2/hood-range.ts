import type { ModelSpec, ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
import { finishSet } from '../../helpers/finishes';
import { box, grille, part } from '../../helpers/geometry';
import { extrudePath, pathBuilder } from '../../helpers/path';
import {
  DAYLIGHT,
  GLOW,
  HOUSE,
  PRIMARY,
  WARNING,
  anchorsOf,
  glow,
  halo,
  look,
  offline,
  plane,
  pulse,
  ramp,
} from './look';

const WIDTH = 0.6;
const DEPTH = 0.5;
const CANOPY_H = 0.06;
const NECK_H = 0.06;
const CHIMNEY_W = 0.26;
const CHIMNEY_D = 0.24;
const CHIMNEY_H = 0.56;
const HEIGHT = CANOPY_H + NECK_H + CHIMNEY_H;
const BACK = -DEPTH / 2;
const CHIMNEY_Z = BACK + CHIMNEY_D / 2;
const FRONT = DEPTH / 2;
const DOWN: [number, number, number] = [90, 0, 0];
const W = { param: 'width' } as const;
const FRAME = { ...HOUSE, yaw: 22, pitch: 10, padding: 0.1, focus: 'canopy' } as const;

const NECK = extrudePath(
  pathBuilder(-0.21, 0)
    .line(0.21, 0)
    .line(CHIMNEY_W / 2, NECK_H)
    .line(-CHIMNEY_W / 2, NECK_H)
    .close(),
  CHIMNEY_D,
  0.003,
);

const LEDS = [0, 1, 2].map((index): ModelSpecPart =>
  part(
    `speedLed${String(index + 1)}`,
    { type: 'roundedPlane', width: 0.008, height: 0.003, radius: 0.0012, segments: 3 },
    'accent',
    { parent: 'controls', transform: { position: [0.02 + index * 0.014, 0.008, 0.0042] } },
  ),
);

const KEYS = [0, 1, 2, 3].map((index): ModelSpecPart =>
  part(
    `key${String(index + 1)}`,
    { type: 'ring', innerRadius: 0.0042, outerRadius: 0.0054, segments: 24 },
    'body',
    {
      parent: 'controls',
      transform: { position: [-0.05 + index * 0.022, -0.004, 0.0042] },
      minLod: 1,
    },
  ),
);

function lamp(side: number): ModelSpecPart[] {
  const name = side < 0 ? 'lampLeft' : 'lampRight';
  const x = { param: 'width', scale: side * 0.3 };
  return [
    part(
      name,
      {
        type: 'cylinder',
        height: 0.003,
        topRadius: 0.022,
        bottomRadius: 0.022,
        bevel: 0.001,
        segments: 32,
      },
      'accent',
      {
        parent: 'canopy',
        transform: { position: [x, -CANOPY_H / 2 - 0.0012, 0.14] },
      },
    ),
    part(`${name}Halo`, { type: 'glow', width: 0.16, height: 0.16, segments: 24 }, 'accent', {
      parent: 'canopy',
      transform: { position: [x, -CANOPY_H / 2 - 0.004, 0.14], rotation: DOWN },
      minLod: 1,
    }),
  ];
}

const PARTS: ModelSpecPart[] = [
  {
    id: 'canopy',
    geometry: {
      type: 'roundedBox',
      width: W,
      height: CANOPY_H,
      depth: DEPTH,
      radius: 0.006,
      segments: 4,
    },
    material: 'body',
    transform: { position: [0, CANOPY_H / 2, 0] },
  },
  part('neck', NECK, 'body', { transform: { position: [0, CANOPY_H, CHIMNEY_Z] } }),
  box('chimney', [CHIMNEY_W, CHIMNEY_H, CHIMNEY_D, 0.005], 'body', {
    at: [0, CANOPY_H + NECK_H + CHIMNEY_H / 2, CHIMNEY_Z],
  }),
  box('chimneySeam', [CHIMNEY_W + 0.002, 0.003, CHIMNEY_D + 0.002, 0.001], 'trim', {
    at: [0, CANOPY_H + NECK_H + CHIMNEY_H * 0.55, CHIMNEY_Z],
    minLod: 2,
    segments: 3,
  }),
  box('controls', [0.16, 0.03, 0.008, 0.003], 'trim', {
    at: [0, 0, FRONT + 0.0005],
    parent: 'canopy',
  }),
  ...KEYS,
  ...LEDS,
  plane('lightBar', [0.5, 0.004, 0.0015], 'accent', {
    at: [0, -CANOPY_H / 2 + 0.006, FRONT + 0.0008],
    parent: 'canopy',
    transform: { scale: [{ param: 'width', scale: 1 / WIDTH }, 1, 1] },
  }),
  ...[-1, 1].map((side) =>
    part(
      side < 0 ? 'filterLeft' : 'filterRight',
      grille({ width: 0.24, height: 0.3, rows: 9, columns: 8, holeRadius: 0.0055 }),
      'filter',
      {
        parent: 'canopy',
        transform: {
          position: [{ param: 'width', scale: side * 0.21 }, -CANOPY_H / 2 - 0.0006, -0.02],
          rotation: DOWN,
        },
        minLod: 1,
      },
    ),
  ),
  ...lamp(-1),
  ...lamp(1),
  halo('underHalo', [0.5, 0.4], {
    at: [0, -CANOPY_H / 2 - 0.006, 0.06],
    parent: 'canopy',
    transform: { rotation: DOWN },
    minLod: 1,
  }),
];

function speed(index: number): ModelSpecChannel[] {
  const id = `speedLed${String(index + 1)}`;
  const from = index / 3;
  return [
    ramp(`${id}Show`, [id, 'opacity'], ['speed', [from, from + 0.04], [0, 1]]),
    ramp(`${id}Lit`, [id, 'emissive'], ['speed', [from, from + 0.04], [0, 1.1]]),
    look(`${id}Tint`, [id, 'colour'], ['online', { true: PRIMARY }], 250),
    look(`${id}Alert`, [id, 'colour'], ['alarm', { true: WARNING }], 250),
    ...offline(id),
  ];
}

const LIGHTS = ['lampLeft', 'lampRight', 'lampLeftHalo', 'lampRightHalo', 'underHalo', 'lightBar'];

const CHANNELS: ModelSpecChannel[] = [
  ...LIGHTS.flatMap((id) => [
    ...glow(id, id, [
      'lamp',
      { true: id.endsWith('Halo') ? 0.55 : 1, false: 0 },
      { true: id.endsWith('Halo') ? 0.8 : 1.4, false: 0 },
    ]),
    look(`${id}Tint`, [id, 'colour'], ['lamp', { true: DAYLIGHT }], 250),
    ...offline(id),
  ]),
  look('hobLightLit', ['hobLight', 'emissive'], ['lamp', { true: 0.8, false: 0 }]),
  look('hobLightOffline', ['hobLight', 'emissive'], ['online', { false: 0 }], 450),
  ...[0, 1, 2].flatMap(speed),
  pulse('filterAlert', ['speedLed1', 'emissive'], ['alarm', { true: 0.9 }], [1.5, 0.4]),
  ramp('airflowShow', ['airflow', 'opacity'], ['speed', [0, 1], [0, 0.65]]),
  ramp('airflowRate', ['airflow', 'scale'], ['speed', [0, 1], [0.5, 1.2]]),
];

export const RANGE_HOOD_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.hood.range',
  version: '1.0.0',
  title: 'Range hood',
  category: 'kitchen',
  family: 'generic',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  size: { width: { param: 'width', extra: 0, resizes: true } },
  framing: {
    tile: FRAME,
    card: { ...FRAME, pitch: 6 },
    hero: { ...FRAME, pitch: 4, padding: 0.12 },
  },
  shots: [
    {
      id: 'extracting',
      when: {
        anyOf: [
          {
            allOf: [
              { signal: 'power', op: 'eq', value: true },
              { signal: 'speed', op: 'gt', value: 0 },
            ],
          },
        ],
      },
      focus: 'canopy',
      zoom: 1.3,
      yaw: 16,
      pitch: 2,
      easeMs: 1000,
      loopS: 3,
      symmetry: 360,
      stillAt: 1.5,
    },
  ],
  meta: {
    names: {
      display: 'Range hood',
      synonyms: [
        'hood',
        'cooker hood',
        'extractor hood',
        'extractor fan',
        'chimney hood',
        'vent hood',
      ],
    },
    sizeClass: 'large',
    variants: ['stainless', 'black', 'white'],
  },
  params: { width: { min: 0.6, max: 1.2, default: WIDTH, unit: 'm' } },
  materials: {
    body: { finish: 'brushed-aluminium', metalness: 0.55, roughness: 0.42, pattern: 'brushed' },
    trim: { finish: 'satin-black', roughness: 0.15, clearcoat: 1 },
    filter: { finish: 'graphite', roughness: 0.5, pattern: 'perforated' },
    accent: { ...GLOW, color: DAYLIGHT },
  },
  ...finishSet(
    {
      stainless: {},
      black: { body: { finish: 'satin-black' }, trim: { finish: 'graphite' } },
      white: { body: { finish: 'matte-white' } },
    },
    'stainless',
  ),
  parts: PARTS,
  anchors: [
    {
      kind: 'effect',
      id: 'airflow',
      parent: 'canopy',
      position: [0, -CANOPY_H / 2 - 0.02, 0.02],
      rotation: [180, 0, 0],
      effect: 'airflow',
      size: 0.4,
    },
    {
      kind: 'emitter',
      id: 'hobLight',
      parent: 'canopy',
      position: [0, -CANOPY_H / 2 - 0.01, 0.12],
      color: DAYLIGHT,
      intensity: 0.8,
      radius: 0.7,
      cone: 110,
    },
    ...anchorsOf([WIDTH, HEIGHT, DEPTH], 'wall'),
  ],
  channels: CHANNELS,
  states: {
    off: { power: false, speed: 0, lamp: false, online: true },
    low: { power: true, speed: 0.33, lamp: true, online: true },
    boost: { power: true, speed: 1, lamp: true, online: true },
    lampOnly: { power: false, speed: 0, lamp: true, online: true },
    filterAlert: { power: false, speed: 0, alarm: true, online: true },
    offline: { online: false },
  },
};
