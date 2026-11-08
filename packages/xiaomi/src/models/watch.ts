import {
  emitterChannels,
  type ModelSpec,
  type ModelSpecChannel,
  type ModelSpecPart,
} from '@smarteverything/domain';

const HOUSE = { yaw: 30, pitch: 35, fov: 28, padding: 0.1, focus: 'case' } as const;

const R = 0.023;
const HEIGHT = 0.011;
const CROWN_X = 0.024;
const STRAP_LENGTH = 0.052;
const STRAP_Z = 0.0185 + STRAP_LENGTH / 2;
const STRAP_TILT = 5;
const FACE = 0.0376;
const UP: [number, number, number] = [-90, 0, 0];

const CASE_PROFILE: [number, number][] = [
  [0, 0],
  [0.0158, 0],
  [0.0165, 0.0004],
  [0.0166, 0.0008],
  [0.02, 0.001],
  [0.0221, 0.0018],
  [0.0228, 0.0032],
  [R, 0.005],
  [R, 0.0075],
  [0.0226, 0.0092],
  [0.0219, 0.01],
  [0.021, 0.0102],
  [0.0206, 0.0099],
  [0.0205, 0.0088],
  [0, 0.0088],
];

const GLASS_PROFILE: [number, number][] = [
  [0, HEIGHT],
  [0.009, 0.01095],
  [0.016, 0.0107],
  [0.0198, 0.0102],
  [0.0205, 0.0097],
  [0.0205, 0.0088],
  [0, 0.0088],
];

function box(
  id: string,
  size: readonly [number, number, number, number],
  material: string,
  options: Omit<ModelSpecPart, 'id' | 'geometry' | 'material'>,
): ModelSpecPart {
  return {
    id,
    geometry: {
      type: 'roundedBox',
      width: size[0],
      height: size[1],
      depth: size[2],
      radius: size[3],
      segments: 4,
    },
    material,
    ...options,
  };
}

