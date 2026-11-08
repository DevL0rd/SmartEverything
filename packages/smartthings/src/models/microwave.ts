import { emitterChannels, type ModelSpec, type ModelSpecChannel } from '@smarteverything/domain';

const HOUSE = { yaw: 30, pitch: 18, fov: 28, padding: 0.1, focus: 'body' } as const;

const WIDTH = 0.523;
const DEPTH = 0.515;
const HEIGHT = 0.33;
const FEET_H = 0.012;
const BODY_H = HEIGHT - FEET_H;
const FRONT = DEPTH / 2;
const DOOR_W = 0.392;
const DOOR_H = 0.29;
const DOOR_D = 0.022;
const DOOR_X = -WIDTH / 2 + 0.012 + DOOR_W / 2;
const DOOR_Z = FRONT - 0.001;
const HINGE_X = DOOR_X - DOOR_W / 2;
const OPEN_DEG = 100;
const OPEN_RAD = (OPEN_DEG * Math.PI) / 180;
const PANEL_W = 0.1;
const PANEL_X = WIDTH / 2 - 0.012 - PANEL_W / 2;
const GLASS_D = 0.014;
const FACE = DOOR_D / 2;
const WARM = '#F2A65E';
const PHASES = ['idle', 'running', 'paused', 'finished'] as const;

type Part = ModelSpec['parts'][number];

function phaseTable(
  values: Partial<Record<(typeof PHASES)[number], number>>,
): Record<string, number> {
  return Object.fromEntries(PHASES.map((phase) => [phase, values[phase] ?? 0]));
}

function look(
  id: string,
  [target, property]: readonly [string, ModelSpecChannel['property']],
  [source, table]: readonly [string, Readonly<Record<string, number | string>>],
  easeMs = 300,
): ModelSpecChannel {
  return {
    id,
    target,
    property,
    source,
    map: { type: 'enum', table },
    motion: { type: 'pose', easeMs },
    reduced: 'hold',
  };
}

const RIBS = [0, 120, 240].map((angle, index): Part => ({
  id: `plateRib${String(index + 1)}`,
  parent: 'plate',
  geometry: {
    type: 'roundedBox',
    width: 0.07,
    height: 0.003,
    depth: 0.012,
    radius: 0.0012,
    segments: 3,
  },
  material: 'trim',
  transform: { position: [0, 0.003, 0], rotation: [0, angle, 0] },
  minLod: 1,
}));

const KEYS = [0, 1, 2, 3, 4, 5].map((index): Part => ({
  id: `key${String(index + 1)}`,
  parent: 'panel',
  geometry: { type: 'ring', innerRadius: 0.0065, outerRadius: 0.0078, segments: 32 },
  material: 'trim',
  transform: {
    position: [(index % 2) * 0.04 - 0.02, 0.03 - Math.floor(index / 2) * 0.038, 0.0082],
  },
  minLod: 1,
}));

const VENTS: Part = {
  id: 'vents',
  parent: 'body',
  geometry: { type: 'slats', count: 9, spacing: 0.014, width: 0.004, height: 0.12, depth: 0.0016 },
  material: 'trim',
  transform: { position: [WIDTH / 2 + 0.0002, 0.04, -0.08], rotation: [0, 90, 0] },
  minLod: 1,
};

const FEET = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
].map(([x, z], index): Part => ({
  id: `foot${String(index + 1)}`,
  geometry: {
    type: 'cylinder',
    height: FEET_H,
    topRadius: 0.016,
    bottomRadius: 0.014,
    bevel: 0.002,
    segments: 24,
  },
  material: 'trim',
  transform: { position: [(x ?? 0) * 0.21, FEET_H / 2, (z ?? 0) * 0.2] },
  contact: true,
}));

