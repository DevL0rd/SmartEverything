import {
  emitterChannels,
  type ModelSpec,
  type ModelSpecChannel,
  type ModelSpecCondition,
} from '@smarteverything/domain';

const HOUSE = { yaw: 30, pitch: 22, fov: 28, padding: 0.14, focus: 'body' } as const;

const SIDE = 0.074;
const HEIGHT = 0.075;
const FOOT_H = 0.005;
const BAND_H = 0.004;
const BODY_H = 0.064;
const BODY_Y = FOOT_H + BAND_H / 2 + BODY_H / 2;
const TOP = BODY_H / 2;
const FRONT = SIDE / 2;
const WARNING = '#F2C14E';
const FAULT = '#E5484D';

type Part = ModelSpec['parts'][number];

const OUTLET_SLOTS = [
  [0.0085, 0.0095, 1],
  [0.0135, 0.0145, 1],
  [0.0045, 0.0052, 2],
] as const;

const SLOT_PARTS = OUTLET_SLOTS.map(([inner, outer, lod], index): Part => ({
  id: `outletSlot${String(index + 1)}`,
  parent: 'outlet',
  geometry: { type: 'ring', innerRadius: inner, outerRadius: outer, segments: 64 },
  material: 'body',
  transform: { position: [0, 0.0017, 0], rotation: [-90, 0, 0] },
  minLod: lod,
}));

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

function tint(id: string, target: string): ModelSpecChannel {
  return {
    id,
    target,
    property: 'colour',
    source: 'colour',
    map: { type: 'colour', from: 'signal' },
    motion: { type: 'pose', easeMs: 250 },
    reduced: 'hold',
  };
}

function moodChannels(id: string, target: string, lit: number): ModelSpecChannel[] {
  return [
    tint(`${id}Colour`, target),
    look(`${id}On`, [target, 'emissive'], ['lamp', { true: lit, false: 0 }]),
    look(`${id}Power`, [target, 'emissive'], ['power', { false: 0 }], 450),
    look(`${id}Offline`, [target, 'emissive'], ['online', { false: 0 }], 450),
  ];
}

function scent(
  id: string,
  property: 'opacity' | 'scale',
  out: readonly [number, number],
): ModelSpecChannel {
  return {
    id,
    target: 'scent',
    property,
    ...(property === 'scale' ? { axis: 'y' } : {}),
    source: 'speed',
    map: { type: 'linear', in: [0, 1], out: [out[0], out[1]], clamp: true },
    motion: { type: 'pose', easeMs: 600 },
    reduced: 'hold',
  };
}

const LED_CHANNELS: ModelSpecChannel[] = [
  look('ledOn', ['statusLed', 'emissive'], ['power', { true: 0.8, false: 0 }]),
  look('ledChargeTint', ['statusLed', 'colour'], ['charging', { true: WARNING }], 250),
  {
    id: 'ledChargePulse',
    target: 'statusLed',
    property: 'emissive',
    source: 'charging',
    map: { type: 'enum', table: { true: 0.9 } },
    motion: { type: 'pulse', periodS: 2, amplitude: 0.5 },
    reduced: 'hold',
  },
  look('ledFaultTint', ['statusLed', 'colour'], ['fault', { true: FAULT }], 250),
  look('ledFault', ['statusLed', 'emissive'], ['fault', { true: 1.1 }]),
  ...emitterChannels('statusLed'),
];

const REFILL_CHANNELS: ModelSpecChannel[] = [
  look('refillTint', ['outletRim', 'colour'], ['waterLow', { true: WARNING }], 250),
  {
    id: 'refillPulse',
    target: 'outletRim',
    property: 'emissive',
    source: 'waterLow',
    map: { type: 'enum', table: { true: 0.7 } },
    motion: { type: 'pulse', periodS: 2, amplitude: 0.5 },
    reduced: 'hold',
  },
];

const SCENT_CHANNELS: ModelSpecChannel[] = [
  scent('scentStrength', 'opacity', [0, 0.5]),
  scent('scentHeight', 'scale', [0.45, 1]),
  look('scentOff', ['scent', 'opacity'], ['power', { false: 0 }], 450),
];

const running: ModelSpecCondition = {
  anyOf: [
    {
      allOf: [
        { signal: 'power', op: 'eq', value: true },
        { signal: 'speed', op: 'gt', value: 0 },
      ],
    },
  ],
};

