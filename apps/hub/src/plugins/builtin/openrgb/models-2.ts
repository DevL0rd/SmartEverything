import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import {
  RGB_LED,
  RGB_STATES,
  box,
  disc,
  fanRotor,
  piece,
  rgbChannels,
  rgbModel,
  rgbShot,
  spinChannel,
} from './models-kit';

const CARD_L = 0.3;
const CARD_H = 0.118;
const SHROUD_D = 0.042;
const CARD_Y = 0.006 + CARD_H / 2;
const FACE = SHROUD_D / 2;
const FANS = [-0.096, 0, 0.096] as const;
const FAN_R = 0.04;
const CARD_VIEW = { yaw: 26, pitch: 16, fov: 28, padding: 0.08 } as const;

function fanParts(x: number, index: number): ModelSpecPart[] {
  const name = `fan${String(index + 1)}`;
  return [
    piece(`${name}Well`, disc({ radius: FAN_R + 0.002, height: 0.004, segments: 40 }), 'trim', {
      parent: 'shroud',
      transform: { position: [x, 0, FACE - 0.0015], rotation: [90, 0, 0] },
    }),
    piece(
      `${name}Ring`,
      { type: 'torus', radius: FAN_R + 0.0006, tube: 0.0019, segments: 32 },
      'accent',
      {
        parent: 'shroud',
        transform: { position: [x, 0, FACE + 0.0006] },
      },
    ),
    ...fanRotor({
      id: `${name}Rotor`,
      parent: 'shroud',
      at: [x, 0, FACE + 0.002],
      radius: FAN_R - 0.002,
      blades: 7,
      turn: [90, 0, 0],
      blade: 'trim',
    }),
  ];
}

const CARD_PARTS: ModelSpecPart[] = [
  piece('shroud', box([CARD_L - 0.01, CARD_H, SHROUD_D], 4, 0.1), 'body', {
    transform: { position: [0.004, CARD_Y, 0.004] },
    contact: true,
  }),
  piece('backplate', box([CARD_L - 0.014, CARD_H - 0.006, 0.003], 3, 0.3), 'metal', {
    parent: 'shroud',
    transform: { position: [0, 0, -FACE - 0.0035] },
  }),
  piece('bracket', box([0.0016, CARD_H + 0.008, 0.02], 3, 0.3), 'metal', {
    transform: { position: [-CARD_L / 2, CARD_Y + 0.002, -0.006] },
  }),
  piece('ports', box([0.003, 0.08, 0.012], 3, 0.3), 'trim', {
    parent: 'bracket',
    transform: { position: [-0.0018, -0.01, 0] },
    minLod: 1,
  }),
  piece('topBar', box([0.18, 0.003, 0.012], 3, 0.3), 'accent', {
    parent: 'shroud',
    transform: { position: [0.03, CARD_H / 2 + 0.001, 0.008] },
  }),
  piece(
    'fingers',
    { type: 'roundedPlane', width: 0.09, height: 0.006, radius: 0.001, segments: 3 },
    'metal',
    {
      transform: { position: [-0.04, 0.003, -0.019] },
      minLod: 1,
    },
  ),
  piece('power', box([0.022, 0.008, 0.01], 3, 0.25), 'trim', {
    parent: 'shroud',
    transform: { position: [0.1, CARD_H / 2 + 0.004, -0.01] },
    minLod: 2,
  }),
  ...FANS.flatMap(fanParts),
];

const SPINS = FANS.map((_, index) => spinChannel(`fan${String(index + 1)}Rotor`, 'y'));

const RINGS = FANS.flatMap((_, index) => rgbChannels(`fan${String(index + 1)}Ring`, [0.08, 1.6]));

