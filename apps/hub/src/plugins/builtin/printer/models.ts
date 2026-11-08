import type {
  ModelMatch,
  ModelSpec,
  ModelSpecChannel,
  ModelSpecCondition,
} from '@smarteverything/domain';

type Part = ModelSpec['parts'][number];

const WIDTH = 0.39;
const DEPTH = 0.343;
const HEIGHT = 0.1485;
const BASE_H = 0.116;
const LID_H = HEIGHT - BASE_H;
const LID_D = 0.322;
const LID_Z = (DEPTH - LID_D) / -2;
const FRONT = DEPTH / 2;
const TANK_X = 0.148;
const TANK_W = 0.082;
const TANK_H = 0.074;
const TANK_Y = 0.064;
const FILL_H = 0.056;
const SLOT_X = -0.045;
const SLOT_Y = 0.064;
const LED_GREEN = '#5FD38A';
const LED_AMBER = '#F2A04E';
const LED_BLUE = '#6FB7FF';
const INK = '#2A3046';
const POSE = { type: 'pose', easeMs: 300 } as const;

const HOUSE = { yaw: 30, pitch: 20, fov: 28, padding: 0.1, focus: 'body' } as const;

const PRINTING: ModelSpecCondition = {
  anyOf: [{ allOf: [{ signal: 'phase', op: 'eq', value: 'printing' }] }],
};

function box(width: number, height: number, depth: number, radius: number): Part['geometry'] {
  return { type: 'roundedBox', width, height, depth, radius, segments: 3 };
}

const TANKS = [
  { key: 'black', x: -0.024, width: 0.022 },
  { key: 'cyan', x: 0.0005, width: 0.0135 },
  { key: 'magenta', x: 0.0165, width: 0.0135 },
  { key: 'yellow', x: 0.0325, width: 0.0135 },
] as const;

function tankParts(): Part[] {
  const window: Part = {
    id: 'tankWindow',
    geometry: box(TANK_W, TANK_H, 0.006, 0.006),
    material: 'trim',
    transform: { position: [TANK_X, TANK_Y, FRONT + 0.001] },
  };
  return [
    window,
    ...TANKS.flatMap((tank): Part[] => [
      {
        id: `${tank.key}Floor`,
        parent: 'tankWindow',
        geometry: {
          type: 'roundedPlane',
          width: tank.width,
          height: 0.001,
          radius: 0.0003,
          segments: 3,
        },
        material: 'accent',
        transform: { position: [tank.x, -FILL_H / 2, 0.0035] },
      },
      {
        id: `${tank.key}Ink`,
        parent: `${tank.key}Floor`,
        geometry: {
          type: 'roundedBox',
          width: tank.width,
          height: FILL_H,
          depth: 0.004,
          radius: 0.0012,
          segments: 3,
        },
        material: 'accent',
        transform: { position: [0, FILL_H / 2, 0] },
      },
    ]),
  ];
}

function tankChannels(): ModelSpecChannel[] {
  return TANKS.map((tank) => ({
    id: `${tank.key}Level`,
    target: `${tank.key}Floor`,
    property: 'scale',
    axis: 'y',
    source: { capability: `raw:printer.supply.${tank.key}` },
    map: { type: 'linear', in: [0, 100], out: [0.03, 1], clamp: true },
    motion: { type: 'pose', easeMs: 600 },
    reduced: 'hold',
  }));
}

const BUTTON = {
  type: 'cylinder',
  height: 0.0016,
  topRadius: 0.0042,
  bottomRadius: 0.0045,
  bevel: 0.0005,
  segments: 16,
} as const;

const LED = {
  type: 'roundedBox',
  width: 0.0034,
  height: 0.001,
  depth: 0.0022,
  radius: 0.0004,
  segments: 3,
} as const;

function panelParts(): Part[] {
  const buttons = [-0.052, -0.034, -0.016, 0.002, 0.026, 0.05].map((x, index): Part => ({
    id: `button${String(index + 1)}`,
    parent: 'panel',
    geometry: BUTTON,
    material: 'body',
    transform: { position: [x, 0.0016, 0.002] },
    minLod: 1,
  }));
  const leds = [
    ['ledWifi', 0.026],
    ['ledPower', 0.05],
    ['ledInk', 0.062],
    ['ledPaper', 0.07],
  ].map(([id, x]): Part => ({
    id: String(id),
    parent: 'panel',
    geometry: LED,
    material: 'accent',
    transform: { position: [Number(x), 0.0012, -0.0085] },
    minLod: 1,
  }));
  return [...buttons, ...leds];
}