const SHELL_PARTS: Part[] = [
  {
    id: 'foot',
    geometry: {
      type: 'roundedBox',
      width: 0.062,
      height: FOOT_H,
      depth: 0.062,
      radius: 0.002,
      segments: 3,
    },
    material: 'trim',
    transform: { position: [0, FOOT_H / 2, 0] },
    contact: true,
  },
  {
    id: 'lightBand',
    geometry: {
      type: 'roundedBox',
      width: 0.067,
      height: BAND_H,
      depth: 0.067,
      radius: 0.0018,
      segments: 3,
    },
    material: 'accent',
    transform: { position: [0, FOOT_H + BAND_H / 2, 0] },
  },
  {
    id: 'body',
    geometry: {
      type: 'roundedBox',
      width: SIDE,
      height: BODY_H,
      depth: SIDE,
      radius: 0.014,
      segments: 5,
    },
    material: 'body',
    transform: { position: [0, BODY_Y, 0] },
  },
  {
    id: 'outletRim',
    parent: 'body',
    geometry: {
      type: 'cylinder',
      height: 0.0026,
      topRadius: 0.021,
      bottomRadius: 0.0215,
      bevel: 0.0009,
      segments: 64,
    },
    material: 'trim',
    transform: { position: [0, TOP + 0.0006, 0] },
  },
  {
    id: 'outlet',
    parent: 'outletRim',
    geometry: {
      type: 'cylinder',
      height: 0.0018,
      topRadius: 0.0172,
      bottomRadius: 0.0172,
      segments: 64,
    },
    material: 'trim',
    transform: { position: [0, 0.0008, 0] },
  },
  ...SLOT_PARTS,
  {
    id: 'lidGroove',
    parent: 'body',
    geometry: { type: 'torus', radius: 0.0262, tube: 0.0006, segments: 64 },
    material: 'trim',
    transform: { position: [0, TOP - 0.0001, 0], rotation: [90, 0, 0] },
    minLod: 1,
  },
];

const DETAIL_PARTS: Part[] = [
  {
    id: 'button',
    parent: 'body',
    geometry: {
      type: 'cylinder',
      height: 0.0012,
      topRadius: 0.0048,
      bottomRadius: 0.0052,
      bevel: 0.0004,
      segments: 32,
    },
    material: 'body',
    transform: { position: [0, TOP + 0.0004, 0.0265] },
    minLod: 1,
  },
  {
    id: 'statusLed',
    parent: 'body',
    geometry: {
      type: 'cylinder',
      height: 0.0006,
      topRadius: 0.0011,
      bottomRadius: 0.0011,
      segments: 16,
    },
    material: 'accent',
    transform: { position: [0.0105, TOP + 0.0003, 0.0265] },
    minLod: 1,
  },
  {
    id: 'sensorWindow',
    parent: 'body',
    geometry: { type: 'roundedPlane', width: 0.013, height: 0.0075, radius: 0.0035, segments: 4 },
    material: 'trim',
    transform: { position: [0, 0.009, FRONT + 0.0002] },
    minLod: 1,
  },
  {
    id: 'port',
    parent: 'body',
    geometry: {
      type: 'roundedBox',
      width: 0.009,
      height: 0.0032,
      depth: 0.0012,
      radius: 0.0012,
      segments: 3,
    },
    material: 'trim',
    transform: { position: [0, -0.02, -FRONT] },
    minLod: 2,
  },
];

export const XIAOMI_SMART_SCENT_DIFFUSER_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.diffuser.xiaomi-xw2iv',
  version: '1.0.0',
  title: 'Xiaomi Smart Scent Diffuser',
  category: 'climate',
  family: 'diffuser',
  footprint: { width: SIDE, depth: SIDE, height: HEIGHT },
  framing: {
    tile: HOUSE,
    card: { ...HOUSE, pitch: 26 },
    hero: { ...HOUSE, pitch: 26, padding: 0.16 },
  },
  shots: [
    {
      id: 'diffuse',
      when: running,
      focus: 'outlet',
      zoom: 1.4,
      yaw: 0,
      pitch: 14,
      easeMs: 800,
      loopS: 3,
      symmetry: 360,
      stillAt: 1.5,
    },
  ],
  meta: {
    names: {
      display: 'Xiaomi Smart Scent Diffuser',
      synonyms: ['scent diffuser', 'aroma diffuser', 'fragrance diffuser', 'diffuser'],
    },
    sizeClass: 'small',
    aliases: ['xiaomi.diffuser.xw2iv'],
  },
  materials: {
    body: { color: '#D4D7DA', roughness: 0.6 },
    trim: { finish: 'graphite' },
    accent: { color: '#E4EBF0', roughness: 0.3 },
  },
  parts: [...SHELL_PARTS, ...DETAIL_PARTS],
  anchors: [
    {
      kind: 'emitter',
      id: 'moodLight',
      position: [0, FOOT_H + BAND_H / 2, 0],
      color: '#E4EBF0',
      intensity: 0.6,
      radius: 0.05,
    },
    { kind: 'effect', id: 'scent', position: [0, HEIGHT + 0.004, 0], effect: 'mist', size: 0.08 },
    { kind: 'mount', id: 'table', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, HEIGHT + 0.04, 0] },
    { kind: 'hit', id: 'tap', position: [0, HEIGHT / 2, 0], size: [SIDE, HEIGHT, SIDE] },
  ],
  channels: [
    ...moodChannels('band', 'lightBand', 1.2),
    ...moodChannels('mood', 'moodLight', 1),
    ...SCENT_CHANNELS,
    ...LED_CHANNELS,
    ...REFILL_CHANNELS,
    ...emitterChannels('outletRim'),
  ],
  states: {
    off: { power: false },
    on: { power: true, speed: 0.5, lamp: false },
    level1: { power: true, speed: 0.33, lamp: false },
    level3: { power: true, speed: 1, lamp: false },
    moodLight: { power: true, speed: 0.5, lamp: true, colour: '#F2A65E' },
    refillLow: { power: true, speed: 0.33, waterLow: true, waterLevel: 0.05 },
    charging: { power: false, charging: true },
    fault: { power: true, fault: true },
    offline: { online: false },
  },
};