export const RGB_GPU_MODEL: ModelSpec = rgbModel(
  {
    id: 'dev.rgb.gpu',
    title: 'RGB graphics card',
    footprint: { width: CARD_L, depth: 0.05, height: CARD_H + 0.012 },
    framing: { tile: CARD_VIEW, card: CARD_VIEW, hero: { ...CARD_VIEW, padding: 0.1 } },
    shots: [rgbShot({ focus: 'fan2Rotor', zoom: 1.15, yaw: 18, pitch: 12 }, 360 / 7)],
    meta: {
      names: {
        display: 'RGB graphics card',
        synonyms: ['graphics card', 'GPU', 'video card', 'RGB GPU'],
      },
      sizeClass: 'small',
      variants: ['black', 'white'],
    },
    materials: {
      body: { finish: 'satin-black' },
      trim: { finish: 'graphite' },
      metal: { finish: 'brushed-aluminium' },
      accent: { color: RGB_LED, roughness: 0.4, opacity: 0.92 },
    },
    finishes: { black: {}, white: { body: { finish: 'matte-white' } } },
    defaultFinish: 'black',
    parts: CARD_PARTS,
    anchors: [
      {
        kind: 'emitter',
        id: 'glow',
        parent: 'shroud',
        position: [0, 0, FACE + 0.02],
        color: RGB_LED,
        intensity: 0.5,
        radius: 0.5,
      },
      {
        kind: 'effect',
        id: 'airflow',
        parent: 'shroud',
        position: [0, 0, FACE + 0.03],
        effect: 'airflow',
        size: 0.25,
      },
      { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
      { kind: 'label', id: 'pin', position: [0, CARD_H + 0.04, 0] },
      { kind: 'hit', id: 'hitCard', position: [0, CARD_Y, 0], size: [CARD_L, CARD_H, 0.05] },
    ],
    channels: [
      ...RINGS,
      ...rgbChannels('topBar', [0.08, 1.6]),
      ...SPINS,
      ...rgbChannels('glow', [0.3, 1]),
    ],
  },
  { ...RGB_STATES, spinning: { power: true, brightness: 1, colour: '#22D3EE', speed: 0.5 } },
);

const BOARD_W = 0.305;
const BOARD_D = 0.244;
const BOARD_T = 0.004;
const TOP = BOARD_T;
const BOARD_VIEW = { yaw: 30, pitch: 38, fov: 28, padding: 0.08 } as const;

type Spot = readonly [number, number];

function onBoard(
  id: string,
  [width, height, depth]: readonly [number, number, number],
  [x, z]: Spot,
  material: string,
): ModelSpecPart {
  return piece(id, box([width, height, depth], 3, 0.18), material, {
    transform: { position: [x, TOP + height / 2, z] },
  });
}

function flat(
  id: string,
  [width, depth]: Spot,
  [x, z, y]: readonly [number, number, number],
): ModelSpecPart {
  return piece(
    id,
    {
      type: 'roundedPlane',
      width,
      height: depth,
      radius: Math.min(width, depth) * 0.4,
      segments: 3,
    },
    'accent',
    {
      transform: { position: [x, y, z], rotation: [-90, 0, 0] },
    },
  );
}

const SLOTS: ModelSpecPart[] = [0.047, 0.056, 0.065, 0.074].map((x, index) => ({
  ...onBoard(
    `memorySlot${String(index + 1)}`,
    [0.0045, 0.008, 0.134],
    [x, -0.048],
    index % 2 === 0 ? 'metal' : 'trim',
  ),
  minLod: 1,
}));

const HOLES: ModelSpecPart[] = (
  [
    [-0.145, -0.115],
    [0.145, -0.115],
    [-0.145, 0.115],
    [0.145, 0.115],
    [-0.02, -0.115],
    [-0.02, 0.115],
  ] as const
).map(([x, z], index) =>
  piece(
    `hole${String(index + 1)}`,
    { type: 'ring', innerRadius: 0.0018, outerRadius: 0.0034, segments: 24 },
    'metal',
    {
      transform: { position: [x, TOP + 0.0003, z], rotation: [-90, 0, 0] },
      minLod: 2,
    },
  ),
);

const BOARD_PARTS: ModelSpecPart[] = [
  piece('pcb', box([BOARD_W, BOARD_T, BOARD_D], 3, 0.3), 'body', {
    transform: { position: [0, BOARD_T / 2, 0] },
    contact: true,
  }),
  onBoard('shroud', [0.028, 0.036, 0.12], [-0.137, -0.058], 'trim'),
  flat('shroudGlow', [0.004, 0.1], [-0.124, -0.058, TOP + 0.0362]),
  onBoard('vrm', [0.092, 0.03, 0.024], [-0.06, -0.106], 'trim'),
  onBoard('vrmSide', [0.024, 0.03, 0.07], [-0.104, -0.06], 'trim'),
  onBoard('socket', [0.052, 0.006, 0.054], [-0.032, -0.054], 'metal'),
  { ...onBoard('lever', [0.002, 0.004, 0.05], [-0.0015, -0.054], 'metal'), minLod: 1 },
  ...SLOTS,
  { ...onBoard('atx', [0.012, 0.012, 0.052], [0.14, -0.01], 'trim'), minLod: 1 },
  onBoard('pcie1', [0.09, 0.011, 0.008], [-0.06, 0.018], 'metal'),
  onBoard('pcie2', [0.09, 0.011, 0.008], [-0.06, 0.084], 'metal'),
  onBoard('m2', [0.08, 0.005, 0.022], [-0.06, 0.05], 'trim'),
  onBoard('chipset', [0.05, 0.009, 0.05], [0.07, 0.075], 'trim'),
  piece(
    'chipsetGlow',
    { type: 'ring', innerRadius: 0.011, outerRadius: 0.015, segments: 48 },
    'accent',
    {
      transform: { position: [0.07, TOP + 0.0094, 0.075], rotation: [-90, 0, 0] },
    },
  ),
  flat('edgeGlow', [0.004, 0.11], [0.149, 0.06, TOP + 0.0004]),
  ...HOLES,
];

const GLOWS = ['shroudGlow', 'chipsetGlow', 'edgeGlow'] as const;

export const RGB_MOTHERBOARD_MODEL: ModelSpec = rgbModel({
  id: 'dev.rgb.motherboard',
  title: 'RGB motherboard',
  footprint: { width: BOARD_W, depth: BOARD_D, height: TOP + 0.036 },
  framing: { tile: BOARD_VIEW, card: BOARD_VIEW, hero: { ...BOARD_VIEW, padding: 0.1 } },
  shots: [rgbShot({ focus: 'chipset', zoom: 1.1, yaw: 24, pitch: 42 })],
  meta: {
    names: {
      display: 'RGB motherboard',
      synonyms: ['motherboard', 'mainboard', 'ATX board', 'RGB motherboard'],
    },
    sizeClass: 'small',
    variants: ['black'],
  },
  materials: {
    body: { finish: 'satin-black', roughness: 0.6 },
    trim: { finish: 'graphite', pattern: 'brushed' },
    metal: { finish: 'brushed-aluminium' },
    accent: { color: RGB_LED, roughness: 0.4, opacity: 0.92 },
  },
  finishes: { black: {} },
  defaultFinish: 'black',
  parts: BOARD_PARTS,
  anchors: [
    {
      kind: 'emitter',
      id: 'glow',
      parent: 'pcb',
      position: [0, 0.03, 0],
      color: RGB_LED,
      intensity: 0.5,
      radius: 0.5,
    },
    { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, 0.06, 0] },
    { kind: 'hit', id: 'hitBoard', position: [0, 0.02, 0], size: [BOARD_W, 0.04, BOARD_D] },
  ],
  channels: [
    ...GLOWS.flatMap((id) => rgbChannels(id, [0.08, 1.7])),
    ...rgbChannels('glow', [0.3, 1]),
  ],
});

export const OPENRGB_BOARD_MODELS: readonly ModelSpec[] = [RGB_GPU_MODEL, RGB_MOTHERBOARD_MODEL];
