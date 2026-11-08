import { emitterChannels, type ModelSpec } from '@smarteverything/domain';

const HOUSE = { yaw: 30, pitch: 18, fov: 28, padding: 0.08 } as const;

const PIVOT_Y = 0.1;
const PIVOT_Z = 0.786;
const MAX_INCLINE_DEG = 11.31;
const BELT_LENGTH = 1.28;
const BELT_REPEAT = 6;
const TOP_SPEED_MPS = 15 / 3.6;
const HINGE_Y = 0.252;
const HINGE_Z = -0.716;
const FOLD_DEG = 80;
const BLUR_FROM_KMH = 8;
const BLUR_FULL_KMH = 10;
const RUNNING = { power: true, online: true, phase: 'running' } as const;

function beltRepeats(kmh: number): number {
  return (kmh / 3.6) * (BELT_REPEAT / BELT_LENGTH);
}

type Part = ModelSpec['parts'][number];
type Point = [number, number, number];

function local(x: number, y: number, z: number): Point {
  return [x, y - PIVOT_Y, z - PIVOT_Z];
}

function mast(x: number, y: number, z: number): Point {
  return [x, y - HINGE_Y, z - HINGE_Z];
}

function mirrored(make: (side: number, name: string) => Part): Part[] {
  return [make(-1, 'Left'), make(1, 'Right')];
}

const RAILS = mirrored((side, name) => ({
  id: `rail${name}`,
  parent: 'rearFrame',
  geometry: {
    type: 'roundedBox',
    width: 0.07,
    height: 0.03,
    depth: 1.3,
    radius: 0.01,
    segments: 4,
  },
  material: 'trim',
  transform: { position: local(0.29 * side, 0.185, 0.08) },
}));

const UPRIGHTS = mirrored((side, name) => ({
  id: `upright${name}`,
  parent: 'hinge',
  geometry: { type: 'capsule', radius: 0.022, length: 0.8, segments: 24 },
  material: 'frame',
  transform: { position: mast(0.31 * side, 0.64, -0.66), rotation: [8, 0, 0] },
}));

const ROLLER_CAPS = mirrored((side, name) => ({
  id: `rollerCap${name}`,
  parent: 'rearFrame',
  geometry: {
    type: 'cylinder',
    height: 0.012,
    topRadius: 0.032,
    bottomRadius: 0.032,
    bevel: 0.003,
    segments: 32,
  },
  material: 'trim',
  transform: { position: [0.336 * side, 0, 0], rotation: [0, 0, 90] },
  minLod: 1,
}));

const WHEELS = mirrored((side, name) => ({
  id: `wheel${name}`,
  parent: 'rearFrame',
  geometry: {
    type: 'cylinder',
    height: 0.024,
    topRadius: 0.03,
    bottomRadius: 0.03,
    bevel: 0.004,
    segments: 32,
  },
  material: 'frame',
  transform: { position: local(0.33 * side, 0.035, -0.8), rotation: [0, 0, 90] },
  minLod: 2,
}));

const BUTTONS = [-0.23, -0.17, 0.17, 0.23].map((x, index): Part => ({
  id: `button${String(index + 1)}`,
  parent: 'console',
  geometry: {
    type: 'cylinder',
    height: 0.003,
    topRadius: 0.009,
    bottomRadius: 0.009,
    segments: 24,
  },
  material: 'trim',
  transform: { position: [x, 0.0355, 0.02] },
  minLod: 2,
}));