function ledChannel(
  id: string,
  target: string,
  source: 'online' | 'alarm' | 'fault',
  glow: number,
): ModelSpecChannel {
  return {
    id,
    target,
    property: 'emissive',
    source,
    map: { type: 'enum', table: source === 'online' ? { true: glow, false: 0 } : { true: glow } },
    motion: source === 'online' ? POSE : { type: 'pulse', periodS: 1, amplitude: 0.6 },
    reduced: 'hold',
  };
}

function tintChannel(id: string, target: string, source: string, colour: string): ModelSpecChannel {
  return {
    id,
    target,
    property: 'colour',
    source,
    map: { type: 'enum', table: { true: colour } },
    motion: { type: 'pose', easeMs: 250 },
    reduced: 'hold',
  };
}

const LED_CHANNELS: ModelSpecChannel[] = [
  ledChannel('powerGlow', 'ledPower', 'online', 0.9),
  tintChannel('powerTint', 'ledPower', 'online', LED_GREEN),
  ledChannel('wifiGlow', 'ledWifi', 'online', 0.8),
  tintChannel('wifiTint', 'ledWifi', 'online', LED_BLUE),
  {
    id: 'inkLowGlow',
    target: 'ledInk',
    property: 'emissive',
    source: 'inkLevels',
    map: { type: 'linear', in: [0, 0.15], out: [0.9, 0], clamp: true },
    motion: POSE,
    reduced: 'hold',
  },
  tintChannel('inkLowTint', 'ledInk', 'online', LED_AMBER),
  ledChannel('inkGlow', 'ledInk', 'alarm', 1),
  tintChannel('inkTint', 'ledInk', 'alarm', LED_AMBER),
  ledChannel('paperGlow', 'ledPaper', 'fault', 1),
  tintChannel('paperTint', 'ledPaper', 'fault', LED_AMBER),
  {
    id: 'powerSleep',
    target: 'ledPower',
    property: 'emissive',
    source: 'phase',
    map: { type: 'enum', table: { asleep: 0.25 } },
    motion: POSE,
    reduced: 'hold',
  },
];

const WORK_CHANNELS: ModelSpecChannel[] = [
  {
    id: 'carriageRun',
    target: 'carriage',
    property: 'translate',
    axis: 'x',
    source: 'phase',
    map: { type: 'enum', table: { printing: 1 } },
    motion: { type: 'oscillate', limits: [-0.075, 0.075], speed: 0.3 },
    reduced: 'hold',
  },
  {
    id: 'paperOut',
    target: 'paper',
    property: 'translate',
    axis: 'z',
    source: 'phase',
    map: { type: 'enum', table: { printing: 1 } },
    motion: { type: 'step', keyframes: [0, 0.03, 0.06, 0.09, 0.12], intervalMs: 800 },
    reduced: 'hold',
  },
];

const HINGES: Part[] = [-0.12, 0.12].map((x, index) => ({
  id: `hinge${String(index + 1)}`,
  parent: 'lid',
  geometry: box(0.03, 0.012, 0.012, 0.003),
  material: 'trim',
  transform: { position: [x, -0.004, -LID_D / 2 + 0.002] },
  minLod: 2,
}));

function bodyParts(): Part[] {
  return [
    {
      id: 'body',
      geometry: box(WIDTH, BASE_H, DEPTH, 0.011),
      material: 'body',
      transform: { position: [0, BASE_H / 2, 0] },
      contact: true,
    },
    {
      id: 'lid',
      geometry: box(WIDTH - 0.004, LID_H, LID_D, 0.009),
      material: 'body',
      transform: { position: [0, BASE_H + LID_H / 2, LID_Z] },
    },
    {
      id: 'seam',
      geometry: box(WIDTH - 0.002, 0.0016, DEPTH - 0.004, 0.0008),
      material: 'trim',
      transform: { position: [0, BASE_H, 0] },
      minLod: 2,
    },
    {
      id: 'lidGrip',
      parent: 'lid',
      geometry: box(0.07, 0.006, 0.004, 0.002),
      material: 'trim',
      transform: { position: [-0.06, -0.004, LID_D / 2 - 0.001] },
      minLod: 2,
    },
    {
      id: 'panel',
      parent: 'lid',
      geometry: box(0.16, 0.002, 0.03, 0.004),
      material: 'trim',
      transform: { position: [0.09, LID_H / 2, LID_D / 2 - 0.021] },
    },
    ...HINGES,
  ];
}

