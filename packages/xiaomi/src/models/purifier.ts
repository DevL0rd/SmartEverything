import { emitterChannels, type ModelSpec, type ModelSpecChannel } from '@smarteverything/domain';

const HOUSE = { yaw: 30, pitch: 18, fov: 28, padding: 0.1, focus: 'body' } as const;

const TOP = 0.68;

const RINGS = [
  [0.034, 0.04, 0],
  [0.058, 0.064, 1],
  [0.082, 0.088, 1],
  [0.106, 0.116, 0],
] as const;

const GRILLE_RINGS = RINGS.map(([inner, outer, lod], index): ModelSpec['parts'][number] => ({
  id: `outletRing${String(index + 1)}`,
  parent: 'body',
  geometry: { type: 'ring', innerRadius: inner, outerRadius: outer, segments: 96 },
  material: 'grille',
  transform: { position: [0, TOP / 2 - 0.0005, 0], rotation: [-90, 0, 0] },
  minLod: lod,
}));

const FEET = [
  [-0.1, -0.1],
  [0.1, -0.1],
  [-0.1, 0.1],
  [0.1, 0.1],
].map(([x, z], index): ModelSpec['parts'][number] => ({
  id: `foot${String(index + 1)}`,
  geometry: {
    type: 'cylinder',
    height: 0.01,
    topRadius: 0.012,
    bottomRadius: 0.011,
    bevel: 0.002,
    segments: 24,
  },
  material: 'trim',
  transform: { position: [x ?? 0, 0.005, z ?? 0] },
  minLod: 2,
}));

function inletPanel(id: string, rotation: number, x: number, z: number): ModelSpec['parts'] {
  return [
    {
      id: `${id}Backing`,
      parent: 'body',
      geometry: { type: 'roundedPlane', width: 0.2, height: 0.34, radius: 0.012, segments: 4 },
      material: 'trim',
      transform: { position: [x, -0.12, z], rotation: [0, rotation, 0] },
      minLod: 1,
    },
    {
      id,
      parent: 'body',
      geometry: {
        type: 'grille',
        width: 0.2,
        height: 0.34,
        rows: 15,
        columns: 9,
        holeRadius: 0.0042,
      },
      material: 'body',
      transform: { position: [x * 1.004, -0.12, z * 1.004], rotation: [0, rotation, 0] },
      minLod: 1,
    },
  ];
}

const BAND_COLOURS = {
  good: '#6FD39A',
  fair: '#C2E070',
  moderate: '#F2C14E',
  poor: '#F29A4E',
  bad: '#FF6B57',
  severe: '#C77DFF',
} as const;

const RING_REST = '#3A3D42';

