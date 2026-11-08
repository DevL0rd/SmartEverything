import { emitterChannels, type ModelSpec } from '@smarteverything/domain';

const TALL = { yaw: 30, pitch: 12, fov: 28, padding: 0.1, focus: 'column' } as const;

const COLUMN_HEIGHT = 0.96;
const COLUMN_TOP_RADIUS = 0.057;
const COLUMN_BOTTOM_RADIUS = 0.066;
const COLUMN_TAPER = (COLUMN_BOTTOM_RADIUS - COLUMN_TOP_RADIUS) / COLUMN_HEIGHT;
const SLOT_Y = 0.04;
const SLOT_DEPTH = 0.02;
const SLAT_DEPTH = 0.006;
const SLOT_SHELL = (COLUMN_BOTTOM_RADIUS + COLUMN_TOP_RADIUS) / 2 - COLUMN_TAPER * SLOT_Y;
const SLOT_TILT = -(Math.atan(COLUMN_TAPER) * 180) / Math.PI;
const SLOT_FACE = SLOT_SHELL + 0.001;
const SLAT_FACE = SLOT_FACE + 0.0005;

const BUTTONS = [-0.021, -0.007, 0.007, 0.021].map((x, index): ModelSpec['parts'][number] => ({
  id: `button${String(index + 1)}`,
  parent: 'cap',
  geometry: {
    type: 'cylinder',
    height: 0.002,
    topRadius: 0.0045,
    bottomRadius: 0.0045,
    segments: 24,
  },
  material: 'trim',
  transform: { position: [x, 0.0115, 0.012] },
  minLod: 2,
}));

