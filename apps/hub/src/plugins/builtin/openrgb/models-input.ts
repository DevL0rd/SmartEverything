import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import {
  RGB_LED,
  box,
  disc,
  piece,
  rgbChannels,
  rgbModel,
  rgbShot,
  spillChannels,
} from './models-kit';

const KEY = 0.019;
const CASE_W = 0.325;
const CASE_D = 0.135;
const CASE_H = 0.026;
const DECK = CASE_H + 0.0004;
const ROW_H = 0.008;
const LEFT = -0.152;
const DESK_VIEW = { yaw: 30, pitch: 30, fov: 28, padding: 0.08 } as const;

interface Row {
  readonly z: number;
  readonly keys: number;
  readonly offset: number;
}

const ROWS: readonly Row[] = [
  { z: -0.0505, keys: 12, offset: 0 },
  { z: -0.0295, keys: 13, offset: 0 },
  { z: -0.0105, keys: 13, offset: 0.5 },
  { z: 0.0085, keys: 12, offset: 0.75 },
  { z: 0.0275, keys: 11, offset: 1.25 },
];

const SPACE_Z = 0.0465;

function rowParts(row: Row, index: number): ModelSpecPart[] {
  const strip = piece(`row${String(index + 1)}`, box([0.302, ROW_H, 0.0152], 3, 0.18), 'trim', {
    transform: { position: [0.001, DECK + ROW_H / 2, row.z] },
  });
  const centre = LEFT + row.offset * KEY + (row.keys * KEY) / 2;
  const keys = piece(
    `keys${String(index + 1)}`,
    { type: 'slats', count: row.keys, spacing: KEY, width: 0.0035, height: 0.0146, depth: 0.0136 },
    'trim',
    {
      transform: { position: [centre, DECK + ROW_H + 0.0012, row.z], rotation: [0, 0, -90] },
      minLod: 2,
    },
  );
  return [strip, keys];
}

const KEYBOARD_PARTS: ModelSpecPart[] = [
  piece('case', box([CASE_W, CASE_H, CASE_D], 3, 0.16), 'body', {
    transform: { position: [0, CASE_H / 2, 0] },
    contact: true,
  }),
  piece(
    'plate',
    { type: 'roundedPlane', width: 0.309, height: 0.119, radius: 0.004, segments: 4 },
    'accent',
    {
      transform: { position: [0, DECK, 0], rotation: [-90, 0, 0] },
    },
  ),
  ...ROWS.flatMap(rowParts),
  piece('space', box([0.302, ROW_H, 0.0152], 3, 0.18), 'trim', {
    transform: { position: [0.001, DECK + ROW_H / 2, SPACE_Z] },
  }),
  piece('spaceBar', box([0.118, 0.0035, 0.0136], 3, 0.25), 'trim', {
    transform: { position: [-0.018, DECK + ROW_H + 0.0012, SPACE_Z] },
    minLod: 2,
  }),
  piece(
    'edge',
    { type: 'roundedPlane', width: CASE_W - 0.02, height: 0.0026, radius: 0.0012, segments: 3 },
    'accent',
    {
      transform: { position: [0, 0.008, CASE_D / 2 + 0.0005] },
      minLod: 1,
    },
  ),
  piece('deskGlow', { type: 'glow', width: 0.4, height: 0.21, segments: 32 }, 'accent', {
    transform: { position: [0, 0.0008, 0], rotation: [-90, 0, 0] },
    minLod: 1,
  }),
  piece('knob', disc({ radius: 0.0085, height: 0.012, segments: 24 }), 'body', {
    transform: { position: [0.139, DECK + 0.006, -0.0505] },
    minLod: 1,
  }),
  piece(
    'cable',
    {
      type: 'tube',
      points: [
        [-0.09, 0.008, -CASE_D / 2],
        [-0.096, 0.003, -CASE_D / 2 - 0.022],
        [-0.13, 0.003, -CASE_D / 2 - 0.036],
        [-0.19, 0.003, -CASE_D / 2 - 0.03],
      ],
      radius: 0.0022,
      segments: 8,
    },
    'trim',
    { minLod: 1 },
  ),
];

export const RGB_KEYBOARD_MODEL: ModelSpec = rgbModel({
  id: 'dev.rgb.keyboard',
  title: 'RGB keyboard',
  footprint: { width: CASE_W, depth: CASE_D, height: DECK + ROW_H + 0.004 },
  framing: { tile: DESK_VIEW, card: DESK_VIEW, hero: { ...DESK_VIEW, padding: 0.1 } },
  shots: [rgbShot({ focus: 'plate', zoom: 1.25, yaw: 24, pitch: 36 })],
  meta: {
    names: {
      display: 'RGB keyboard',
      synonyms: ['keyboard', 'gaming keyboard', 'mechanical keyboard', 'RGB keyboard'],
    },
    sizeClass: 'small',
    variants: ['graphite', 'white'],
  },
  materials: {
    body: { finish: 'graphite', pattern: 'brushed' },
    trim: { finish: 'satin-black' },
    accent: { color: RGB_LED, roughness: 0.4, opacity: 0.9 },
  },
  finishes: {
    graphite: {},
    white: { body: { finish: 'matte-white' }, trim: { finish: 'warm-white' } },
  },
  defaultFinish: 'graphite',
  parts: KEYBOARD_PARTS,
  anchors: [
    {
      kind: 'emitter',
      id: 'glow',
      parent: 'plate',
      position: [0, 0, 0.01],
      color: RGB_LED,
      intensity: 0.5,
      radius: 0.6,
    },
    { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, 0.06, 0] },
    { kind: 'hit', id: 'hitCase', position: [0, 0.018, 0], size: [CASE_W, 0.036, CASE_D] },
  ],
  channels: [
    ...rgbChannels('plate', [0.15, 2.4]),
    ...rgbChannels('edge', [0.08, 1.6]),
    ...spillChannels('deskGlow', [0.25, 0.75]),
    ...rgbChannels('glow', [0.3, 1]),
  ],
});

