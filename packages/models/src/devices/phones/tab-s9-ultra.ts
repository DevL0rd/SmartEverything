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

const WIDTH = 0.3264;
const LENGTH = 0.2086;
const T = 0.0055;
const TOP = T / 2;
const SCREEN_W = 0.3144;
const SCREEN_L = 0.1965;
const UP: [number, number, number] = [-90, 0, 0];
const DOWN: [number, number, number] = [90, 0, 0];

const PARTS: ModelSpecPart[] = [
  box('body', [WIDTH, T, LENGTH, 0.0022], 'shell', {
    transform: { position: [0, T / 2, 0] },
    contact: true,
  }),
  face('glass', [WIDTH - 0.0016, LENGTH - 0.0016, 0.0105], 'trim', {
    parent: 'body',
    transform: { position: [0, TOP + 0.0002, 0], rotation: UP },
  }),
  face('screen', [SCREEN_W, SCREEN_L, 0.0062], 'panel', {
    parent: 'body',
    transform: { position: [0, TOP + 0.0004, 0], rotation: UP },
  }),
  face('notch', [0.032, 0.0062, 0.0024], 'trim', {
    parent: 'body',
    transform: { position: [0, TOP + 0.0006, -SCREEN_L / 2 + 0.0022], rotation: UP },
  }),
  box('penStrip', [0.15, 0.0006, 0.0115, 0.00028], 'trim', {
    parent: 'body',
    transform: { position: [0.03, -TOP - 0.0003, -LENGTH / 2 + 0.024] },
    minLod: 1,
  }),
  lens('lensMain', 'body', [-WIDTH / 2 + 0.018, -TOP - 0.0011, -LENGTH / 2 + 0.017], 'trim'),
  lens('lensWide', 'body', [-WIDTH / 2 + 0.018, -TOP - 0.0011, -LENGTH / 2 + 0.033], 'trim'),
  {
    id: 'frontCams',
    parent: 'body',
    geometry: { type: 'roundedPlane', width: 0.014, height: 0.0024, radius: 0.0011, segments: 3 },
    material: 'shell',
    transform: { position: [0, TOP + 0.0008, -SCREEN_L / 2 + 0.0024], rotation: UP },
    minLod: 2,
  },
  {
    id: 'chargeGlow',
    parent: 'body',
    geometry: { type: 'glow', width: WIDTH * 1.15, height: LENGTH * 1.15, segments: 24 },
    material: 'accent',
    transform: { position: [0, -TOP + 0.0002, 0], rotation: DOWN },
    minLod: 1,
  },
];

export const GALAXY_TAB_S9_ULTRA_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.tablet.galaxy-tab-s9-ultra',
  version: '1.0.0',
  title: 'Galaxy Tab S9 Ultra',
  category: 'phone',
  family: 'phone',
  footprint: { width: WIDTH, depth: LENGTH, height: T },
  framing: {
    tile: { ...FLAT, padding: 0.06 },
    card: FLAT,
    hero: { ...FLAT, padding: 0.1, focus: 'screen' },
  },
  shots: [phoneShot('screen', 1.05)],
  meta: {
    names: {
      display: 'Galaxy Tab S9 Ultra',
      synonyms: ['tablet', 'android tablet', 'tab s9 ultra', 'galaxy tab'],
    },
    sizeClass: 'medium',
    variants: ['graphite'],
  },
  materials: {
    shell: { finish: 'graphite' },
    trim: { finish: 'satin-black', roughness: 0.2, clearcoat: 0.8 },
    panel: { finish: 'satin-black', roughness: 0.06, clearcoat: 1 },
    accent: { color: '#5ED38A', roughness: 0.4, opacity: 0 },
  },
  ...finishSet({ graphite: {} }, 'graphite'),
  parts: PARTS,
  anchors: [
    {
      kind: 'screen',
      id: 'display',
      parent: 'body',
      position: [0, TOP + 0.0008, 0],
      rotation: UP,
      width: SCREEN_W,
      height: SCREEN_L,
    },
    { kind: 'effect', id: 'ring', position: [0, T + 0.002, 0], effect: 'ripple', size: 0.3 },
    { kind: 'mount', id: 'table', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, 0.04, 0] },
    { kind: 'hit', id: 'tap', position: [0, 0.01, 0], size: [WIDTH, 0.02, LENGTH] },
  ],
  channels: [...screenChannels('screen'), ...signalChannels('chargeGlow', 'ring')],
  states: PHONE_STATES,
};
