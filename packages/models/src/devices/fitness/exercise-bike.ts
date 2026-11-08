import type { ModelSpec, ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
import { consoleChannels, mirrored } from './channels';

const HOUSE = { yaw: 62, pitch: 14, fov: 28, padding: 0.08, focus: 'crankHub' } as const;
const FLY_Y = 0.27;
const FLY_Z = -0.462;
const CRANK_Y = 0.3;
const CRANK_Z = 0.02;
const CRANK_RPS = 1.5;
const FLY_RPS = 4;
const BLUR_FROM_RPS = 2;
const BLUR_FULL_RPS = 3;

function capsuleBetween(
  id: string,
  [from, to]: readonly [readonly [number, number], readonly [number, number]],
  [radius, material]: readonly [number, string],
): ModelSpecPart {
  const dy = to[0] - from[0];
  const dz = to[1] - from[1];
  const span = Math.hypot(dy, dz);
  return {
    id,
    geometry: { type: 'capsule', radius, length: span - 2 * radius, segments: 24 },
    material,
    transform: {
      position: [0, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2],
      rotation: [(Math.atan2(dz, dy) * 180) / Math.PI, 0, 0],
    },
  };
}

const CRANK_SIDES = mirrored((side, name): ModelSpecPart[] => [
  {
    id: `crankArm${name}`,
    parent: 'crankHub',
    geometry: { type: 'capsule', radius: 0.013, length: 0.144, segments: 24 },
    material: 'trim',
    transform: {
      position: [0.1 * side, side * 0.085, 0],
    },
  },
  {
    id: `pedal${name}`,
    parent: 'crankHub',
    geometry: {
      type: 'roundedBox',
      width: 0.09,
      height: 0.02,
      depth: 0.1,
      radius: 0.008,
      segments: 3,
    },
    material: 'seat',
    transform: { position: [0.14 * side, side * 0.17, 0] },
  },
]).flat();

const FEET = [-1, 1].map((end): ModelSpecPart => ({
  id: end < 0 ? 'footFront' : 'footRear',
  geometry: {
    type: 'roundedBox',
    width: 0.56,
    height: 0.04,
    depth: 0.07,
    radius: 0.016,
    segments: 4,
  },
  material: 'frame',
  transform: { position: [0, 0.02, 0.42 * end] },
  contact: true,
}));

const CHANNELS: ModelSpecChannel[] = [
  {
    id: 'crankSpin',
    target: 'crankHub',
    property: 'rotate',
    axis: 'x',
    source: 'speed',
    map: { type: 'speed', in: [0, 1], perSecond: [0, CRANK_RPS] },
    motion: { type: 'spin' },
    reduced: 'hold',
  },
  {
    id: 'flySpin',
    target: 'flyHub',
    property: 'rotate',
    axis: 'x',
    source: 'speed',
    map: { type: 'speed', in: [0, 1], perSecond: [0, FLY_RPS] },
    motion: { type: 'spin' },
    reduced: 'hold',
    blur: { part: 'flyBlur', from: BLUR_FROM_RPS, to: BLUR_FULL_RPS },
  },
  ...consoleChannels('screen'),
];

export const EXERCISE_BIKE_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.bike.exercise',
  version: '1.0.0',
  title: 'Exercise bike',
  category: 'fitness',
  family: 'generic',
  footprint: { width: 0.58, depth: 1.05, height: 1.02 },
  framing: {
    tile: { ...HOUSE, padding: 0.06 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.1 },
  },
  shots: [
    {
      id: 'ride',
      when: { anyOf: [{ allOf: [{ signal: 'speed', op: 'gt', value: 0 }] }] },
      focus: 'crankHub',
      zoom: 1,
      yaw: 50,
      pitch: 12,
      easeMs: 900,
      loopS: 2,
      symmetry: 360,
      stillAt: 0.5,
    },
  ],
  meta: {
    names: {
      display: 'Exercise bike',
      synonyms: ['spin bike', 'stationary bike', 'indoor cycle', 'cycling trainer'],
    },
    sizeClass: 'medium',
    variants: ['graphite', 'white'],
  },
  materials: {
    frame: { finish: 'graphite' },
    trim: { finish: 'brushed-aluminium' },
    seat: { finish: 'rubber' },
  },
  finishes: {
    graphite: {},
    white: { frame: { finish: 'matte-white' }, trim: { finish: 'graphite' } },
  },
  defaultFinish: 'graphite',
  parts: [
    {
      id: 'base',
      minLod: 1,
      geometry: {
        type: 'roundedBox',
        width: 0.06,
        height: 0.05,
        depth: 0.95,
        radius: 0.02,
        segments: 4,
      },
      material: 'frame',
      transform: { position: [0, 0.045, 0] },
    },
    ...FEET,
    capsuleBetween(
      'mast',
      [
        [0.1, -0.28],
        [0.88, -0.4],
      ],
      [0.03, 'frame'],
    ),
    capsuleBetween(
      'spine',
      [
        [0.08, -0.26],
        [0.3, 0.02],
      ],
      [0.028, 'frame'],
    ),
    capsuleBetween(
      'seatTube',
      [
        [0.3, 0.02],
        [0.96, 0.26],
      ],
      [0.028, 'frame'],
    ),
    {
      ...capsuleBetween(
        'rearLeg',
        [
          [0.07, 0.38],
          [0.33, 0.04],
        ],
        [0.024, 'frame'],
      ),
      minLod: 1,
    },
    {
      id: 'flyHub',
      geometry: { type: 'sphere', radius: 0.03, segments: 24 },
      material: 'trim',
      transform: { position: [0, FLY_Y, FLY_Z] },
    },
    {
      id: 'flyWheel',
      parent: 'flyHub',
      geometry: {
        type: 'cylinder',
        height: 0.05,
        topRadius: 0.13,
        bottomRadius: 0.13,
        bevel: 0.01,
        segments: 64,
      },
      material: 'frame',
      transform: { rotation: [0, 0, 90] },
    },
    {
      id: 'flyBlur',
      parent: 'flyHub',
      geometry: {
        type: 'cylinder',
        height: 0.052,
        topRadius: 0.128,
        bottomRadius: 0.128,
        segments: 64,
      },
      material: 'trim',
      transform: { rotation: [0, 0, 90] },
    },
    {
      id: 'flyMark',
      parent: 'flyHub',
      geometry: {
        type: 'roundedBox',
        width: 0.056,
        height: 0.05,
        depth: 0.026,
        radius: 0.008,
        segments: 3,
      },
      material: 'trim',
      transform: { position: [0, 0.095, 0] },
      minLod: 1,
    },
    {
      id: 'crankHub',
      geometry: { type: 'sphere', radius: 0.032, segments: 24 },
      material: 'trim',
      transform: { position: [0, CRANK_Y, CRANK_Z] },
    },
    {
      id: 'axle',
      parent: 'crankHub',
      geometry: {
        type: 'cylinder',
        height: 0.22,
        topRadius: 0.014,
        bottomRadius: 0.014,
        segments: 24,
      },
      material: 'trim',
      transform: { rotation: [0, 0, 90] },
      minLod: 1,
    },
    ...CRANK_SIDES,
    {
      id: 'handlebar',
      geometry: {
        type: 'cylinder',
        height: 0.46,
        topRadius: 0.016,
        bottomRadius: 0.016,
        bevel: 0.005,
        segments: 24,
      },
      material: 'trim',
      transform: { position: [0, 0.915, -0.43], rotation: [0, 0, 90] },
    },
    {
      id: 'console',
      geometry: {
        type: 'roundedBox',
        width: 0.22,
        height: 0.06,
        depth: 0.06,
        radius: 0.022,
        segments: 4,
      },
      material: 'frame',
      transform: { position: [0, 0.97, -0.395], rotation: [20, 0, 0] },
    },
    {
      id: 'screen',
      parent: 'console',
      geometry: { type: 'roundedPlane', width: 0.15, height: 0.04, radius: 0.008, segments: 4 },
      material: 'frame',
      transform: { position: [0, 0.0305, 0.0], rotation: [-90, 0, 0] },
    },
    {
      id: 'saddle',
      geometry: {
        type: 'roundedBox',
        width: 0.2,
        height: 0.055,
        depth: 0.27,
        radius: 0.025,
        segments: 4,
      },
      material: 'seat',
      transform: { position: [0, 0.99, 0.28] },
    },
  ],
  anchors: [
    {
      kind: 'screen',
      id: 'display',
      parent: 'console',
      position: [0, 0.031, 0],
      rotation: [-90, 0, 0],
      width: 0.15,
      height: 0.04,
    },
    { kind: 'mount', id: 'floor', position: [0, 0, 0], mount: 'floor' },
    { kind: 'label', id: 'pin', position: [0, 1.15, -0.4] },
    { kind: 'label', id: 'readout', parent: 'console', position: [0, 0.06, 0.02] },
    { kind: 'hit', id: 'bikeHit', position: [0, 0.5, 0], size: [0.58, 1.02, 1.05] },
  ],
  channels: CHANNELS,
  states: {
    off: { power: false },
    standby: { power: true, online: true, phase: 'standby', speed: 0 },
    easy: { power: true, online: true, phase: 'running', speed: 0.3 },
    steady: { power: true, online: true, phase: 'running', speed: 0.6 },
    sprint: { power: true, online: true, phase: 'running', speed: 1 },
    paused: { power: true, online: true, phase: 'paused', speed: 0 },
    offline: { online: false },
  },
};
