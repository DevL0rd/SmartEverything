import { emitterChannels, type ModelSpec, type ModelSpecCondition } from '@smarteverything/domain';

const HOUSE = { yaw: 30, pitch: 18, fov: 28, padding: 0.1, focus: 'body' } as const;

const HEIGHT = 0.432;
const RADIUS = 0.115;
const LOWER_H = 0.158;
const WINDOW_H = 0.13;
const SHELL_H = 0.132;
const WINDOW_Y = LOWER_H / 2 + WINDOW_H / 2;
const SHELL_Y = LOWER_H / 2 + WINDOW_H + SHELL_H / 2;
const TOP_Y = SHELL_H / 2;
const WARNING = '#F2C14E';

const SLOTS = [
  [0.068, 0.071, 1],
  [0.081, 0.084, 1],
  [0.094, 0.097, 2],
] as const;

const OUTLET_SLOTS = SLOTS.map(([inner, outer, lod], index): ModelSpec['parts'][number] => ({
  id: `outletSlot${String(index + 1)}`,
  parent: 'shell',
  geometry: { type: 'ring', innerRadius: inner, outerRadius: outer, segments: 96 },
  material: 'body',
  transform: { position: [0, TOP_Y + 0.0012, 0], rotation: [-90, 0, 0] },
  minLod: lod,
}));

const KEYS = [-0.034, 0.034].map((x, index): ModelSpec['parts'][number] => ({
  id: `key${String(index + 1)}`,
  parent: 'fillLid',
  geometry: {
    type: 'cylinder',
    height: 0.0016,
    topRadius: 0.0042,
    bottomRadius: 0.0045,
    segments: 24,
  },
  material: 'grille',
  transform: { position: [x, 0.0024, 0.012] },
  minLod: 2,
}));

type Leaf = ModelSpecCondition['anyOf'][number]['allOf'][number];

function powered(extra: Leaf): ModelSpecCondition {
  return { anyOf: [{ allOf: [{ signal: 'power', op: 'eq', value: true }, extra] }] };
}