const MOUSE_R = 0.0625;
const SQUASH = 0.53;
const SKIRT_H = 0.008;
const MOUSE_VIEW = { yaw: 30, pitch: 26, fov: 28, padding: 0.1 } as const;

const MOUSE_PARTS: ModelSpecPart[] = [
  piece('skirt', disc({ radius: MOUSE_R, height: SKIRT_H, bevel: 0.002, segments: 64 }), 'trim', {
    transform: { position: [0, SKIRT_H / 2, 0], scale: [SQUASH, 1, 1] },
    contact: true,
  }),
  piece('shell', { type: 'sphere', radius: MOUSE_R, thetaLength: 90, segments: 64 }, 'body', {
    transform: { position: [0, SKIRT_H - 0.001, -0.004], scale: [0.52, 0.53, 1] },
  }),
  piece('band', { type: 'torus', radius: MOUSE_R - 0.0004, tube: 0.0017, segments: 72 }, 'accent', {
    transform: { position: [0, SKIRT_H - 0.0006, 0], rotation: [90, 0, 0], scale: [SQUASH, 1, 1] },
  }),
  piece('wheel', disc({ radius: 0.0105, height: 0.0068, bevel: 0.0016, segments: 40 }), 'trim', {
    transform: { position: [0, 0.0335, 0.03], rotation: [0, 0, 90] },
  }),
  piece(
    'wheelGlow',
    disc({ radius: 0.0085, height: 0.0072, bevel: 0.001, segments: 40 }),
    'accent',
    {
      transform: { position: [0, 0.0335, 0.03], rotation: [0, 0, 90] },
      minLod: 1,
    },
  ),
  piece('split', box([0.0012, 0.003, 0.05], 3, 0.3), 'trim', {
    transform: { position: [0, 0.0344, 0.034], rotation: [-14, 0, 0] },
    minLod: 1,
  }),
  piece(
    'logo',
    { type: 'ring', innerRadius: 0.0058, outerRadius: 0.0094, segments: 40 },
    'accent',
    {
      transform: { position: [0, 0.0386, -0.025], rotation: [-107, 0, 0] },
    },
  ),
  ...[0.008, 0.024].map((z, index) =>
    piece(`thumb${String(index + 1)}`, box([0.003, 0.006, 0.013], 3, 0.3), 'trim', {
      transform: { position: [-0.0302, 0.0165, z], rotation: [0, 0, 12] },
      minLod: 1,
    }),
  ),
  piece('mouseGlow', { type: 'glow', width: 0.11, height: 0.17, segments: 32 }, 'accent', {
    transform: { position: [0, 0.0006, 0], rotation: [-90, 0, 0] },
    minLod: 1,
  }),
];

export const RGB_MOUSE_MODEL: ModelSpec = rgbModel({
  id: 'dev.rgb.mouse',
  title: 'RGB mouse',
  footprint: { width: 0.067, depth: 0.126, height: 0.041 },
  framing: { tile: MOUSE_VIEW, card: MOUSE_VIEW, hero: { ...MOUSE_VIEW, padding: 0.12 } },
  shots: [rgbShot({ focus: 'shell', zoom: 1.05, yaw: 34, pitch: 32 })],
  meta: {
    names: { display: 'RGB mouse', synonyms: ['mouse', 'gaming mouse', 'RGB mouse'] },
    sizeClass: 'small',
    variants: ['black', 'white'],
  },
  materials: {
    body: { finish: 'satin-black', roughness: 0.38 },
    trim: { finish: 'graphite' },
    accent: { color: RGB_LED, roughness: 0.4, opacity: 0.9 },
  },
  finishes: {
    black: {},
    white: { body: { finish: 'matte-white' }, trim: { finish: 'warm-white' } },
  },
  defaultFinish: 'black',
  parts: MOUSE_PARTS,
  anchors: [
    {
      kind: 'emitter',
      id: 'glow',
      parent: 'shell',
      position: [0, 0, 0],
      color: RGB_LED,
      intensity: 0.4,
      radius: 0.3,
    },
    { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, 0.06, 0] },
    { kind: 'hit', id: 'hitShell', position: [0, 0.02, 0], size: [0.067, 0.041, 0.126] },
  ],
  channels: [
    ...rgbChannels('band', [0.08, 1.6]),
    ...rgbChannels('wheelGlow', [0.08, 1.6]),
    ...rgbChannels('logo', [0.08, 1.6]),
    ...spillChannels('mouseGlow', [0.25, 0.75]),
    ...rgbChannels('glow', [0.3, 1]),
  ],
});
