import type { ModelSpec, ModelSpecGeometry, ModelSpecPart } from '@smarteverything/domain';
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

const SLOT_H = 0.012;
const STICK_W = 0.1335;
const SPREADER_H = 0.036;
const SEAT = 0.0025;
const SPREADER_Y = SLOT_H + SEAT + SPREADER_H / 2;
const BAR_H = 0.0085;
const BAR_Y = SPREADER_Y + SPREADER_H / 2 + BAR_H / 2 - 0.0005;
const RAM_VIEW = { yaw: 30, pitch: 16, fov: 28, padding: 0.1 } as const;

const RAM_PARTS: ModelSpecPart[] = [
  piece('slot', box([0.148, SLOT_H, 0.0085], 3, 0.15), 'trim', {
    transform: { position: [0, SLOT_H / 2, 0] },
    contact: true,
  }),
  ...[-1, 1].map((side) =>
    piece(side < 0 ? 'latchLeft' : 'latchRight', box([0.006, 0.022, 0.0095], 3, 0.25), 'trim', {
      transform: { position: [side * 0.0745, 0.011, 0], rotation: [0, 0, side * -6] },
    }),
  ),
  piece('pcb', box([STICK_W - 0.002, 0.014, 0.0013], 3, 0.3), 'trim', {
    transform: { position: [0, SLOT_H + SEAT - 0.004, 0] },
  }),
  piece('spreader', box([STICK_W, SPREADER_H, 0.0072], 4, 0.12), 'body', {
    transform: { position: [0, SPREADER_Y, 0] },
  }),
  piece('bar', box([STICK_W - 0.003, BAR_H, 0.0064], 4, 0.3), 'glass', {
    transform: { position: [0, BAR_Y, 0] },
  }),
  ...[-0.03, -0.018, -0.006].map((x, index) =>
    piece(`cut${String(index + 1)}`, box([0.0016, 0.03, 0.0006], 3, 0.3), 'trim', {
      parent: 'spreader',
      transform: { position: [x, 0, 0.0037], rotation: [0, 0, -32] },
      minLod: 2,
    }),
  ),
  piece(
    'mark',
    { type: 'roundedPlane', width: 0.022, height: 0.004, radius: 0.0012, segments: 3 },
    'trim',
    {
      parent: 'spreader',
      transform: { position: [0.04, -0.008, 0.0037] },
      minLod: 2,
    },
  ),
];

export const RGB_RAM_MODEL: ModelSpec = rgbModel({
  id: 'dev.rgb.ram',
  title: 'RGB memory',
  footprint: { width: 0.148, depth: 0.0095, height: BAR_Y + BAR_H / 2 },
  framing: { tile: RAM_VIEW, card: RAM_VIEW, hero: { ...RAM_VIEW, padding: 0.12 } },
  shots: [rgbShot({ focus: 'bar', zoom: 1.1, yaw: 26, pitch: 20 })],
  meta: {
    names: {
      display: 'RGB memory',
      synonyms: ['RAM', 'memory', 'memory stick', 'memory module', 'RGB RAM'],
    },
    sizeClass: 'small',
    variants: ['graphite', 'white'],
  },
  materials: {
    body: { finish: 'graphite', pattern: 'brushed' },
    trim: { finish: 'satin-black' },
    glass: { finish: 'frosted-glass', opacity: 0.94 },
  },
  finishes: { graphite: {}, white: { body: { finish: 'matte-white' } } },
  defaultFinish: 'graphite',
  parts: RAM_PARTS,
  anchors: [
    {
      kind: 'emitter',
      id: 'glow',
      parent: 'bar',
      position: [0, 0.01, 0],
      color: RGB_LED,
      intensity: 0.4,
      radius: 0.3,
    },
    { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, 0.08, 0] },
    { kind: 'hit', id: 'hitStick', position: [0, 0.03, 0], size: [0.148, 0.06, 0.01] },
  ],
  channels: [...rgbChannels('bar', [0.1, 1.8]), ...rgbChannels('glow', [0.3, 1])],
});

const HALF = 0.06;
const BORE = 0.0585;
const FRAME_D = 0.025;
const ARC_STEPS = 10;
const FAN_VIEW = { yaw: 26, pitch: 14, fov: 28, padding: 0.1 } as const;

function cornerPath(): ModelSpecGeometry {
  const arc = Array.from({ length: ARC_STEPS + 1 }, (_, index) => {
    const angle = (Math.PI / 2) * (index / ARC_STEPS);
    return { op: 'line', x: BORE * Math.sin(angle), y: BORE * Math.cos(angle) } as const;
  });
  return {
    type: 'extrude',
    path: [
      { op: 'move', x: HALF, y: 0 },
      { op: 'line', x: HALF, y: HALF },
      { op: 'line', x: 0, y: HALF },
      ...arc,
      { op: 'line', x: HALF, y: 0 },
    ],
    depth: FRAME_D,
    bevel: 0.0012,
  };
}

