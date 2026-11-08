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
} from '../phones/slab';

const WIDTH = 0.0715;
const LENGTH = 0.147;
const T = 0.0078;
const TOP = T / 2;
const SCREEN_W = WIDTH - 0.0034;
const SCREEN_L = LENGTH - 0.0044;
const UP: [number, number, number] = [-90, 0, 0];
const DOWN: [number, number, number] = [90, 0, 0];
const SIZE = { param: 'size' } as const;

const PARTS: ModelSpecPart[] = [
  box('body', [WIDTH, T, LENGTH, 0.0032], 'back', {
    transform: { position: [0, { param: 'size', scale: T / 2 }, 0], scale: [SIZE, SIZE, SIZE] },
    contact: true,
  }),
  box('rail', [WIDTH + 0.0004, T * 0.6, LENGTH + 0.0004, 0.0018], 'frame', { parent: 'body' }),
  face('screen', [SCREEN_W, SCREEN_L, 0.0068], 'panel', {
    parent: 'body',
    transform: { position: [0, TOP + 0.0003, 0], rotation: UP },
  }),
  {
    id: 'punch',
    parent: 'body',
    geometry: {
      type: 'cylinder',
      height: 0.0003,
      topRadius: 0.0015,
      bottomRadius: 0.0015,
      segments: 16,
    },
    material: 'frame',
    transform: { position: [0, TOP + 0.0006, -SCREEN_L / 2 + 0.008] },
    minLod: 2,
  },
  box('island', [0.016, 0.0014, 0.034, 0.0007], 'back', {
    parent: 'body',
    transform: { position: [WIDTH / 2 - 0.013, -TOP - 0.0006, -LENGTH / 2 + 0.024] },
    minLod: 1,
  }),
  lens('lensMain', 'island', [0, -0.0008, -0.0085], 'frame'),
  lens('lensWide', 'island', [0, -0.0008, 0.0085], 'frame'),
  {
    id: 'chargeGlow',
    parent: 'body',
    geometry: { type: 'glow', width: WIDTH * 1.4, height: LENGTH * 1.1, segments: 24 },
    material: 'accent',
    transform: { position: [0, -TOP + 0.0002, 0], rotation: DOWN },
    minLod: 1,
  },
];

export const GENERIC_PHONE_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.phone.generic',
  version: '1.0.0',
  title: 'Phone',
  category: 'phone',
  family: 'phone',
  footprint: { width: WIDTH, depth: LENGTH, height: T },
  framing: {
    tile: { ...FLAT, padding: 0.08 },
    card: FLAT,
    hero: { ...FLAT, padding: 0.12, focus: 'screen' },
  },
  shots: [phoneShot('screen', 1.2)],
  meta: {
    names: {
      display: 'Phone',
      synonyms: ['smartphone', 'mobile', 'android phone', 'cell phone'],
    },
    sizeClass: 'small',
    variants: ['black', 'white'],
  },
  params: { size: { min: 0.85, max: 1.15, default: 1, unit: 'ratio' } },
  materials: {
    back: { finish: 'satin-black', roughness: 0.2, clearcoat: 0.8 },
    frame: { finish: 'graphite' },
    panel: { finish: 'satin-black', roughness: 0.06, clearcoat: 1 },
    accent: { color: '#5ED38A', roughness: 0.4, opacity: 0 },
  },
  ...finishSet(
    {
      black: {},
      white: { back: { finish: 'matte-white' }, frame: { finish: 'brushed-aluminium' } },
    },
    'black',
  ),
  parts: PARTS,
  anchors: [
    {
      kind: 'screen',
      id: 'display',
      parent: 'body',
      position: [0, TOP + 0.0006, 0],
      rotation: UP,
      width: SCREEN_W,
      height: SCREEN_L,
    },
    { kind: 'effect', id: 'ring', position: [0, T + 0.002, 0], effect: 'ripple', size: 0.12 },
    { kind: 'mount', id: 'table', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, 0.03, 0] },
    { kind: 'hit', id: 'tap', position: [0, 0.01, 0], size: [WIDTH, 0.02, LENGTH] },
  ],
  channels: [...screenChannels('screen'), ...signalChannels('chargeGlow', 'ring')],
  states: PHONE_STATES,
};