const DOOR_PARTS: Part[] = [
  {
    id: 'door',
    parent: 'body',
    geometry: {
      type: 'roundedBox',
      width: DOOR_W,
      height: DOOR_H,
      depth: DOOR_D,
      radius: 0.007,
      segments: 4,
    },
    material: 'body',
    transform: { position: [DOOR_X, 0, DOOR_Z] },
    poses: {
      closed: { position: [DOOR_X, 0, DOOR_Z], rotation: [0, 0, 0] },
      open: {
        position: [
          HINGE_X + (DOOR_W / 2) * Math.cos(OPEN_RAD),
          0,
          DOOR_Z + (DOOR_W / 2) * Math.sin(OPEN_RAD),
        ],
        rotation: [0, -OPEN_DEG, 0],
      },
    },
  },
  {
    id: 'cavity',
    parent: 'door',
    geometry: { type: 'roundedPlane', width: 0.3, height: 0.19, radius: 0.012, segments: 4 },
    material: 'trim',
    transform: { position: [0, 0.008, FACE + 0.0004] },
  },
  {
    id: 'tray',
    parent: 'door',
    geometry: {
      type: 'cylinder',
      height: 0.004,
      topRadius: 0.13,
      bottomRadius: 0.13,
      segments: 64,
    },
    material: 'trim',
    transform: { position: [0, -0.05, FACE + 0.006], scale: [1, 1, 0.035] },
    minLod: 1,
  },
  {
    id: 'plate',
    parent: 'tray',
    geometry: {
      type: 'cylinder',
      height: 0.004,
      topRadius: 0.12,
      bottomRadius: 0.12,
      bevel: 0.0015,
      segments: 64,
    },
    material: 'glass',
    transform: { position: [0, 0.004, 0] },
    minLod: 1,
  },
  ...RIBS,
  {
    id: 'cavityLight',
    parent: 'door',
    geometry: { type: 'roundedPlane', width: 0.296, height: 0.186, radius: 0.011, segments: 4 },
    material: 'accent',
    transform: { position: [0, 0.008, FACE + GLASS_D - 0.0016] },
  },
  {
    id: 'window',
    parent: 'door',
    geometry: {
      type: 'roundedBox',
      width: 0.304,
      height: 0.194,
      depth: GLASS_D,
      radius: 0.004,
      segments: 3,
    },
    material: 'glass',
    transform: { position: [0, 0.008, FACE + GLASS_D / 2] },
  },
  {
    id: 'handle',
    parent: 'door',
    geometry: {
      type: 'roundedBox',
      width: 0.014,
      height: 0.24,
      depth: 0.018,
      radius: 0.005,
      segments: 3,
    },
    material: 'trim',
    transform: { position: [DOOR_W / 2 - 0.016, 0, FACE + 0.009] },
  },
];

const PANEL_PARTS: Part[] = [
  {
    id: 'panel',
    parent: 'body',
    geometry: {
      type: 'roundedBox',
      width: PANEL_W,
      height: DOOR_H,
      depth: 0.016,
      radius: 0.006,
      segments: 4,
    },
    material: 'body',
    transform: { position: [PANEL_X, 0, FRONT - 0.004] },
  },
  {
    id: 'display',
    parent: 'panel',
    geometry: { type: 'roundedPlane', width: 0.074, height: 0.032, radius: 0.005, segments: 4 },
    material: 'glass',
    transform: { position: [0, 0.095, 0.0082] },
  },
  {
    id: 'displayGlow',
    parent: 'display',
    geometry: { type: 'roundedPlane', width: 0.05, height: 0.014, radius: 0.003, segments: 3 },
    material: 'accent',
    transform: { position: [0, 0, 0.0005] },
  },
  ...KEYS,
  {
    id: 'lockLed',
    parent: 'panel',
    geometry: {
      type: 'cylinder',
      height: 0.0008,
      topRadius: 0.0018,
      bottomRadius: 0.0018,
      segments: 16,
    },
    material: 'accent',
    transform: { position: [0, -0.11, 0.0082], rotation: [90, 0, 0] },
    minLod: 1,
  },
];

const COOK_CHANNELS: ModelSpecChannel[] = [
  look(
    'doorPose',
    ['door', 'pose'],
    ['door', { open: 'open', closed: 'closed', locked: 'closed' }],
    700,
  ),
  look(
    'glowShow',
    ['cavityLight', 'opacity'],
    ['phase', phaseTable({ running: 0.5, paused: 0.2 })],
    300,
  ),
  look(
    'glowLit',
    ['cavityLight', 'emissive'],
    ['phase', phaseTable({ running: 1.4, paused: 0.4 })],
    300,
  ),
  look('lampShow', ['cavityLight', 'opacity'], ['lamp', { true: 0.35 }], 300),
  look('lampLit', ['cavityLight', 'emissive'], ['lamp', { true: 0.9 }], 300),
  look('glowOffline', ['cavityLight', 'opacity'], ['online', { false: 0 }], 450),
  look(
    'heatLight',
    ['cavityLamp', 'emissive'],
    ['phase', phaseTable({ running: 1, paused: 0.3 })],
    300,
  ),
  look('lampHalo', ['cavityLamp', 'emissive'], ['lamp', { true: 0.35 }], 300),
  {
    id: 'plateTurn',
    target: 'plate',
    property: 'rotate',
    axis: 'y',
    source: 'phase',
    map: { type: 'enum', table: phaseTable({ running: 0.1 }) },
    motion: { type: 'spin' },
    reduced: 'hold',
  },
  look('steamShow', ['steam', 'opacity'], ['phase', phaseTable({ finished: 0.3 })], 900),
];