export const KINGSMITH_G15_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.treadmill.kingsmith-g15',
  version: '1.0.0',
  title: 'Kingsmith G15 treadmill',
  category: 'fitness',
  family: 'treadmill',
  footprint: { width: 0.7, depth: 1.632, height: 1.1 },
  framing: {
    tile: { ...HOUSE, padding: 0.06 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.1, focus: 'hinge' },
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
      display: 'Kingsmith G15 treadmill',
      synonyms: ['treadmill', 'running machine', 'incline treadmill'],
    },
    sizeClass: 'large',
    aliases: ['kingsmith.treadmill.ksg15'],
  },
  params: { folded: { min: 0, max: 1, default: 0, unit: 'ratio' } },
  materials: {
    frame: { finish: 'graphite' },
    belt: { finish: 'rubber', pattern: 'grille' },
    trim: { finish: 'brushed-aluminium' },
  },
  parts: [
    {
      id: 'rearFrame',
      geometry: {
        type: 'roundedBox',
        width: 0.66,
        height: 0.14,
        depth: 0.06,
        radius: 0.02,
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
        width: 0.66,
        height: 0.1,
        depth: 1.5,
        radius: 0.025,
        segments: 4,
      },
      material: 'frame',
      transform: { position: local(0, 0.12, 0) },
      contact: true,
    },
    {
      id: 'belt',
      parent: 'rearFrame',
      geometry: {
        type: 'roundedPlane',
        width: 0.5,
        height: BELT_LENGTH,
        radius: 0.012,
        segments: 4,
      },
      material: 'belt',
      transform: { position: local(0, 0.1712, 0.08), rotation: [-90, 0, 0] },
    },
    {
      id: 'beltBlur',
      parent: 'rearFrame',
      geometry: {
        type: 'roundedPlane',
        width: 0.5,
        height: BELT_LENGTH,
        radius: 0.012,
        segments: 4,
      },
      material: 'frame',
      transform: { position: local(0, 0.1718, 0.08), rotation: [-90, 0, 0] },
    },
    ...RAILS,
    {
      id: 'hood',
      parent: 'rearFrame',
      geometry: {
        type: 'roundedBox',
        width: 0.7,
        height: 0.15,
        depth: 0.28,
        radius: 0.05,
        segments: 5,
      },
      material: 'frame',
      transform: { position: local(0, 0.165, -0.7) },
    },
    {
      id: 'hinge',
      parent: 'rearFrame',
      geometry: {
        type: 'roundedBox',
        width: 0.64,
        height: 0.024,
        depth: 0.03,
        radius: 0.01,
        segments: 3,
      },
      material: 'trim',
      transform: {
        position: local(0, HINGE_Y, HINGE_Z),
        rotation: [{ param: 'folded', scale: FOLD_DEG }, 0, 0],
      },
    },
    ...UPRIGHTS,
    {
      id: 'console',
      parent: 'hinge',
      geometry: {
        type: 'roundedBox',
        width: 0.62,
        height: 0.07,
        depth: 0.17,
        radius: 0.03,
        segments: 5,
      },
      material: 'frame',
      transform: { position: mast(0, 1.05, -0.6), rotation: [28, 0, 0] },
    },
    {
      id: 'screen',
      parent: 'console',
      geometry: { type: 'roundedPlane', width: 0.2, height: 0.07, radius: 0.008, segments: 4 },
      material: 'frame',
      transform: { position: [0, 0.0356, 0.01], rotation: [-90, 0, 0] },
    },
    ...BUTTONS,
    {
      id: 'handlebar',
      parent: 'hinge',
      geometry: {
        type: 'tube',
        points: [
          mast(-0.31, 1.03, -0.62),
          mast(-0.29, 1.0, -0.48),
          mast(0.29, 1.0, -0.48),
          mast(0.31, 1.03, -0.62),
        ],
        radius: 0.014,
        segments: 32,
      },
      material: 'trim',
    },
    ...ROLLER_CAPS,
    ...WHEELS,
    {
      id: 'lift',
      geometry: {
        type: 'roundedBox',
        width: 0.36,
        height: 0.08,
        depth: 0.06,
        radius: 0.01,
        segments: 3,
      },
      material: 'frame',
      transform: { position: [0, 0.04, -0.7] },
      minLod: 1,
    },
  ],
  anchors: [
    {
      kind: 'screen',
      id: 'display',
      parent: 'console',
      position: [0, 0.036, 0.01],
      rotation: [-90, 0, 0],
      width: 0.2,
      height: 0.07,
    },
    { kind: 'mount', id: 'floor', position: [0, 0, 0], mount: 'floor' },
    { kind: 'label', id: 'pin', position: [0, 1.2, -0.6] },
    { kind: 'label', id: 'readout', parent: 'console', position: [0, 0.07, 0.02] },
    { kind: 'hit', id: 'deckHit', position: [0, 0.12, 0], size: [0.7, 0.24, 1.632] },
  ],
  channels: [
    {
      id: 'beltScroll',
      target: 'belt',
      property: 'uvScroll',
      source: 'speed',
      map: {
        type: 'speed',
        in: [0, 1],
        perSecond: [0, (TOP_SPEED_MPS * BELT_REPEAT) / BELT_LENGTH],
      },
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
    {
      id: 'liftStretch',
      target: 'lift',
      property: 'scale',
      axis: 'y',
      source: 'incline',
      map: { type: 'linear', in: [0, MAX_INCLINE_DEG], out: [1, 4.64], clamp: true },
      motion: { type: 'pose', easeMs: 900 },
      reduced: 'hold',
    },
    {
      id: 'liftRise',
      target: 'lift',
      property: 'translate',
      axis: 'y',
      source: 'incline',
      map: { type: 'linear', in: [0, MAX_INCLINE_DEG], out: [0, 0.1456], clamp: true },
      motion: { type: 'pose', easeMs: 900 },
      reduced: 'hold',
    },
    {
      id: 'screenTint',
      target: 'screen',
      property: 'colour',
      source: 'power',
      map: { type: 'enum', table: { true: '#5ED3CF' } },
      motion: { type: 'pose', easeMs: 300 },
      reduced: 'hold',
    },
    {
      id: 'screenOn',
      target: 'screen',
      property: 'emissive',
      source: 'power',
      map: { type: 'enum', table: { true: 1.1, false: 0 } },
      motion: { type: 'pose', easeMs: 300 },
      reduced: 'hold',
    },
    {
      id: 'screenStandby',
      target: 'screen',
      property: 'emissive',
      source: 'phase',
      map: { type: 'enum', table: { standby: 0.35 } },
      motion: { type: 'pose', easeMs: 450 },
      reduced: 'hold',
    },
    {
      id: 'screenFault',
      target: 'screen',
      property: 'colour',
      source: 'fault',
      map: { type: 'enum', table: { true: '#F2B45E' } },
      motion: { type: 'pose', easeMs: 250 },
      reduced: 'hold',
    },
    ...emitterChannels('screen'),
  ],
  states: {
    off: { power: false },
    standby: { power: true, online: true, phase: 'standby', speed: 0, incline: 0 },
    walking: { ...RUNNING, speed: 0.267, incline: 0 },
    inclineWalk: { ...RUNNING, speed: 0.333, incline: 6.84 },
    steepWalk: { ...RUNNING, speed: 0.3, incline: MAX_INCLINE_DEG },
    running: { ...RUNNING, speed: 0.8, incline: 1.15 },
    paused: { power: true, online: true, phase: 'paused', speed: 0, incline: 0 },
    offline: { online: false },
  },
};