export const XIAOMI_SMART_TOWER_FAN_2_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.tower_fan.xiaomi-smart-tower-fan-2',
  version: '1.0.0',
  title: 'Xiaomi Smart Tower Fan 2',
  category: 'climate',
  family: 'tower_fan',
  footprint: { width: 0.29, depth: 0.29, height: 1.014 },
  framing: {
    tile: { ...TALL, padding: 0.06 },
    card: TALL,
    hero: { ...TALL, padding: 0.1 },
  },
  shots: [
    {
      id: 'breeze',
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
      focus: 'airflow',
      zoom: 1.3,
      yaw: 24,
      pitch: 16,
      easeMs: 900,
      loopS: 16,
      symmetry: 360,
      stillAt: 4,
    },
  ],
  meta: {
    names: { display: 'Xiaomi Smart Tower Fan 2', synonyms: ['tower fan', 'column fan', 'fan'] },
    sizeClass: 'tall',
    aliases: ['xiaomi.fan.p45'],
  },
  materials: {
    body: { finish: 'matte-white' },
    trim: { finish: 'satin-black', pattern: 'ribbed' },
    grille: { finish: 'graphite' },
    accent: { color: '#5ED3CF', roughness: 0.3 },
  },
  parts: [
    {
      id: 'base',
      geometry: {
        type: 'cylinder',
        height: 0.028,
        topRadius: 0.142,
        bottomRadius: 0.145,
        bevel: 0.01,
        segments: 96,
      },
      material: 'body',
      transform: { position: [0, 0.014, 0] },
      contact: true,
    },
    {
      id: 'baseSeam',
      parent: 'base',
      geometry: { type: 'torus', radius: 0.074, tube: 0.0018, segments: 64 },
      material: 'grille',
      transform: { position: [0, 0.014, 0], rotation: [90, 0, 0] },
      minLod: 1,
    },
    {
      id: 'column',
      geometry: {
        type: 'cylinder',
        height: COLUMN_HEIGHT,
        topRadius: COLUMN_TOP_RADIUS,
        bottomRadius: COLUMN_BOTTOM_RADIUS,
        bevel: 0.02,
        segments: 96,
      },
      material: 'body',
      transform: { position: [0, 0.51, 0] },
    },
    {
      id: 'slotInterior',
      parent: 'column',
      geometry: {
        type: 'roundedBox',
        width: 0.036,
        height: 0.74,
        depth: SLOT_DEPTH,
        radius: 0.008,
        segments: 4,
      },
      material: 'trim',
      transform: {
        position: [0, SLOT_Y, SLOT_FACE - SLOT_DEPTH / 2],
        rotation: [SLOT_TILT, 0, 0],
      },
    },
    {
      id: 'louvres',
      parent: 'column',
      geometry: {
        type: 'slats',
        count: 24,
        spacing: 0.03,
        width: 0.03,
        height: 0.0042,
        depth: SLAT_DEPTH,
      },
      material: 'grille',
      transform: {
        position: [0, SLOT_Y, SLAT_FACE - SLAT_DEPTH / 2],
        rotation: [SLOT_TILT, 0, 0],
      },
      minLod: 2,
    },
    {
      id: 'cap',
      parent: 'column',
      geometry: {
        type: 'cylinder',
        height: 0.024,
        topRadius: 0.054,
        bottomRadius: 0.057,
        bevel: 0.008,
        segments: 96,
      },
      material: 'body',
      transform: { position: [0, 0.492, 0] },
    },
    {
      id: 'capRing',
      parent: 'cap',
      geometry: { type: 'torus', radius: 0.0565, tube: 0.0015, segments: 64 },
      material: 'grille',
      transform: { position: [0, -0.012, 0], rotation: [90, 0, 0] },
      minLod: 1,
    },
    {
      id: 'leds',
      parent: 'cap',
      geometry: {
        type: 'roundedBox',
        width: 0.028,
        height: 0.002,
        depth: 0.004,
        radius: 0.001,
        segments: 3,
      },
      material: 'accent',
      transform: { position: [0, 0.0122, 0.03] },
      minLod: 1,
    },
    ...BUTTONS,
    {
      id: 'rearInlet',
      parent: 'column',
      geometry: {
        type: 'roundedBox',
        width: 0.044,
        height: 0.5,
        depth: 0.016,
        radius: 0.006,
        segments: 4,
      },
      material: 'grille',
      transform: { position: [0, -0.05, -0.0545] },
      minLod: 2,
    },
  ],
  anchors: [
    {
      kind: 'effect',
      id: 'airflow',
      parent: 'column',
      position: [0, 0.149, 0.075],
      effect: 'airflow',
      size: 0.3,
    },
    { kind: 'mount', id: 'floor', position: [0, 0, 0], mount: 'floor' },
    { kind: 'label', id: 'pin', position: [0, 1.06, 0] },
  ],
  channels: [
    {
      id: 'sweep',
      target: 'column',
      property: 'rotate',
      axis: 'y',
      source: 'oscillating',
      map: { type: 'enum', table: { true: 1 } },
      motion: { type: 'oscillate', limits: [-75, 75], speed: 18.75 },
      reduced: 'hold',
    },
    {
      id: 'airScroll',
      target: 'slotInterior',
      property: 'uvScroll',
      source: 'speed',
      map: { type: 'speed', in: [0, 1], perSecond: [0.5, 3] },
      motion: { type: 'spin' },
      reduced: 'hold',
    },
    {
      id: 'airStrength',
      target: 'airflow',
      property: 'opacity',
      source: 'speed',
      map: { type: 'linear', in: [0, 1], out: [0.15, 0.5], clamp: true },
      motion: { type: 'pose', easeMs: 600 },
      reduced: 'hold',
    },
    {
      id: 'airReach',
      target: 'airflow',
      property: 'scale',
      axis: 'z',
      source: 'speed',
      map: { type: 'linear', in: [0, 1], out: [0.45, 1], clamp: true },
      motion: { type: 'pose', easeMs: 600 },
      reduced: 'hold',
    },
    {
      id: 'ledsOn',
      target: 'leds',
      property: 'emissive',
      source: 'power',
      map: { type: 'enum', table: { true: 1.4, false: 0 } },
      motion: { type: 'pose', easeMs: 300 },
      reduced: 'hold',
    },
    {
      id: 'ledsSleep',
      target: 'leds',
      property: 'emissive',
      source: 'mode',
      map: { type: 'enum', table: { sleep: 0 } },
      motion: { type: 'pose', easeMs: 450 },
      reduced: 'hold',
    },
    ...emitterChannels('leds'),
  ],
  states: {
    off: { power: false },
    low: { power: true, speed: 0.25, oscillating: false },
    high: { power: true, speed: 1, oscillating: false },
    sweep: { power: true, speed: 0.6, oscillating: true, swingAngle: 150 },
    sleep: { power: true, speed: 0.1, mode: 'sleep' },
    offline: { online: false },
  },
};