function look(
  id: string,
  [target, property]: readonly [string, ModelSpecChannel['property']],
  [source, table]: readonly [string, Record<string, number | string>],
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

const BAND_CHANNELS: ModelSpecChannel[] = [
  look('ringBand', ['outletRing4', 'colour'], ['airQuality', BAND_COLOURS], 250),
  look('ringRest', ['outletRing4', 'colour'], ['power', { false: RING_REST }], 450),
  look('ringLit', ['outletRing4', 'emissive'], ['power', { true: 0.55, false: 0 }]),
  look('ringNight', ['outletRing4', 'emissive'], ['mode', { night: 0.12 }], 450),
  ...emitterChannels('outletRing4'),
  look('stripBand', ['lightStrip', 'colour'], ['airQuality', BAND_COLOURS], 250),
  look('lightBand', ['airLight', 'colour'], ['airQuality', BAND_COLOURS], 250),
  look('lightOn', ['airLight', 'emissive'], ['power', { true: 1, false: 0 }]),
  look('lightNight', ['airLight', 'emissive'], ['mode', { night: 0.2 }], 450),
  ...emitterChannels('airLight'),
];

const AIR_CHANNELS: ModelSpecChannel[] = [
  {
    id: 'airStrength',
    target: 'outlet',
    property: 'opacity',
    source: 'speed',
    map: { type: 'linear', in: [0, 1], out: [0.15, 0.55], clamp: true },
    motion: { type: 'pose', easeMs: 600 },
    reduced: 'hold',
  },
  {
    id: 'airHeight',
    target: 'outlet',
    property: 'scale',
    axis: 'y',
    source: 'speed',
    map: { type: 'linear', in: [0, 1], out: [0.45, 1], clamp: true },
    motion: { type: 'pose', easeMs: 600 },
    reduced: 'hold',
  },
];

export const XIAOMI_AIR_PURIFIER_4_PRO_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.air_purifier.xiaomi-4-pro',
  version: '1.0.0',
  title: 'Xiaomi Smart Air Purifier 4 Pro',
  category: 'climate',
  family: 'air_purifier',
  footprint: { width: 0.275, depth: 0.275, height: TOP },
  framing: {
    tile: HOUSE,
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.12 },
  },
  shots: [
    {
      id: 'clean',
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
      focus: 'outlet',
      zoom: 1.4,
      yaw: 30,
      pitch: 30,
      easeMs: 900,
      loopS: 4,
      symmetry: 360,
      stillAt: 1.5,
    },
  ],
  meta: {
    names: {
      display: 'Xiaomi Smart Air Purifier 4 Pro',
      synonyms: ['air purifier', 'purifier', 'air cleaner'],
    },
    sizeClass: 'medium',
    aliases: ['zhimi.airp.vb4'],
  },
  materials: {
    body: { finish: 'matte-white' },
    trim: { finish: 'satin-black', pattern: 'ribbed' },
    grille: { finish: 'graphite' },
    accent: { color: '#C2E070', roughness: 0.3 },
  },
  parts: [
    {
      id: 'body',
      geometry: {
        type: 'roundedBox',
        width: 0.275,
        height: 0.67,
        depth: 0.275,
        radius: 0.03,
        segments: 6,
      },
      material: 'body',
      transform: { position: [0, 0.345, 0] },
      contact: true,
    },
    {
      id: 'fan',
      parent: 'body',
      geometry: {
        type: 'cylinder',
        height: 0.004,
        topRadius: 0.106,
        bottomRadius: 0.106,
        segments: 96,
      },
      material: 'trim',
      transform: { position: [0, 0.3335 - 0.0005, 0] },
    },
    ...GRILLE_RINGS,
    {
      id: 'screen',
      parent: 'body',
      geometry: { type: 'roundedPlane', width: 0.074, height: 0.052, radius: 0.008, segments: 4 },
      material: 'trim',
      transform: { position: [0, 0.17, 0.1381] },
    },
    {
      id: 'lightStrip',
      parent: 'body',
      geometry: {
        type: 'roundedBox',
        width: 0.06,
        height: 0.0035,
        depth: 0.002,
        radius: 0.0012,
        segments: 3,
      },
      material: 'accent',
      transform: { position: [0, 0.13, 0.1381] },
    },
    ...inletPanel('inletFront', 0, 0, 0.1379),
    ...inletPanel('inletSide', 90, 0.1379, 0),
    {
      id: 'filterSeam',
      parent: 'body',
      geometry: {
        type: 'roundedBox',
        width: 0.2752,
        height: 0.0012,
        depth: 0.2752,
        radius: 0.0005,
        segments: 3,
      },
      material: 'grille',
      transform: { position: [0, 0.07, 0] },
      minLod: 2,
    },
    ...FEET,
  ],
  anchors: [
    {
      kind: 'screen',
      id: 'display',
      parent: 'body',
      position: [0, 0.17, 0.139],
      width: 0.074,
      height: 0.052,
    },
    {
      kind: 'effect',
      id: 'outlet',
      parent: 'body',
      position: [0, TOP / 2, 0],
      effect: 'airflow',
      size: 0.24,
    },
    {
      kind: 'emitter',
      id: 'airLight',
      parent: 'body',
      position: [0, 0.15, 0.142],
      color: '#C2E070',
      intensity: 0.5,
      radius: 0.06,
    },
    { kind: 'mount', id: 'floor', position: [0, 0, 0], mount: 'floor' },
    { kind: 'label', id: 'pin', position: [0, TOP + 0.05, 0] },
  ],
  channels: [
    {
      id: 'fanSpin',
      target: 'fan',
      property: 'rotate',
      axis: 'y',
      source: 'speed',
      map: { type: 'speed', in: [0, 1], perSecond: [0.5, 3] },
      motion: { type: 'spin' },
      reduced: 'hold',
    },
    ...BAND_CHANNELS,
    {
      id: 'stripOn',
      target: 'lightStrip',
      property: 'emissive',
      source: 'power',
      map: { type: 'enum', table: { true: 1.3, false: 0 } },
      motion: { type: 'pose', easeMs: 300 },
      reduced: 'hold',
    },
    {
      id: 'stripNight',
      target: 'lightStrip',
      property: 'emissive',
      source: 'mode',
      map: { type: 'enum', table: { night: 0 } },
      motion: { type: 'pose', easeMs: 450 },
      reduced: 'hold',
    },
    {
      id: 'stripFault',
      target: 'lightStrip',
      property: 'colour',
      source: 'fault',
      map: { type: 'enum', table: { true: '#F2B45E' } },
      motion: { type: 'pose', easeMs: 250 },
      reduced: 'hold',
    },
    {
      id: 'stripPulse',
      target: 'lightStrip',
      property: 'emissive',
      source: 'fault',
      map: { type: 'enum', table: { true: 1 } },
      motion: { type: 'pulse', periodS: 2, amplitude: 0.6 },
      reduced: 'hold',
    },
    {
      id: 'screenOn',
      target: 'screen',
      property: 'emissive',
      source: 'screenOn',
      map: { type: 'enum', table: { true: 0.35, false: 0 } },
      motion: { type: 'pose', easeMs: 300 },
      reduced: 'hold',
    },
    ...AIR_CHANNELS,
    ...['lightStrip', 'screen'].flatMap((id) => emitterChannels(id)),
  ],
  states: {
    off: { power: false, airQuality: 'good' },
    autoGood: { power: true, mode: 'auto', speed: 0.3, airQuality: 'good', screenOn: true },
    boostPoor: { power: true, mode: 'favourite', speed: 1, airQuality: 'poor', screenOn: true },
    night: { power: true, mode: 'night', speed: 0.1, airQuality: 'fair', screenOn: false },
    filter: { power: true, fault: true, airQuality: 'moderate', screenOn: true },
    offline: { online: false },
  },
};
