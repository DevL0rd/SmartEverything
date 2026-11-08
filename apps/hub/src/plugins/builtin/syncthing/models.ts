import type {
  ModelMatch,
  ModelSpec,
  ModelSpecChannel,
  ModelSpecGeometry,
  ModelSpecPart,
} from '@smarteverything/domain';

const HOUSE = { yaw: 30, pitch: 32, fov: 28, padding: 0.12, focus: 'shell' } as const;

const BASE_H = 0.014;
const BASE_R = 0.032;
const TOP_H = 0.002;
const DECK = BASE_H + TOP_H;
const SPIN_Y = DECK + 0.002;
const ARROW_R = 0.0165;
const ARROW_W = 0.0055;
const HEAD = 0.0025;
const DOTS = 12;
const DOT_R = 0.0291;
const BLUE = '#4FA3D9';
const WARNING = '#F2A04E';
const POSE = { type: 'pose', easeMs: 300 } as const;

type Path = Extract<ModelSpecGeometry, { type: 'extrude' }>['path'];

const RAD = Math.PI / 180;

function polar(radius: number, degrees: number): { x: number; y: number } {
  return { x: radius * Math.cos(degrees * RAD), y: radius * Math.sin(degrees * RAD) };
}

function arrowPath(from: number, to: number): Path {
  const outer = ARROW_R + ARROW_W / 2;
  const inner = ARROW_R - ARROW_W / 2;
  const steps = 14;
  const sweep = (radius: number, start: number, end: number): Path =>
    Array.from({ length: steps + 1 }, (_, index) => ({
      op: 'line' as const,
      ...polar(radius, start + ((end - start) * index) / steps),
    }));
  const first = polar(outer, from);
  return [
    { op: 'move', ...first },
    ...sweep(outer, from, to),
    { op: 'line', ...polar(outer + HEAD, to) },
    { op: 'line', ...polar(ARROW_R, to + 24) },
    { op: 'line', ...polar(inner - HEAD, to) },
    ...sweep(inner, to, from),
    { op: 'line', ...first },
  ];
}

function arrow(id: string, from: number): ModelSpecPart {
  return {
    id,
    parent: 'spinner',
    geometry: { type: 'extrude', path: arrowPath(from, from + 140), depth: 0.0024, bevel: 0.0006 },
    material: 'accent',
    transform: { rotation: [-90, 0, 0] },
  };
}

function dot(index: number): ModelSpecPart {
  const degrees = (360 / DOTS) * index;
  return {
    id: `dot${String(index + 1)}`,
    geometry: {
      type: 'roundedBox',
      width: 0.0035,
      height: 0.0014,
      depth: 0.0058,
      radius: 0.0007,
      segments: 3,
    },
    material: 'accent',
    transform: {
      position: [DOT_R * Math.sin(degrees * RAD), BASE_H + 0.0004, DOT_R * Math.cos(degrees * RAD)],
      rotation: [0, degrees, 0],
    },
    minLod: 1,
  };
}

