import type { ModelSpec, ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
import { consoleChannels, mirrored, type Point } from './channels';

const HOUSE = { yaw: 30, pitch: 18, fov: 28, padding: 0.08 } as const;
const PIVOT_Y = 0.11;
const PIVOT_Z = 0.74;
const MAX_INCLINE_DEG = 8.5;
const BELT_LENGTH = 1.3;
const BELT_REPEAT = 6;
const TOP_SPEED_MPS = 16 / 3.6;
const BLUR_FROM_KMH = 8;
const BLUR_FULL_KMH = 10;
const CONSOLE_TILT = 30;
const UPRIGHT_TILT = 10;

function beltRepeats(kmh: number): number {
  return (kmh / 3.6) * (BELT_REPEAT / BELT_LENGTH);
}

function local(x: number, y: number, z: number): Point {
  return [x, y - PIVOT_Y, z - PIVOT_Z];
}

const RAILS = mirrored((side, name): ModelSpecPart => ({
  id: `rail${name}`,
  parent: 'rearFrame',
  geometry: {
    type: 'roundedBox',
    width: 0.075,
    height: 0.03,
    depth: 1.36,
    radius: 0.012,
    segments: 4,
  },
  material: 'trim',
  transform: { position: local(0.272 * side, 0.172, 0) },
}));

const UPRIGHTS = mirrored((side, name): ModelSpecPart => ({
  id: `upright${name}`,
  geometry: { type: 'capsule', radius: 0.022, length: 0.74, segments: 24 },
  material: 'frame',
  transform: { position: [0.3 * side, 0.77, -0.66], rotation: [UPRIGHT_TILT, 0, 0] },
}));

const HANDRAILS = mirrored((side, name): ModelSpecPart => ({
  id: `handrail${name}`,
  geometry: {
    type: 'tube',
    points: [
      [0.3 * side, 1.08, -0.6],
      [0.31 * side, 1.0, -0.4],
      [0.32 * side, 0.97, -0.1],
      [0.32 * side, 0.96, 0.12],
    ],
    radius: 0.016,
    segments: 24,
  },
  material: 'trim',
}));

const BUMPERS = mirrored((side, name): ModelSpecPart => ({
  id: `bumper${name}`,
  parent: 'rearFrame',
  geometry: {
    type: 'cylinder',
    height: 0.03,
    topRadius: 0.03,
    bottomRadius: 0.03,
    bevel: 0.006,
    segments: 32,
  },
  material: 'belt',
  transform: { position: local(0.27 * side, 0.015, 0.7) },
  contact: true,
  minLod: 1,
}));

const WHEELS = mirrored((side, name): ModelSpecPart => ({
  id: `wheel${name}`,
  geometry: {
    type: 'cylinder',
    height: 0.025,
    topRadius: 0.03,
    bottomRadius: 0.03,
    bevel: 0.004,
    segments: 32,
  },
  material: 'belt',
  transform: { position: [0.3 * side, 0.03, -0.8], rotation: [0, 0, 90] },
  minLod: 2,
}));

const BUTTONS = [-0.18, -0.12, 0.12, 0.18].map((x, index): ModelSpecPart => ({
  id: `button${String(index + 1)}`,
  parent: 'console',
  geometry: { type: 'cylinder', height: 0.003, topRadius: 0.01, bottomRadius: 0.01, segments: 24 },
  material: 'trim',
  transform: { position: [x, 0.0415, 0.05] },
  minLod: 2,
}));

const CHANNELS: ModelSpecChannel[] = [
  {
    id: 'beltScroll',
    target: 'belt',
    property: 'uvScroll',
    source: 'speed',
    map: { type: 'speed', in: [0, 1], perSecond: [0, (TOP_SPEED_MPS * BELT_REPEAT) / BELT_LENGTH] },
    motion: { type: 'spin' },
    reduced: 'hold',
    blur: { part: 'beltBlur', from: beltRepeats(BLUR_FROM_KMH), to: beltRepeats(BLUR_FULL_KMH) },
  },
  {
    id: 'incline',
    target: 'rearFrame',
    property: 'rotate',
    axis: 'x',
    source: 'incline',
    map: { type: 'linear', in: [0, MAX_INCLINE_DEG], out: [0, MAX_INCLINE_DEG], clamp: true },
    motion: { type: 'pose', easeMs: 900 },
    reduced: 'hold',
  },
  ...consoleChannels('screen'),
];

export const GENERIC_TREADMILL_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.treadmill.generic',
  version: '1.0.0',
  title: 'Treadmill',
  category: 'fitness',
  family: 'treadmill',
  footprint: { width: 0.74, depth: 1.62, height: 1.28 },
  framing: {
    tile: { ...HOUSE, padding: 0.06, focus: 'rearFrame' },
    card: { ...HOUSE, focus: 'rearFrame' },
    hero: { ...HOUSE, padding: 0.1, focus: 'console' },
  },
  shots: [
    {
      id: 'belt',
      when: {
        anyOf: [
          {
            allOf: [
              { signal: 'phase', op: 'eq', value: 'running' },
              { signal: 'speed', op: 'gt', value: 0 },
            ],
          },
        ],
      },
      focus: 'belt',
      zoom: 1,
      yaw: 22,
      pitch: 14,
      easeMs: 1000,
      loopS: 1,
      symmetry: 360,
      stillAt: 0.5,
    },
  ],
  meta: {
    names: {
      display: 'Treadmill',
      synonyms: ['running machine', 'jogging machine', 'incline treadmill'],
    },
    sizeClass: 'large',
    variants: ['graphite', 'white'],
  },
  materials: {
    frame: { finish: 'graphite' },
    belt: { finish: 'rubber', pattern: 'grille' },
    trim: { finish: 'brushed-aluminium' },
  },
  finishes: {
    graphite: {},
    white: { frame: { finish: 'matte-white' }, trim: { finish: 'graphite' } },
  },
  defaultFinish: 'graphite',
  parts: [
    {
      id: 'rearFrame',
      geometry: {
        type: 'roundedBox',
        width: 0.66,
        height: 0.12,
        depth: 0.07,
        radius: 0.025,
        segments: 4,
      },
      material: 'frame',
      transform: { position: [0, PIVOT_Y, PIVOT_Z] },
      contact: true,
    },
    {
      id: 'deck',
      parent: 'rearFrame',
      geometry: {
        type: 'roundedBox',
        width: 0.62,
        height: 0.09,
        depth: 1.46,
        radius: 0.03,
        segments: 4,
      },
      material: 'frame',
      transform: { position: local(0, 0.115, 0) },
    },
    {
      id: 'belt',
      parent: 'rearFrame',
      geometry: {
        type: 'roundedPlane',
        width: 0.47,
        height: BELT_LENGTH,
        radius: 0.012,
        segments: 4,
      },
      material: 'belt',
      transform: { position: local(0, 0.1612, 0), rotation: [-90, 0, 0] },
    },
    {
      id: 'beltBlur',
      parent: 'rearFrame',
      geometry: {
        type: 'roundedPlane',
        width: 0.47,
        height: BELT_LENGTH,
        radius: 0.012,
        segments: 4,
      },
      material: 'frame',
      transform: { position: local(0, 0.1618, 0), rotation: [-90, 0, 0] },
    },
    ...RAILS,
    ...BUMPERS,
    {
      id: 'hood',
      geometry: {
        type: 'roundedBox',
        width: 0.74,
        height: 0.4,
        depth: 0.4,
        radius: 0.07,
        segments: 5,
      },
      material: 'frame',
      transform: { position: [0, 0.21, -0.6] },
      contact: true,
    },
    {
      id: 'hoodBand',
      parent: 'hood',
      geometry: {
        type: 'roundedBox',
        width: 0.7,
        height: 0.02,
        depth: 0.404,
        radius: 0.008,
        segments: 3,
      },
      material: 'trim',
      transform: { position: [0, 0.06, 0] },
      minLod: 1,
    },
    ...UPRIGHTS,
    {
      id: 'console',
      geometry: {
        type: 'roundedBox',
        width: 0.5,
        height: 0.08,
        depth: 0.2,
        radius: 0.035,
        segments: 5,
      },
      material: 'frame',
      transform: { position: [0, 1.18, -0.58], rotation: [CONSOLE_TILT, 0, 0] },
    },
    {
      id: 'screen',
      parent: 'console',
      geometry: { type: 'roundedPlane', width: 0.24, height: 0.09, radius: 0.01, segments: 4 },
      material: 'frame',
      transform: { position: [0, 0.0412, -0.02], rotation: [-90, 0, 0] },
    },
    ...BUTTONS,
    ...HANDRAILS,
    ...WHEELS,
  ],
  anchors: [
    {
      kind: 'screen',
      id: 'display',
      parent: 'console',
      position: [0, 0.0415, -0.02],
      rotation: [-90, 0, 0],
      width: 0.24,
      height: 0.09,
    },
    { kind: 'mount', id: 'floor', position: [0, 0, 0], mount: 'floor' },
    { kind: 'label', id: 'pin', position: [0, 1.4, -0.58] },
    { kind: 'label', id: 'readout', parent: 'console', position: [0, 0.08, 0.02] },
    { kind: 'hit', id: 'deckHit', position: [0, 0.4, 0], size: [0.74, 0.8, 1.62] },
  ],
  channels: CHANNELS,
  states: {
    off: { power: false },
    standby: { power: true, online: true, phase: 'standby', speed: 0, incline: 0 },
    walking: { power: true, online: true, phase: 'running', speed: 0.3, incline: 0 },
    inclineWalk: { power: true, online: true, phase: 'running', speed: 0.35, incline: 5 },
    steepWalk: {
      power: true,
      online: true,
      phase: 'running',
      speed: 0.3,
      incline: MAX_INCLINE_DEG,
    },
    running: { power: true, online: true, phase: 'running', speed: 0.7, incline: 1 },
    paused: { power: true, online: true, phase: 'paused', speed: 0, incline: 0 },
    offline: { online: false },
  },
};