export const MIJIA_EVAPORATIVE_HUMIDIFIER_PRO_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.humidifier.mijia-evaporative-pro',
  version: '1.0.0',
  title: 'Mijia Smart Evaporative Humidifier Pro',
  category: 'climate',
  family: 'humidifier',
  footprint: { width: 0.23, depth: 0.23, height: HEIGHT },
  framing: {
    tile: HOUSE,
    card: { ...HOUSE, pitch: 24 },
    hero: { ...HOUSE, pitch: 24, padding: 0.12 },
  },
  shots: [
    {
      id: 'refill',
      when: powered({ signal: 'waterLow', op: 'eq', value: true }),
      focus: 'fillLid',
      zoom: 1.3,
      yaw: 30,
      pitch: 40,
      easeMs: 700,
      loopS: 2,
      symmetry: 360,
      stillAt: 0.5,
    },
    {
      id: 'humidify',
      when: powered({ signal: 'speed', op: 'gt', value: 0 }),
      focus: 'outlet',
      zoom: 1.4,
      yaw: 30,
      pitch: 38,
      easeMs: 900,
      loopS: 4,
      symmetry: 360,
      stillAt: 2,
    },
  ],
  meta: {
    names: {
      display: 'Mijia Smart Evaporative Humidifier Pro',
      synonyms: ['humidifier', 'evaporative humidifier', 'air humidifier'],
    },
    sizeClass: 'small',
    aliases: ['xiaomi.humidifier.600ek'],
  },
  materials: {
    body: { finish: 'matte-white' },
    grille: { finish: 'graphite', pattern: 'perforated' },
    trim: { finish: 'smoked-acrylic', opacity: 0.5 },
    accent: { color: '#5EA8D3', roughness: 0.3 },
  },
  parts: [
    {
      id: 'body',
      geometry: {
        type: 'cylinder',
        height: LOWER_H,
        topRadius: RADIUS,
        bottomRadius: RADIUS,
        bevel: 0.004,
        segments: 96,
      },
      material: 'body',
      transform: { position: [0, 0.012 + LOWER_H / 2, 0] },
      contact: true,
    },
    {
      id: 'baseRing',
      parent: 'body',
      geometry: {
        type: 'cylinder',
        height: 0.012,
        topRadius: 0.108,
        bottomRadius: 0.104,
        bevel: 0.003,
        segments: 64,
      },
      material: 'grille',
      transform: { position: [0, -LOWER_H / 2 - 0.006, 0] },
    },
    {
      id: 'inletBand',
      parent: 'body',
      geometry: {
        type: 'cylinder',
        height: 0.036,
        topRadius: RADIUS + 0.0004,
        bottomRadius: RADIUS + 0.0004,
        segments: 96,
      },
      material: 'grille',
      transform: { position: [0, -0.029, 0] },
      minLod: 1,
    },
    {
      id: 'tank',
      parent: 'body',
      geometry: {
        type: 'cylinder',
        height: WINDOW_H,
        topRadius: RADIUS,
        bottomRadius: RADIUS,
        bevel: 0.003,
        segments: 96,
      },
      material: 'trim',
      transform: { position: [0, WINDOW_Y, 0] },
    },
    {
      id: 'water',
      parent: 'body',
      geometry: {
        type: 'cylinder',
        height: WINDOW_H - 0.004,
        topRadius: RADIUS - 0.005,
        bottomRadius: RADIUS - 0.005,
        segments: 96,
      },
      material: 'accent',
      transform: { position: [0, WINDOW_Y - WINDOW_H, 0] },
    },
    {
      id: 'shell',
      parent: 'body',
      geometry: {
        type: 'cylinder',
        height: SHELL_H,
        topRadius: RADIUS,
        bottomRadius: RADIUS,
        bevel: 0.01,
        segments: 96,
      },
      material: 'body',
      transform: { position: [0, SHELL_Y, 0] },
    },
    {
      id: 'outlet',
      parent: 'shell',
      geometry: { type: 'ring', innerRadius: 0.058, outerRadius: 0.102, segments: 96 },
      material: 'grille',
      transform: { position: [0, TOP_Y + 0.0008, 0], rotation: [-90, 0, 0] },
    },
    ...OUTLET_SLOTS,
    {
      id: 'fillLid',
      parent: 'shell',
      geometry: {
        type: 'cylinder',
        height: 0.004,
        topRadius: 0.054,
        bottomRadius: 0.055,
        bevel: 0.0015,
        segments: 64,
      },
      material: 'body',
      transform: { position: [0, TOP_Y + 0.002, 0] },
    },
    {
      id: 'fillGroove',
      parent: 'shell',
      geometry: { type: 'torus', radius: 0.0562, tube: 0.0012, segments: 96 },
      material: 'body',
      transform: { position: [0, TOP_Y + 0.0006, 0], rotation: [90, 0, 0] },
      minLod: 1,
    },
    {
      id: 'display',
      parent: 'fillLid',
      geometry: { type: 'roundedPlane', width: 0.05, height: 0.03, radius: 0.008, segments: 4 },
      material: 'trim',
      transform: { position: [0, 0.0022, -0.004], rotation: [-90, 0, 0] },
    },
    {
      id: 'displayGlow',
      parent: 'display',
      geometry: { type: 'roundedPlane', width: 0.03, height: 0.012, radius: 0.003, segments: 3 },
      material: 'accent',
      transform: { position: [0, 0, 0.0005] },
    },
    ...KEYS,
  ],
  anchors: [
    {
      kind: 'screen',
      id: 'readout',
      parent: 'fillLid',
      position: [0, 0.003, -0.004],
      rotation: [-90, 0, 0],
      width: 0.05,
      height: 0.03,
    },
    {
      kind: 'effect',
      id: 'humidAir',
      parent: 'shell',
      position: [0, TOP_Y + 0.01, 0],
      effect: 'airflow',
      size: 0.2,
    },
    { kind: 'mount', id: 'floor', position: [0, 0, 0], mount: 'floor' },
    { kind: 'label', id: 'pin', position: [0, HEIGHT + 0.05, 0] },
  ],
  channels: [
    {
      id: 'displayShow',
      target: 'displayGlow',
      property: 'opacity',
      source: 'power',
      map: { type: 'enum', table: { true: 1, false: 0 } },
      motion: { type: 'pose', easeMs: 300 },
      reduced: 'hold',
    },
    {
      id: 'displayLit',
      target: 'displayGlow',
      property: 'emissive',
      source: 'power',
      map: { type: 'enum', table: { true: 1.2, false: 0 } },
      motion: { type: 'pose', easeMs: 300 },
      reduced: 'hold',
    },
    {
      id: 'displayDark',
      target: 'displayGlow',
      property: 'opacity',
      source: 'screenOn',
      map: { type: 'enum', table: { false: 0 } },
      motion: { type: 'pose', easeMs: 450 },
      reduced: 'hold',
    },
    {
      id: 'displayOffline',
      target: 'displayGlow',
      property: 'opacity',
      source: 'online',
      map: { type: 'enum', table: { false: 0 } },
      motion: { type: 'pose', easeMs: 450 },
      reduced: 'hold',
    },
    {
      id: 'waterLowTint',
      target: 'displayGlow',
      property: 'colour',
      source: 'waterLow',
      map: { type: 'enum', table: { true: WARNING } },
      motion: { type: 'pose', easeMs: 250 },
      reduced: 'hold',
    },
    {
      id: 'waterLowPulse',
      target: 'displayGlow',
      property: 'emissive',
      source: 'waterLow',
      map: { type: 'enum', table: { true: 1 } },
      motion: { type: 'pulse', periodS: 2, amplitude: 0.6 },
      reduced: 'hold',
    },
    {
      id: 'waterRise',
      target: 'water',
      property: 'translate',
      axis: 'y',
      source: 'waterLevel',
      map: { type: 'linear', in: [0, 1], out: [0, WINDOW_H], clamp: true },
      motion: { type: 'pose', easeMs: 900 },
      reduced: 'hold',
    },
    {
      id: 'waterLowWater',
      target: 'water',
      property: 'colour',
      source: 'waterLow',
      map: { type: 'enum', table: { true: WARNING } },
      motion: { type: 'pose', easeMs: 250 },
      reduced: 'hold',
    },
    {
      id: 'refillRing',
      target: 'outlet',
      property: 'colour',
      source: 'waterLow',
      map: { type: 'enum', table: { true: WARNING } },
      motion: { type: 'pose', easeMs: 250 },
      reduced: 'hold',
    },
    {
      id: 'refillPulse',
      target: 'outlet',
      property: 'emissive',
      source: 'waterLow',
      map: { type: 'enum', table: { true: 0.8 } },
      motion: { type: 'pulse', periodS: 2, amplitude: 0.5 },
      reduced: 'hold',
    },
    {
      id: 'airStrength',
      target: 'humidAir',
      property: 'opacity',
      source: 'speed',
      map: { type: 'linear', in: [0, 1], out: [0.15, 0.45], clamp: true },
      motion: { type: 'pose', easeMs: 600 },
      reduced: 'hold',
    },
    {
      id: 'airHeight',
      target: 'humidAir',
      property: 'scale',
      axis: 'y',
      source: 'speed',
      map: { type: 'linear', in: [0, 1], out: [0.5, 1], clamp: true },
      motion: { type: 'pose', easeMs: 600 },
      reduced: 'hold',
    },
    ...['displayGlow', 'outlet'].flatMap((id) => emitterChannels(id)),
  ],
  states: {
    off: { power: false },
    auto: { power: true, mode: 'auto', speed: 0.5, waterLevel: 0.7 },
    high: { power: true, mode: 'high', speed: 1, waterLevel: 0.5 },
    sleep: { power: true, mode: 'sleep', speed: 0.2, screenOn: false, waterLevel: 0.6 },
    waterLow: { power: true, waterLow: true, waterLevel: 0.05 },
    offline: { online: false },
  },
};