const PARTS: readonly ModelSpecPart[] = [
  {
    id: 'shell',
    geometry: {
      type: 'cylinder',
      height: BASE_H,
      topRadius: BASE_R,
      bottomRadius: BASE_R,
      bevel: 0.0025,
      segments: 64,
    },
    material: 'shell',
    transform: { position: [0, BASE_H / 2, 0] },
    contact: true,
  },
  {
    id: 'deck',
    geometry: {
      type: 'cylinder',
      height: TOP_H,
      topRadius: 0.0265,
      bottomRadius: 0.0265,
      bevel: 0.0005,
      segments: 64,
    },
    material: 'top',
    transform: { position: [0, BASE_H + TOP_H / 2 - 0.0002, 0] },
  },
  {
    id: 'spinner',
    geometry: {
      type: 'cylinder',
      height: 0.003,
      topRadius: 0.0055,
      bottomRadius: 0.0055,
      bevel: 0.0008,
      segments: 32,
    },
    material: 'shell',
    transform: { position: [0, SPIN_Y, 0] },
  },
  arrow('arrowA', 20),
  arrow('arrowB', 200),
  ...Array.from({ length: DOTS }, (_, index) => dot(index)),
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

function dotChannel(index: number): ModelSpecChannel {
  const at = (index + 0.5) / DOTS;
  return {
    id: `dotLit${String(index + 1)}`,
    target: `dot${String(index + 1)}`,
    property: 'emissive',
    source: 'progress',
    map: { type: 'linear', in: [at - 0.001, at], out: [0.05, 1.3], clamp: true },
    motion: POSE,
    reduced: 'hold',
  };
}

const ARROW_STATES = { syncing: 1.1, idle: 0.3, paused: 0.08 } as const;

const CHANNELS: readonly ModelSpecChannel[] = [
  {
    id: 'ringTurn',
    target: 'spinner',
    property: 'rotate',
    axis: 'y',
    source: 'mode',
    map: { type: 'enum', table: { syncing: 0.25 } },
    motion: { type: 'spin' },
    reduced: 'hold',
  },
  ...['arrowA', 'arrowB'].flatMap((target) => [
    pose(`${target}Glow`, [target, 'emissive', 'mode'], ARROW_STATES),
    pose(`${target}Offline`, [target, 'emissive', 'online'], { false: 0 }),
    pose(`${target}Fault`, [target, 'colour', 'fault'], { true: WARNING }),
  ]),
  pose('ringGlowMode', ['ringGlow', 'emissive', 'mode'], { syncing: 0.8, idle: 0.25, paused: 0 }),
  pose('ringGlowOffline', ['ringGlow', 'emissive', 'online'], { false: 0 }),
  ...Array.from({ length: DOTS }, (_, index) => dotChannel(index)),
];

export const SYNCTHING_SYNC_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.service.sync',
  version: '1.0.0',
  title: 'Syncthing sync ring',
  category: 'service',
  family: 'file_sync',
  footprint: { width: 0.064, depth: 0.064, height: 0.0205 },
  framing: {
    tile: { ...HOUSE, padding: 0.08 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.14 },
  },
  shots: [
    {
      id: 'syncing',
      when: { anyOf: [{ allOf: [{ signal: 'mode', op: 'eq', value: 'syncing' }] }] },
      focus: 'spinner',
      zoom: 1.2,
      yaw: 0,
      pitch: 10,
      easeMs: 700,
      loopS: 4,
      symmetry: 180,
      stillAt: 1,
    },
  ],
  meta: {
    names: {
      display: 'Syncthing',
      synonyms: ['file sync', 'sync', 'folder sync', 'backup sync', 'Syncthing'],
    },
    sizeClass: 'small',
    aliases: ['Syncthing'],
  },
  materials: {
    shell: { finish: 'graphite' },
    top: { finish: 'satin-black' },
    accent: { color: BLUE, roughness: 0.3 },
  },
  finishes: { graphite: {} },
  defaultFinish: 'graphite',
  parts: [...PARTS],
  anchors: [
    {
      kind: 'emitter',
      id: 'ringGlow',
      parent: 'deck',
      position: [0, 0.002, 0],
      color: BLUE,
      intensity: 0.8,
      radius: 0.05,
    },
    { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, 0.0205 + 0.02, 0] },
    { kind: 'hit', id: 'body', position: [0, 0.01, 0], size: [0.064, 0.0205, 0.064] },
  ],
  channels: [...CHANNELS],
  states: {
    off: { online: false },
    idle: { online: true, mode: 'idle', progress: 1 },
    syncing: { online: true, mode: 'syncing', progress: 0.5 },
    paused: { online: true, mode: 'paused', progress: 0.2 },
    fault: { online: true, mode: 'idle', fault: true },
  },
};

export const SYNCTHING_MODELS: readonly ModelSpec[] = [SYNCTHING_SYNC_MODEL];

export const SYNCTHING_MODEL_MATCH: Partial<ModelMatch> = { prefix: ['Syncthing'] };