const FRAME: ModelSpecPart[] = [
  piece(
    'frame',
    {
      type: 'lathe',
      profile: [
        [BORE, FRAME_D / 2],
        [BORE, -FRAME_D / 2],
      ],
      segments: 64,
    },
    'body',
    {
      transform: { position: [0, HALF, 0], rotation: [90, 0, 0] },
      contact: true,
    },
  ),
  ...[0, 90, 180, 270].map((turn) =>
    piece(`corner${String(turn)}`, cornerPath(), 'body', {
      parent: 'frame',
      transform: { rotation: [-90, 0, turn] },
    }),
  ),
  ...[45, 135, 225, 315].map((turn) => {
    const rad = (turn * Math.PI) / 180;
    return piece(
      `screw${String(turn)}`,
      { type: 'ring', innerRadius: 0.0022, outerRadius: 0.0034, segments: 24 },
      'trim',
      {
        parent: 'frame',
        transform: {
          position: [0.0735 * Math.cos(rad), FRAME_D / 2 + 0.0003, 0.0735 * Math.sin(rad)],
          rotation: [-90, 0, 0],
        },
        minLod: 2,
      },
    );
  }),
  piece('ring', { type: 'torus', radius: BORE - 0.0005, tube: 0.0028, segments: 72 }, 'accent', {
    parent: 'frame',
    transform: { position: [0, FRAME_D / 2 - 0.001, 0], rotation: [90, 0, 0] },
  }),
  piece('motor', disc({ radius: 0.021, height: 0.006, segments: 40 }), 'body', {
    parent: 'frame',
    transform: { position: [0, -FRAME_D / 2 + 0.003, 0] },
    minLod: 1,
  }),
  ...[90, 210, 330].map((turn) => {
    const rad = (turn * Math.PI) / 180;
    return piece(`strut${String(turn)}`, box([0.04, 0.003, 0.005], 3, 0.3), 'body', {
      parent: 'frame',
      transform: {
        position: [0.038 * Math.cos(rad), -FRAME_D / 2 + 0.003, 0.038 * Math.sin(rad)],
        rotation: [0, -turn, 0],
      },
      minLod: 1,
    });
  }),
  ...fanRotor({
    id: 'rotor',
    parent: 'frame',
    at: [0, 0.002, 0],
    radius: 0.056,
    blades: 9,
    turn: [0, 0, 0],
    blade: 'glass',
  }),
];

export const RGB_CASE_FAN_MODEL: ModelSpec = rgbModel(
  {
    id: 'dev.rgb.case-fan',
    title: 'RGB case fan',
    footprint: { width: 0.12, depth: FRAME_D, height: 0.12 },
    framing: { tile: FAN_VIEW, card: FAN_VIEW, hero: { ...FAN_VIEW, padding: 0.12 } },
    shots: [rgbShot({ focus: 'rotor', zoom: 1.2, yaw: 18, pitch: 10 }, 40)],
    meta: {
      names: {
        display: 'RGB case fan',
        synonyms: ['case fan', 'PC fan', 'RGB fan', 'cooler fan', 'cooler'],
      },
      sizeClass: 'small',
      variants: ['black', 'white'],
    },
    materials: {
      body: { finish: 'satin-black' },
      trim: { finish: 'graphite' },
      glass: { color: '#5E626B', roughness: 0.42, clearcoat: 0.8, opacity: 0.86 },
      accent: { color: RGB_LED, roughness: 0.4, opacity: 0.92 },
    },
    finishes: {
      black: {},
      white: { body: { finish: 'matte-white' }, trim: { finish: 'warm-white' } },
    },
    defaultFinish: 'black',
    parts: FRAME,
    anchors: [
      {
        kind: 'emitter',
        id: 'glow',
        parent: 'frame',
        position: [0, 0.02, 0],
        color: RGB_LED,
        intensity: 0.5,
        radius: 0.4,
      },
      {
        kind: 'effect',
        id: 'airflow',
        parent: 'frame',
        position: [0, 0.04, 0],
        effect: 'airflow',
        size: 0.12,
      },
      { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
      { kind: 'label', id: 'pin', position: [0, 0.14, 0] },
      { kind: 'hit', id: 'hitFrame', position: [0, HALF, 0], size: [0.12, 0.12, FRAME_D] },
    ],
    channels: [
      ...rgbChannels('ring', [0.1, 1.8]),
      spinChannel('rotor', 'y'),
      ...rgbChannels('glow', [0.3, 1]),
    ],
  },
  { ...RGB_STATES, spinning: { power: true, brightness: 1, colour: '#22D3EE', speed: 0.6 } },
);
