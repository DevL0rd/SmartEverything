import type { ModelSpec, ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { finishSet } from '../../helpers/finishes';
import { look } from '../screens/look';

const WIDTH = 0.399;
const DEPTH = 0.294;
const BASE_H = 0.021;
const REAR_H = 0.0295;
const REAR_FRONT = -0.12;
const LID_T = 0.0075;
const LID_L = 0.259;
const LID_FACE = LID_T / 2;
const HINGE_Y = BASE_H + LID_T / 2;
const HINGE_Z = -0.11;
const OPEN_DEG = -20;
const CLOSE_DEG = 110;
const SCREEN_W = 0.3876;
const SCREEN_H = 0.2423;
const SCREEN_Y = LID_L / 2 + 0.0023;
const DECK = BASE_H / 2;
const HOUSE = { yaw: 30, pitch: 22, fov: 28, padding: 0.08, focus: 'lid' } as const;
const KEY_ROWS = [-0.062, -0.043, -0.024, -0.005, 0.014, 0.033] as const;

type Options = Omit<ModelSpecPart, 'id' | 'geometry' | 'material'>;

type Size = readonly [number, number, number, number];

function box(id: string, size: Size, material: string, options: Options): ModelSpecPart {
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

function keyRow(z: number, index: number): ModelSpecPart {
  return box(`keys${String(index + 1)}`, [0.336, 0.0016, 0.0155, 0.0007], 'deck', {
    parent: 'base',
    transform: { position: [-0.006, DECK + 0.0009, z] },
    minLod: 1,
  });
}

const BASE: readonly ModelSpecPart[] = [
  box('base', [WIDTH, BASE_H, DEPTH, 0.0045], 'body', {
    transform: { position: [0, BASE_H / 2, 0] },
    contact: true,
  }),
  box('rearBlock', [WIDTH - 0.004, REAR_H, 0.027, 0.005], 'body', {
    parent: 'base',
    transform: { position: [0, (REAR_H - BASE_H) / 2, REAR_FRONT - 0.0135] },
  }),
  {
    id: 'keyboard',
    parent: 'base',
    geometry: { type: 'roundedPlane', width: 0.352, height: 0.13, radius: 0.004, segments: 3 },
    material: 'deck',
    transform: { position: [-0.006, DECK + 0.0003, -0.014], rotation: [-90, 0, 0] },
  },
  {
    id: 'keyGlow',
    parent: 'base',
    geometry: { type: 'glow', width: 0.34, height: 0.12, segments: 24 },
    material: 'accent',
    transform: { position: [-0.006, DECK + 0.0006, -0.014], rotation: [-90, 0, 0] },
    minLod: 1,
  },
  ...KEY_ROWS.map(keyRow),
  {
    id: 'touchpad',
    parent: 'base',
    geometry: { type: 'roundedPlane', width: 0.13, height: 0.082, radius: 0.005, segments: 3 },
    material: 'deck',
    transform: { position: [0, DECK + 0.0004, 0.096], rotation: [-90, 0, 0] },
  },
  box('frontBar', [0.36, 0.0028, 0.004, 0.0012], 'accent', {
    parent: 'base',
    transform: { position: [0, -DECK + 0.004, DEPTH / 2 - 0.0005] },
  }),
  box('rearGlow', [0.12, 0.004, 0.003, 0.0014], 'accent', {
    parent: 'rearBlock',
    transform: { position: [0, 0.002, -0.0135] },
    minLod: 1,
  }),
];

const VENTS: readonly ModelSpecPart[] = [
  {
    id: 'rearVentLeft',
    parent: 'rearBlock',
    geometry: {
      type: 'grille',
      width: 0.12,
      height: 0.016,
      rows: 3,
      columns: 24,
      holeRadius: 0.0018,
    },
    material: 'deck',
    transform: { position: [-0.12, 0, -0.0137], rotation: [0, 180, 0] },
    minLod: 1,
  },
  {
    id: 'rearVentRight',
    parent: 'rearBlock',
    geometry: {
      type: 'grille',
      width: 0.12,
      height: 0.016,
      rows: 3,
      columns: 24,
      holeRadius: 0.0018,
    },
    material: 'deck',
    transform: { position: [0.12, 0, -0.0137], rotation: [0, 180, 0] },
    minLod: 1,
  },
  {
    id: 'sideVent',
    parent: 'base',
    geometry: {
      type: 'grille',
      width: 0.07,
      height: 0.011,
      rows: 2,
      columns: 14,
      holeRadius: 0.0016,
    },
    material: 'deck',
    transform: { position: [-WIDTH / 2 - 0.0002, 0.001, -0.08], rotation: [0, -90, 0] },
    minLod: 2,
  },
  ...[-0.17, 0.17].map((x, index) =>
    box(`foot${String(index + 1)}`, [0.05, 0.002, 0.012, 0.0009], 'deck', {
      parent: 'base',
      transform: { position: [x, -DECK - 0.0008, 0.11] },
      minLod: 2,
    }),
  ),
];

const LID: readonly ModelSpecPart[] = [
  box('hinge', [WIDTH - 0.06, LID_T, LID_T, 0.0036], 'body', {
    transform: { position: [0, HINGE_Y, HINGE_Z], rotation: [OPEN_DEG, 0, 0] },
  }),
  box('lid', [WIDTH, LID_L, LID_T, 0.0035], 'body', {
    parent: 'hinge',
    transform: { position: [0, LID_L / 2, 0] },
  }),
  {
    id: 'panel',
    parent: 'lid',
    geometry: {
      type: 'roundedPlane',
      width: WIDTH - 0.004,
      height: LID_L - 0.004,
      radius: 0.003,
      segments: 3,
    },
    material: 'panel',
    transform: { position: [0, 0, LID_FACE + 0.0008] },
  },
  {
    id: 'screenGlow',
    parent: 'lid',
    geometry: {
      type: 'roundedPlane',
      width: SCREEN_W,
      height: SCREEN_H,
      radius: 0.002,
      segments: 3,
    },
    material: 'panel',
    transform: { position: [0, SCREEN_Y - LID_L / 2, LID_FACE + 0.0016] },
  },
  {
    id: 'webcam',
    parent: 'lid',
    geometry: {
      type: 'cylinder',
      height: 0.0006,
      topRadius: 0.0014,
      bottomRadius: 0.0014,
      segments: 16,
    },
    material: 'deck',
    transform: { position: [0, LID_L / 2 - 0.003, LID_FACE + 0.0012], rotation: [90, 0, 0] },
    minLod: 2,
  },
  {
    id: 'lidMark',
    parent: 'lid',
    geometry: { type: 'ring', innerRadius: 0.011, outerRadius: 0.016, segments: 32 },
    material: 'accent',
    transform: { position: [0, 0.02, -LID_FACE - 0.0006], rotation: [0, 180, 0] },
    minLod: 1,
  },
];

const LIGHTS = ['keyGlow', 'frontBar', 'rearGlow', 'lidMark'] as const;

function lightChannels(id: (typeof LIGHTS)[number]): ModelSpecChannel[] {
  return [
    look(`${id}Tint`, [id, 'colour'], ['power', { true: '#FF2E63' }]),
    look(`${id}Lit`, [id, 'emissive'], ['screenOn', { true: 0.9, false: 0 }]),
    look(`${id}Off`, [id, 'emissive'], ['power', { false: 0 }], 450),
  ];
}

const CHANNELS: ModelSpecChannel[] = [
  {
    id: 'lidFold',
    target: 'hinge',
    property: 'rotate',
    axis: 'x',
    source: 'fold',
    map: { type: 'linear', in: [0, 1], out: [CLOSE_DEG, 0], clamp: true },
    motion: { type: 'pose', easeMs: 700 },
    reduced: 'hold',
  },
  look('screenTint', ['screenGlow', 'colour'], ['screenOn', { true: '#22304F' }]),
  look('screenLit', ['screenGlow', 'emissive'], ['screenOn', { true: 0.9, false: 0 }]),
  look('screenOff', ['screenGlow', 'emissive'], ['power', { false: 0 }], 450),
  look('spillOn', ['screenLight', 'emissive'], ['screenOn', { true: 0.6, false: 0 }]),
  ...emitterChannels('screenLight'),
  look('heatShow', ['heat', 'opacity'], ['thermal', { heating: 0.45, idle: 0, cooling: 0 }], 600),
  ...LIGHTS.flatMap(lightChannels),
];

export const ROG_SCAR_18_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.computer.asus-rog-strix-g834jy',
  version: '1.0.0',
  title: 'ROG Strix SCAR 18 (2023)',
  category: 'computer',
  family: 'computer',
  footprint: { width: WIDTH, depth: DEPTH, height: 0.27 },
  framing: {
    tile: { ...HOUSE, padding: 0.06 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.1, focus: 'screenGlow' },
  },
  shots: [
    {
      id: 'screen',
      when: { anyOf: [{ allOf: [{ signal: 'screenOn', op: 'eq', value: true }] }] },
      focus: 'screenGlow',
      zoom: 1.2,
      yaw: 20,
      pitch: 14,
      easeMs: 900,
      loopS: 3,
      symmetry: 360,
      stillAt: 1.5,
    },
  ],
  meta: {
    names: {
      display: 'ROG Strix SCAR 18',
      synonyms: ['gaming laptop', 'laptop', 'notebook', 'scar 18', 'g834jy'],
    },
    sizeClass: 'medium',
    variants: ['off-black'],
  },
  materials: {
    body: { finish: 'graphite', roughness: 0.38, pattern: 'brushed' },
    deck: { finish: 'satin-black' },
    panel: { finish: 'satin-black', roughness: 0.08, clearcoat: 1 },
    accent: { color: '#2A2D33', roughness: 0.4, opacity: 0.9 },
  },
  ...finishSet({ 'off-black': {} }, 'off-black'),
  parts: [...BASE, ...VENTS, ...LID],
  anchors: [
    {
      kind: 'screen',
      id: 'display',
      parent: 'lid',
      position: [0, SCREEN_Y - LID_L / 2, LID_FACE + 0.002],
      width: SCREEN_W,
      height: SCREEN_H,
    },
    {
      kind: 'emitter',
      id: 'screenLight',
      parent: 'lid',
      position: [0, 0, LID_FACE + 0.02],
      color: '#C9D6F2',
      intensity: 0.4,
      radius: 0.3,
      cone: 120,
    },
    {
      kind: 'effect',
      id: 'heat',
      parent: 'rearBlock',
      position: [0, 0, -0.03],
      effect: 'airflow',
      size: 0.12,
    },
    { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, 0.3, -0.12] },
    { kind: 'hit', id: 'body', position: [0, 0.135, -0.02], size: [WIDTH, 0.27, DEPTH] },
  ],
  channels: CHANNELS,
  states: {
    off: { power: false, screenOn: false },
    closed: { power: false, screenOn: false, fold: 0 },
    sleep: { power: true, online: true, screenOn: false, fold: 0 },
    on: { power: true, online: true, screenOn: true, fold: 1, thermal: 'idle' },
    gaming: { power: true, online: true, screenOn: true, fold: 1, thermal: 'heating' },
    charging: { power: true, online: true, screenOn: true, fold: 1, charging: true },
    offline: { online: false },
  },
};