function pose(
  id: string,
  [target, property]: readonly [string, ModelSpecChannel['property']],
  [source, table]: readonly [string, Readonly<Record<string, number | string>>],
  easeMs: number,
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

function strap(id: string, side: 1 | -1): ModelSpecPart {
  return box(id, [0.022, 0.003, STRAP_LENGTH, 0.0012], 'strap', {
    transform: { position: [0, 0.0045, side * STRAP_Z], rotation: [side * STRAP_TILT, 0, 0] },
  });
}

function tick(id: string, at: readonly [number, number], turn: number): ModelSpecPart {
  return box(id, [0.001, 0.0003, 0.0025, 0.00012], 'screen', {
    parent: 'case',
    transform: { position: [at[0], 0.0103, at[1]], rotation: [0, turn, 0] },
    minLod: 2,
  });
}

function hole(id: string, z: number): ModelSpecPart {
  return {
    id,
    parent: 'strapNear',
    geometry: {
      type: 'cylinder',
      height: 0.0003,
      topRadius: 0.0007,
      bottomRadius: 0.0007,
      segments: 16,
    },
    material: 'screen',
    transform: { position: [0, 0.0015, z] },
    minLod: 2,
  };
}

const PARTS: ModelSpecPart[] = [
  {
    id: 'case',
    geometry: { type: 'lathe', profile: CASE_PROFILE, segments: 72 },
    material: 'case',
    contact: true,
  },
  {
    id: 'glass',
    parent: 'case',
    geometry: { type: 'lathe', profile: GLASS_PROFILE, segments: 72 },
    material: 'screen',
  },
  box('lugFar', [0.0245, 0.0075, 0.007, 0.0018], 'case', {
    parent: 'case',
    transform: { position: [0, 0.005, -0.0198] },
  }),
  box('lugNear', [0.0245, 0.0075, 0.007, 0.0018], 'case', {
    parent: 'case',
    transform: { position: [0, 0.005, 0.0198] },
  }),
  {
    id: 'crown',
    parent: 'case',
    geometry: {
      type: 'cylinder',
      height: 0.0032,
      topRadius: 0.0034,
      bottomRadius: 0.0034,
      bevel: 0.0006,
      segments: 32,
    },
    material: 'case',
    transform: { position: [CROWN_X, 0.0058, -0.004], rotation: [0, 0, 90] },
  },
  {
    id: 'crownRing',
    parent: 'case',
    geometry: { type: 'torus', radius: 0.0021, tube: 0.0003, segments: 32 },
    material: 'screen',
    transform: { position: [CROWN_X + 0.0017, 0.0058, -0.004], rotation: [0, 90, 0] },
    minLod: 2,
  },
  box('button', [0.0034, 0.003, 0.0085, 0.001], 'case', {
    parent: 'case',
    transform: { position: [0.0214, 0.0052, 0.0105] },
  }),
  strap('strapFar', -1),
  strap('strapNear', 1),
  box('keeper', [0.0235, 0.0042, 0.0035, 0.001], 'strap', {
    parent: 'strapNear',
    transform: { position: [0, 0.0004, 0.0185] },
    minLod: 1,
  }),
  box('buckle', [0.024, 0.0034, 0.003, 0.0009], 'case', {
    parent: 'strapFar',
    transform: { position: [0, 0.0004, -0.0245] },
    minLod: 1,
  }),
  hole('holeA', -0.002),
  hole('holeB', 0.005),
  hole('holeC', 0.012),
  tick('tick12', [0, -0.0216], 0),
  tick('tick3', [0.0216, 0], 90),
  tick('tick6', [0, 0.0216], 0),
  tick('tick9', [-0.0216, 0], 90),
  {
    id: 'chargeGlow',
    geometry: { type: 'glow', width: 0.07, height: 0.07, segments: 24 },
    material: 'accent',
    transform: { position: [0, 0.0002, 0], rotation: UP },
    minLod: 1,
  },
];

export const XIAOMI_WATCH_S5_46_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.watch.xiaomi-s5-46',
  version: '1.0.0',
  title: 'Xiaomi Watch S5 46 mm',
  category: 'wearable',
  family: 'wearable',
  footprint: { width: R + CROWN_X + 0.0016, depth: 2 * (0.0185 + STRAP_LENGTH), height: HEIGHT },
  framing: {
    tile: { ...HOUSE, padding: 0.08 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.12, focus: 'glass' },
  },
  shots: [
    {
      id: 'face',
      when: {
        anyOf: [
          { allOf: [{ signal: 'screenOn', op: 'eq', value: true }] },
          { allOf: [{ signal: 'charging', op: 'eq', value: true }] },
        ],
      },
      focus: 'glass',
      zoom: 1.3,
      yaw: 15,
      pitch: 50,
      easeMs: 800,
      loopS: 2,
      symmetry: 360,
      stillAt: 1,
    },
  ],
  meta: {
    names: {
      display: 'Xiaomi Watch S5 46 mm',
      synonyms: ['xiaomi watch', 'watch s5', 'smartwatch', 'smart watch', 'miwear watch'],
    },
    sizeClass: 'small',
    variants: ['silver', 'black'],
    aliases: ['miwear.watch.p62g'],
  },
  materials: {
    case: { finish: 'brushed-aluminium' },
    strap: { finish: 'rubber' },
    screen: { finish: 'satin-black', roughness: 0.06, clearcoat: 1 },
    accent: { color: '#5ED38A', roughness: 0.4, opacity: 0 },
  },
  finishes: {
    silver: { strap: { finish: 'matte-white', roughness: 0.7 } },
    black: { case: { finish: 'graphite' } },
  },
  defaultFinish: 'silver',
  parts: PARTS,
  anchors: [
    {
      kind: 'screen',
      id: 'face',
      parent: 'case',
      position: [0, HEIGHT + 0.0001, 0],
      rotation: UP,
      width: FACE,
      height: FACE,
    },
    {
      kind: 'emitter',
      id: 'faceLight',
      parent: 'case',
      position: [0, HEIGHT + 0.001, 0],
      color: '#6FB7FF',
      intensity: 0.5,
      radius: 0.02,
    },
    { kind: 'mount', id: 'table', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, 0.03, 0] },
    {
      kind: 'hit',
      id: 'tap',
      position: [0, HEIGHT / 2, 0],
      size: [2 * R, HEIGHT, 2 * R],
    },
  ],
  channels: [
    pose('faceTint', ['glass', 'colour'], ['screenOn', { true: '#22304F' }], 300),
    pose('faceLit', ['glass', 'emissive'], ['screenOn', { true: 0.9, false: 0 }], 300),
    pose('chargeTint', ['chargeGlow', 'colour'], ['charging', { true: '#5ED38A' }], 300),
    pose('chargeLit', ['chargeGlow', 'emissive'], ['charging', { true: 0.8, false: 0 }], 300),
    pose('chargeShow', ['chargeGlow', 'opacity'], ['charging', { true: 0.7, false: 0 }], 300),
    ...['faceLight', 'glass', 'chargeGlow'].flatMap((id) => emitterChannels(id)),
  ],
  states: {
    off: { power: false, screenOn: false },
    idle: { power: true, online: true, screenOn: false, charging: false },
    on: { power: true, online: true, screenOn: true },
    charging: { power: true, online: true, screenOn: false, charging: true, battery: 0.4 },
    lowBattery: { power: true, online: true, screenOn: false, battery: 0.08, batteryLow: true },
    offline: { online: false },
  },
};
