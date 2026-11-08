import type {
  ModelMatch,
  ModelSpec,
  ModelSpecChannel,
  ModelSpecGeometry,
  ModelSpecPart,
} from '@smarteverything/domain';

const HOUSE = { yaw: 30, pitch: 14, fov: 28, padding: 0.12, focus: 'rim' } as const;

const BASE_H = 0.008;
const STEM_H = 0.012;
const SHIELD_Y = 0.018;
const RIM_W = 0.052;
const RIM_H = 0.066;
const FACE_W = 0.044;
const FACE_H = 0.056;
const FACE_Y = SHIELD_Y + 0.0045;
const FACE_MID = FACE_Y + FACE_H / 2 + 0.002;
const BAR_H = 0.028;
const BAR_REACH = 0.012;
const GREEN = '#5CB86B';
const WARNING = '#F2A04E';
const POSE = { type: 'pose', easeMs: 300 } as const;

type Path = Extract<ModelSpecGeometry, { type: 'extrude' }>['path'];

function shieldPath(width: number, height: number): Path {
  const half = width / 2;
  const shoulder = height * 0.5;
  return [
    { op: 'move', x: -half, y: height },
    { op: 'line', x: half, y: height },
    { op: 'line', x: half, y: shoulder },
    {
      op: 'cubic',
      c1x: half,
      c1y: shoulder * 0.45,
      c2x: half * 0.5,
      c2y: shoulder * 0.16,
      x: 0,
      y: 0,
    },
    {
      op: 'cubic',
      c1x: -half * 0.5,
      c1y: shoulder * 0.16,
      c2x: -half,
      c2y: shoulder * 0.45,
      x: -half,
      y: shoulder,
    },
    { op: 'line', x: -half, y: height },
  ];
}

const PARTS: readonly ModelSpecPart[] = [
  {
    id: 'base',
    geometry: {
      type: 'cylinder',
      height: BASE_H,
      topRadius: 0.03,
      bottomRadius: 0.03,
      bevel: 0.002,
      segments: 48,
    },
    material: 'trim',
    transform: { position: [0, BASE_H / 2, 0] },
    contact: true,
  },
  {
    id: 'stem',
    geometry: {
      type: 'cylinder',
      height: STEM_H,
      topRadius: 0.0045,
      bottomRadius: 0.0055,
      bevel: 0.001,
      segments: 24,
    },
    material: 'trim',
    transform: { position: [0, BASE_H + STEM_H / 2 - 0.001, 0] },
  },
  {
    id: 'rim',
    geometry: { type: 'extrude', path: shieldPath(RIM_W, RIM_H), depth: 0.008, bevel: 0.0015 },
    material: 'rim',
    transform: { position: [0, SHIELD_Y, 0] },
  },
  {
    id: 'face',
    geometry: { type: 'extrude', path: shieldPath(FACE_W, FACE_H), depth: 0.01, bevel: 0.001 },
    material: 'shell',
    transform: { position: [0, FACE_Y, 0] },
  },
  {
    id: 'scan',
    geometry: {
      type: 'roundedBox',
      width: 0.003,
      height: BAR_H,
      depth: 0.0012,
      radius: 0.0006,
      segments: 3,
    },
    material: 'accent',
    transform: { position: [0, FACE_MID + 0.004, 0.0066] },
  },
  {
    id: 'spark',
    geometry: { type: 'sphere', radius: 0.0025, segments: 16 },
    material: 'accent',
    transform: { position: [0.013, FACE_Y + FACE_H - 0.012, 0.0066] },
    minLod: 1,
  },
  {
    id: 'sparkRing',
    geometry: { type: 'ring', innerRadius: 0.0075, outerRadius: 0.0085, segments: 48 },
    material: 'rim',
    transform: { position: [0, FACE_Y + FACE_H - 0.012, 0.0062] },
    minLod: 2,
  },
];

type Route = readonly [target: string, property: ModelSpecChannel['property'], source: string];

function pose(
  id: string,
  [target, property, source]: Route,
  table: Record<string, number | string>,
): ModelSpecChannel {
  return {
    id,
    target,
    property,
    source,
    map: { type: 'enum', table },
    motion: POSE,
    reduced: 'hold',
  };
}