const PANEL_CHANNELS: ModelSpecChannel[] = [
  look('displayLit', ['displayGlow', 'emissive'], ['online', { true: 1, false: 0 }]),
  look('displayShow', ['displayGlow', 'opacity'], ['online', { true: 1, false: 0 }]),
  look('displayDone', ['displayGlow', 'colour'], ['phase', { finished: WARM }], 250),
  look('lockShow', ['lockLed', 'emissive'], ['locked', { true: 1, false: 0 }]),
];

export const SAMSUNG_MICROWAVE_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.microwave.samsung',
  version: '1.0.0',
  title: 'Samsung Smart Microwave',
  category: 'kitchen',
  family: 'microwave',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  framing: {
    tile: HOUSE,
    card: { ...HOUSE, padding: 0.1 },
    hero: { ...HOUSE, padding: 0.12 },
  },
  shots: [
    {
      id: 'cooking',
      when: { anyOf: [{ allOf: [{ signal: 'phase', op: 'eq', value: 'running' }] }] },
      focus: 'window',
      zoom: 1.4,
      yaw: -6,
      pitch: -2,
      easeMs: 900,
      loopS: 10,
      symmetry: 120,
      stillAt: 2.5,
    },
  ],
  meta: {
    names: {
      display: 'Samsung Smart Microwave',
      synonyms: ['microwave', 'microwave oven', 'convection microwave'],
    },
    sizeClass: 'medium',
    aliases: ['TP1X_DA-KS-MICROWAVE-01041'],
  },
  materials: {
    body: { finish: 'satin-black' },
    trim: { finish: 'graphite' },
    glass: { finish: 'smoked-acrylic' },
    accent: { color: WARM, roughness: 0.3 },
  },
  parts: [
    {
      id: 'body',
      geometry: {
        type: 'roundedBox',
        width: WIDTH,
        height: BODY_H,
        depth: DEPTH - 0.02,
        radius: 0.014,
        segments: 4,
      },
      material: 'body',
      transform: { position: [0, FEET_H + BODY_H / 2, -0.01] },
    },
    ...FEET,
    VENTS,
    ...DOOR_PARTS,
    ...PANEL_PARTS,
  ],
  anchors: [
    {
      kind: 'screen',
      id: 'readout',
      parent: 'display',
      position: [0, 0, 0.001],
      width: 0.074,
      height: 0.032,
    },
    {
      kind: 'emitter',
      id: 'cavityLamp',
      parent: 'door',
      position: [0, 0.008, FACE + GLASS_D + 0.004],
      color: WARM,
      intensity: 0.6,
      radius: 0.16,
    },
    {
      kind: 'effect',
      id: 'steam',
      parent: 'door',
      position: [0, 0.05, FACE + GLASS_D + 0.004],
      effect: 'steam',
      size: 0.12,
    },
    { kind: 'mount', id: 'counter', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, HEIGHT + 0.06, 0] },
    { kind: 'hit', id: 'tap', position: [0, HEIGHT / 2, 0], size: [WIDTH, HEIGHT, DEPTH] },
  ],
  channels: [
    ...COOK_CHANNELS,
    ...PANEL_CHANNELS,
    ...['cavityLamp', 'cavityLight', 'displayGlow', 'lockLed'].flatMap((id) => emitterChannels(id)),
  ],
  states: {
    off: { phase: 'idle', door: 'closed', lamp: false, online: true },
    running: { phase: 'running', progress: 0.4, level: 1, door: 'closed', online: true },
    paused: { phase: 'paused', progress: 0.6, door: 'closed', online: true },
    finished: { phase: 'finished', progress: 1, door: 'closed', online: true },
    doorOpen: { phase: 'idle', door: 'open', lamp: true, online: true },
    locked: { phase: 'idle', locked: true, online: true },
    offline: { online: false },
  },
};
