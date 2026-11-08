import type { ModelSpec, ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
import { consoleChannels, look, mirrored } from './channels';

const HOUSE = { yaw: 40, pitch: 16, fov: 28, padding: 0.08, focus: 'cageRingLeft' } as const;
const HUB_Y = 0.5;
const HUB_Z = -0.8;
const STROKE_S = 2.5;
const SEAT_TRAVEL = 0.7;
const HANDLE_TRAVEL = 0.75;
const STRAP_BASE = 0.075;
const STRAP_STRETCH = 1 + HANDLE_TRAVEL / STRAP_BASE;
const FLY_RPS = 4;
const BLUR_FROM_RPS = 2;
const BLUR_FULL_RPS = 3.5;

function sweep(
  id: string,
  target: string,
  property: 'translate' | 'scale',
  [low, high]: readonly [number, number],
): ModelSpecChannel {
  return {
    id,
    target,
    property,
    axis: 'z',
    source: 'phase',
    map: { type: 'enum', table: { rowing: 1 } },
    motion: { type: 'oscillate', limits: [low, high], speed: (2 * (high - low)) / STROKE_S },
    reduced: 'hold',
  };
}

const LEGS = [-1, 1].map((end): ModelSpecPart => ({
  id: end < 0 ? 'legFront' : 'legRear',
  geometry: {
    type: 'roundedBox',
    width: 0.56,
    height: 0.04,
    depth: 0.1,
    radius: 0.018,
    segments: 4,
  },
  material: 'frame',
  transform: { position: [0, 0.02, end < 0 ? -0.95 : 0.98] },
  contact: true,
}));

const POSTS = [-0.86, 0.93].map((z, index): ModelSpecPart => ({
  id: index === 0 ? 'postFront' : 'postRear',
  geometry: {
    type: 'roundedBox',
    width: 0.08,
    height: 0.23,
    depth: 0.1,
    radius: 0.025,
    segments: 4,
  },
  material: 'frame',
  transform: { position: [0, 0.155, z] },
}));

const RINGS = mirrored((side, name): ModelSpecPart => ({
  id: `cageRing${name}`,
  geometry: { type: 'torus', radius: 0.225, tube: 0.012, segments: 32 },
  material: 'trim',
  transform: { position: [0.07 * side, HUB_Y, HUB_Z], rotation: [0, 90, 0] },
}));

const PLATES = mirrored((side, name): ModelSpecPart[] => [
  {
    id: `footPlate${name}`,
    geometry: {
      type: 'roundedBox',
      width: 0.11,
      height: 0.014,
      depth: 0.26,
      radius: 0.006,
      segments: 3,
    },
    material: 'trim',
    transform: { position: [0.14 * side, 0.4, -0.42], rotation: [40, 0, 0] },
  },
  {
    id: `footPost${name}`,
    geometry: {
      type: 'cylinder',
      height: 0.1,
      topRadius: 0.02,
      bottomRadius: 0.02,
      bevel: 0.005,
      segments: 16,
    },
    material: 'frame',
    transform: { position: [0.14 * side, 0.34, -0.5] },
    minLod: 1,
  },
]).flat();

export const ROWER_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.rower',
  version: '1.0.0',
  title: 'Rowing machine',
  category: 'fitness',
  family: 'generic',
  footprint: { width: 0.56, depth: 2.07, height: 1 },
  framing: {
    tile: { ...HOUSE, padding: 0.06 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.1 },
  },
  shots: [
    {
      id: 'row',
      when: { anyOf: [{ allOf: [{ signal: 'phase', op: 'eq', value: 'rowing' }] }] },
      focus: 'carriage',
      zoom: 1,
      yaw: 70,
      pitch: 12,
      easeMs: 900,
      loopS: 5,
      symmetry: 360,
      stillAt: 1.25,
    },
  ],
  meta: {
    names: {
      display: 'Rowing machine',
      synonyms: ['rower', 'indoor rower', 'row machine', 'ergometer'],
    },
    sizeClass: 'large',
    variants: ['graphite', 'white'],
  },
  materials: {
    frame: { finish: 'graphite' },
    trim: { finish: 'brushed-aluminium' },
    pad: { finish: 'rubber' },
  },
  finishes: {
    graphite: {},
    white: { frame: { finish: 'matte-white' }, trim: { finish: 'graphite' } },
  },
  defaultFinish: 'graphite',
  parts: [
    ...LEGS,
    ...POSTS,
    {
      id: 'rail',
      geometry: {
        type: 'roundedBox',
        width: 0.065,
        height: 0.07,
        depth: 1.95,
        radius: 0.025,
        segments: 4,
      },
      material: 'trim',
      transform: { position: [0, 0.3, 0] },
    },
    ...RINGS,
    {
      id: 'flyHub',
      geometry: { type: 'sphere', radius: 0.03, segments: 24 },
      material: 'trim',
      transform: { position: [0, HUB_Y, HUB_Z] },
    },
    {
      id: 'flyWheel',
      parent: 'flyHub',
      geometry: {
        type: 'cylinder',
        height: 0.07,
        topRadius: 0.19,
        bottomRadius: 0.19,
        bevel: 0.012,
        segments: 48,
      },
      material: 'frame',
      transform: { rotation: [0, 0, 90] },
    },
    {
      id: 'flyBlur',
      parent: 'flyHub',
      geometry: {
        type: 'cylinder',
        height: 0.072,
        topRadius: 0.188,
        bottomRadius: 0.188,
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
        width: 0.076,
        height: 0.07,
        depth: 0.03,
        radius: 0.01,
        segments: 3,
      },
      material: 'trim',
      transform: { position: [0, 0.14, 0] },
      minLod: 1,
    },
    {
      id: 'axle',
      parent: 'flyHub',
      geometry: {
        type: 'cylinder',
        height: 0.2,
        topRadius: 0.012,
        bottomRadius: 0.012,
        segments: 24,
      },
      material: 'trim',
      transform: { rotation: [0, 0, 90] },
      minLod: 1,
    },
    {
      id: 'carriage',
      minLod: 1,
      geometry: {
        type: 'roundedBox',
        width: 0.1,
        height: 0.04,
        depth: 0.2,
        radius: 0.015,
        segments: 4,
      },
      material: 'frame',
      transform: { position: [0, 0.355, -0.1] },
    },
    {
      id: 'seat',
      parent: 'carriage',
      geometry: {
        type: 'roundedBox',
        width: 0.3,
        height: 0.055,
        depth: 0.3,
        radius: 0.025,
        segments: 4,
      },
      material: 'pad',
      transform: { position: [0, 0.045, 0] },
    },
    {
      id: 'handle',
      geometry: {
        type: 'cylinder',
        height: 0.42,
        topRadius: 0.014,
        bottomRadius: 0.014,
        bevel: 0.004,
        segments: 24,
      },
      material: 'pad',
      transform: { position: [0, 0.6, -0.5], rotation: [0, 0, 90] },
    },
    {
      id: 'strap',
      geometry: {
        type: 'roundedBox',
        width: 0.03,
        height: 0.004,
        depth: STRAP_BASE,
        radius: 0.0015,
        segments: 3,
      },
      material: 'frame',
      transform: { position: [0, 0.6, -0.5375] },
      minLod: 1,
    },
    ...PLATES,
    {
      id: 'footBeam',
      geometry: {
        type: 'roundedBox',
        width: 0.36,
        height: 0.04,
        depth: 0.06,
        radius: 0.015,
        segments: 3,
      },
      material: 'frame',
      transform: { position: [0, 0.3, -0.5] },
      minLod: 1,
    },
    {
      id: 'arm',
      geometry: {
        type: 'roundedBox',
        width: 0.04,
        height: 0.24,
        depth: 0.04,
        radius: 0.015,
        segments: 3,
      },
      material: 'frame',
      transform: { position: [0, 0.82, -0.84] },
    },
    {
      id: 'console',
      geometry: {
        type: 'roundedBox',
        width: 0.2,
        height: 0.12,
        depth: 0.05,
        radius: 0.022,
        segments: 4,
      },
      material: 'frame',
      transform: { position: [0, 0.94, -0.84] },
    },
    {
      id: 'screen',
      parent: 'console',
      geometry: { type: 'roundedPlane', width: 0.15, height: 0.08, radius: 0.01, segments: 4 },
      material: 'frame',
      transform: { position: [0, 0, 0.0256] },
    },
  ],
  anchors: [
    {
      kind: 'screen',
      id: 'display',
      parent: 'console',
      position: [0, 0, 0.0262],
      width: 0.15,
      height: 0.08,
    },
    { kind: 'mount', id: 'floor', position: [0, 0, 0], mount: 'floor' },
    { kind: 'label', id: 'pin', position: [0, 1.15, -0.84] },
    { kind: 'label', id: 'readout', parent: 'console', position: [0, 0.08, 0.03] },
    { kind: 'hit', id: 'rowerHit', position: [0, 0.45, 0], size: [0.56, 0.9, 2.07] },
  ],
  channels: [
    sweep('seatSlide', 'carriage', 'translate', [0, SEAT_TRAVEL]),
    sweep('handleSlide', 'handle', 'translate', [0, HANDLE_TRAVEL]),
    sweep('strapSlide', 'strap', 'translate', [0, HANDLE_TRAVEL / 2]),
    sweep('strapStretch', 'strap', 'scale', [1, STRAP_STRETCH]),
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
    look('screenReady', ['screen', 'emissive'], ['phase', { rowing: 1.3 }]),
  ],
  states: {
    off: { power: false },
    standby: { power: true, online: true, phase: 'standby', speed: 0 },
    ready: { power: true, online: true, phase: 'ready', speed: 0 },
    easy: { power: true, online: true, phase: 'rowing', speed: 0.5 },
    hard: { power: true, online: true, phase: 'rowing', speed: 1 },
    paused: { power: true, online: true, phase: 'paused', speed: 0 },
    offline: { online: false },
  },
};