const CHANNELS: readonly ModelSpecChannel[] = [
  {
    id: 'scanSweep',
    target: 'scan',
    property: 'translate',
    axis: 'x',
    source: 'power',
    map: { type: 'enum', table: { true: 1 } },
    motion: { type: 'oscillate', limits: [-BAR_REACH, BAR_REACH], speed: BAR_REACH },
    reduced: 'hold',
  },
  pose('scanShow', ['scan', 'opacity', 'power'], { true: 1, false: 0 }),
  pose('scanGlow', ['scan', 'emissive', 'power'], { true: 1.1, false: 0 }),
  pose('scanOffline', ['scan', 'emissive', 'online'], { false: 0 }),
  pose('glowPower', ['protectGlow', 'emissive', 'power'], { true: 0.7, false: 0 }),
  pose('glowOffline', ['protectGlow', 'emissive', 'online'], { false: 0 }),
  {
    id: 'sparkBlocked',
    target: 'spark',
    property: 'emissive',
    source: 'level',
    map: { type: 'linear', in: [0, 1], out: [0, 1.6], clamp: true },
    motion: { type: 'pulse', periodS: 0.8, amplitude: 0.6 },
    reduced: 'hold',
  },
  pose('sparkOffline', ['spark', 'emissive', 'online'], { false: 0 }),
  pose('scanFault', ['scan', 'colour', 'fault'], { true: WARNING }),
];

export const ADGUARD_SHIELD_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.service.shield',
  version: '1.0.0',
  title: 'AdGuard Home shield',
  category: 'service',
  family: 'dns_filter',
  footprint: { width: 0.06, depth: 0.06, height: 0.0865 },
  framing: {
    tile: { ...HOUSE, padding: 0.08 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.14 },
  },
  shots: [
    {
      id: 'filtering',
      when: {
        anyOf: [
          {
            allOf: [
              { signal: 'power', op: 'eq', value: true },
              { signal: 'level', op: 'gt', value: 0 },
            ],
          },
        ],
      },
      focus: 'face',
      zoom: 1.2,
      yaw: 12,
      pitch: 8,
      easeMs: 700,
      loopS: 4,
      symmetry: 360,
      stillAt: 2,
    },
  ],
  meta: {
    names: {
      display: 'AdGuard Home',
      synonyms: ['ad blocker', 'dns filter', 'dns shield', 'network ad blocking', 'AdGuard'],
    },
    sizeClass: 'small',
    aliases: ['AdGuard Home'],
  },
  materials: {
    shell: { finish: 'graphite' },
    rim: { finish: 'brushed-aluminium' },
    trim: { finish: 'satin-black' },
    accent: { color: GREEN, roughness: 0.3 },
  },
  finishes: { graphite: {} },
  defaultFinish: 'graphite',
  parts: [...PARTS],
  anchors: [
    {
      kind: 'emitter',
      id: 'protectGlow',
      parent: 'face',
      position: [0, FACE_H / 2, 0.007],
      color: GREEN,
      intensity: 0.7,
      radius: 0.05,
    },
    {
      kind: 'effect',
      id: 'blockSparkle',
      parent: 'face',
      position: [0.013, FACE_H - 0.012, 0.008],
      effect: 'sparkle',
      size: 0.03,
    },
    { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, 0.0865 + 0.02, 0] },
    { kind: 'hit', id: 'body', position: [0, 0.043, 0], size: [0.06, 0.0865, 0.06] },
  ],
  channels: [...CHANNELS],
  states: {
    off: { online: false },
    protected: { online: true, power: true, level: 0 },
    blocking: { online: true, power: true, level: 0.6 },
    paused: { online: true, power: false },
    fault: { online: true, power: true, fault: true },
  },
};

export const ADGUARD_MODELS: readonly ModelSpec[] = [ADGUARD_SHIELD_MODEL];

export const ADGUARD_MODEL_MATCH: Partial<ModelMatch> = { prefix: ['AdGuard Home'] };
