import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { finishSet } from '../../helpers/finishes';
import {
  FLAT,
  PHONE_STATES,
  box,
  face,
  lens,
  phoneShot,
  screenChannels,
  signalChannels,
} from './slab';

const HALF = 0.0728 - 0.0007;
const LENGTH = 0.1584;
const T = 0.0042;
const GAP = 0.0005;
const FOLDED_H = 2 * T + GAP;
const PIVOT_X = -HALF / 2;
const PIVOT_Y = T + GAP / 2;
const TOP = T / 2;
const MAIN_W = HALF - 0.0024;
const MAIN_L = LENGTH - 0.0046;
const UP: [number, number, number] = [-90, 0, 0];
const DOWN: [number, number, number] = [90, 0, 0];

const BODY: readonly ModelSpecPart[] = [
  box('body', [HALF, T, LENGTH, 0.0016], 'back', {
    transform: { position: [0, T / 2, 0] },
    contact: true,
  }),
  box('bodyRail', [HALF + 0.0004, T * 0.55, LENGTH + 0.0004, 0.0011], 'frame', {
    parent: 'body',
  }),
  face('mainRight', [MAIN_W, MAIN_L, 0.0022], 'panel', {
    parent: 'body',
    transform: { position: [0.0004, TOP + 0.0003, 0], rotation: UP },
  }),
  box('spine', [0.0036, FOLDED_H, LENGTH - 0.0006, 0.0017], 'frame', {
    parent: 'body',
    transform: { position: [PIVOT_X - 0.0006, FOLDED_H / 2 - T / 2, 0] },
  }),
  box('island', [0.0158, 0.0016, 0.046, 0.0007], 'back', {
    parent: 'body',
    transform: { position: [HALF / 2 - 0.0125, -TOP - 0.0007, -LENGTH / 2 + 0.03] },
    minLod: 1,
  }),
  lens('lensWide', 'island', [0, -0.0009, -0.014], 'frame'),
  lens('lensUltra', 'island', [0, -0.0009, 0], 'frame'),
  lens('lensZoom', 'island', [0, -0.0009, 0.014], 'frame'),
  {
    id: 'chargeGlow',
    parent: 'body',
    geometry: { type: 'glow', width: HALF * 1.4, height: LENGTH * 1.1, segments: 24 },
    material: 'accent',
    transform: { position: [0, -TOP + 0.0002, 0], rotation: DOWN },
    minLod: 1,
  },
];

const FLAP: readonly ModelSpecPart[] = [
  box('flap', [0.0018, 0.0018, LENGTH - 0.012, 0.0008], 'frame', {
    transform: { position: [PIVOT_X, PIVOT_Y, 0], rotation: [0, 0, -180] },
  }),
  box('leftHalf', [HALF, T, LENGTH, 0.0016], 'back', {
    parent: 'flap',
    transform: { position: [-HALF / 2, -(T / 2 + GAP / 2), 0] },
  }),
  box('leftRail', [HALF + 0.0004, T * 0.55, LENGTH + 0.0004, 0.0011], 'frame', {
    parent: 'leftHalf',
  }),
  face('mainLeft', [MAIN_W, MAIN_L, 0.0022], 'panel', {
    parent: 'leftHalf',
    transform: { position: [-0.0004, TOP + 0.0003, 0], rotation: UP },
  }),
  face('cover', [0.0662, 0.1502, 0.0034], 'panel', {
    parent: 'leftHalf',
    transform: { position: [0, -TOP - 0.0003, 0], rotation: DOWN },
  }),
  {
    id: 'punch',
    parent: 'leftHalf',
    geometry: {
      type: 'cylinder',
      height: 0.0003,
      topRadius: 0.0013,
      bottomRadius: 0.0013,
      segments: 16,
    },
    material: 'frame',
    transform: { position: [0, -TOP - 0.0005, -LENGTH / 2 + 0.0085] },
    minLod: 2,
  },
];

export const GALAXY_Z_FOLD7_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.phone.galaxy-z-fold7',
  version: '1.0.0',
  title: 'Galaxy Z Fold7',
  category: 'phone',
  family: 'phone',
  footprint: { width: 0.0728, depth: LENGTH, height: FOLDED_H },
  framing: {
    tile: { ...FLAT, padding: 0.08 },
    card: FLAT,
    hero: { ...FLAT, padding: 0.12, focus: 'leftHalf' },
  },
  shots: [phoneShot('leftHalf', 1.2)],
  meta: {
    names: {
      display: 'Galaxy Z Fold7',
      synonyms: ['foldable phone', 'fold phone', 'phone', 'z fold 7', 'fold7'],
    },
    sizeClass: 'small',
    variants: ['black'],
  },
  materials: {
    back: { finish: 'satin-black', roughness: 0.18, clearcoat: 0.9 },
    frame: { finish: 'graphite' },
    panel: { finish: 'satin-black', roughness: 0.06, clearcoat: 1 },
    accent: { color: '#5ED38A', roughness: 0.4, opacity: 0 },
  },
  ...finishSet({ black: {} }, 'black'),
  parts: [...BODY, ...FLAP],
  anchors: [
    {
      kind: 'screen',
      id: 'coverScreen',
      parent: 'leftHalf',
      position: [0, -TOP - 0.0006, 0],
      rotation: DOWN,
      width: 0.0662,
      height: 0.1502,
    },
    {
      kind: 'screen',
      id: 'mainScreen',
      parent: 'body',
      position: [PIVOT_X, TOP + 0.0006, 0],
      rotation: UP,
      width: 2 * MAIN_W,
      height: MAIN_L,
    },
    {
      kind: 'effect',
      id: 'ring',
      position: [0, FOLDED_H + 0.002, 0],
      effect: 'ripple',
      size: 0.12,
    },
    { kind: 'mount', id: 'table', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, 0.03, 0] },
    { kind: 'hit', id: 'tap', position: [0, FOLDED_H / 2, 0], size: [0.0728, 0.02, LENGTH] },
  ],
  channels: [
    {
      id: 'unfold',
      target: 'flap',
      property: 'rotate',
      axis: 'z',
      source: 'fold',
      map: { type: 'linear', in: [0, 1], out: [0, 180], clamp: true },
      motion: { type: 'pose', easeMs: 800 },
      reduced: 'hold',
    },
    {
      id: 'spineShow',
      target: 'spine',
      property: 'visible',
      source: 'fold',
      map: { type: 'linear', in: [0, 0.5], out: [1, 0], clamp: true },
      motion: { type: 'pose', easeMs: 0 },
      reduced: 'hold',
    },
    ...screenChannels('cover'),
    ...screenChannels('mainLeft'),
    ...screenChannels('mainRight'),
    ...signalChannels('chargeGlow', 'ring'),
  ],
  states: {
    ...PHONE_STATES,
    folded: { power: true, online: true, screenOn: true, fold: 0 },
    unfolded: { power: true, online: true, screenOn: true, fold: 1 },
    half: { power: true, online: true, screenOn: true, fold: 0.5 },
  },
};