function frontParts(): Part[] {
  return [
    {
      id: 'slot',
      geometry: box(0.25, 0.034, 0.004, 0.004),
      material: 'trim',
      transform: { position: [SLOT_X, SLOT_Y, FRONT - 0.0015] },
    },
    {
      id: 'carriage',
      parent: 'slot',
      geometry: box(0.05, 0.016, 0.003, 0.002),
      material: 'body',
      transform: { position: [0, 0.006, 0.0006] },
      minLod: 1,
    },
    {
      id: 'outputTray',
      geometry: box(0.21, 0.004, 0.05, 0.0015),
      material: 'body',
      transform: { position: [SLOT_X, SLOT_Y - 0.019, FRONT - 0.02] },
      minLod: 1,
    },
    {
      id: 'paper',
      geometry: box(0.2, 0.0008, 0.12, 0.0003),
      material: 'paper',
      transform: { position: [SLOT_X, SLOT_Y - 0.0165, FRONT - 0.065] },
    },
    {
      id: 'cassette',
      geometry: box(0.3, 0.034, 0.006, 0.004),
      material: 'body',
      transform: { position: [-0.03, 0.022, FRONT + 0.0015] },
    },
    {
      id: 'cassetteGrip',
      parent: 'cassette',
      geometry: box(0.06, 0.004, 0.003, 0.0015),
      material: 'trim',
      transform: { position: [0, 0.009, 0.0035] },
      minLod: 2,
    },
    ...tankParts(),
  ];
}

export const BROTHER_DCP_T430W_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.printer.brother-dcp-t430w',
  version: '1.0.0',
  title: 'Brother DCP-T430W',
  category: 'office',
  family: 'printer',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  framing: {
    tile: { ...HOUSE, padding: 0.08 },
    card: HOUSE,
    hero: { ...HOUSE, yaw: 26, padding: 0.12 },
  },
  shots: [
    {
      id: 'printing',
      when: PRINTING,
      focus: 'slot',
      zoom: 1.3,
      yaw: -8,
      pitch: -4,
      easeMs: 900,
      loopS: 4,
      symmetry: 360,
      stillAt: 2,
    },
  ],
  meta: {
    names: {
      display: 'Brother DCP-T430W',
      synonyms: ['ink tank printer', 'printer', 'inkjet printer', 'scanner', 'all-in-one printer'],
    },
    sizeClass: 'medium',
    aliases: ['Brother DCP-T430W'],
  },
  materials: {
    body: { finish: 'satin-black', roughness: 0.38 },
    trim: { finish: 'graphite', roughness: 0.3 },
    paper: { finish: 'matte-white' },
    accent: { color: INK, roughness: 0.15, clearcoat: 0.6 },
  },
  finishes: { black: {} },
  defaultFinish: 'black',
  parts: [...bodyParts(), ...panelParts(), ...frontParts()],
  anchors: [
    { kind: 'screen', id: 'inkScreen', parent: 'tankWindow', width: TANK_W, height: TANK_H },
    {
      kind: 'emitter',
      id: 'powerGlowLight',
      parent: 'ledPower',
      position: [0, 0.002, 0],
      color: LED_GREEN,
      intensity: 0.5,
      radius: 0.015,
    },
    { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, HEIGHT + 0.03, 0] },
    { kind: 'hit', id: 'printer', position: [0, HEIGHT / 2, 0], size: [WIDTH, HEIGHT, DEPTH] },
  ],
  channels: [...tankChannels(), ...LED_CHANNELS, ...WORK_CHANNELS],
  states: {
    off: { online: false },
    on: { online: true, phase: 'idle', inkLevels: 0.79 },
    printing: { online: true, phase: 'printing', progress: 0.4, inkLevels: 0.79 },
    asleep: { online: true, phase: 'asleep' },
    inkLow: { online: true, phase: 'idle', inkLevels: 0.08, alarm: true },
    fault: { online: true, phase: 'stopped', fault: true },
  },
};

export const PRINTER_MODELS: readonly ModelSpec[] = [BROTHER_DCP_T430W_MODEL];

export const PRINTER_MODEL_MATCH: Partial<ModelMatch> = { exact: ['Brother DCP-T430W'] };
