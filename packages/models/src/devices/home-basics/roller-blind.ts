import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { enumChannel, statusLedChannels } from '@smarteverything/domain';
import { part, roundedBox } from '../../helpers/geometry';
import { cylinder } from '../light-fixtures/kit';
import { FAULT, hinge, whenPhase } from './kit';

const WIDTH = 1.2;
const HEIGHT = 1.4;
const DEPTH = 0.09;
const CASE_H = 0.07;
const CASE_D = 0.072;
const TOP = HEIGHT - CASE_H;
const DROP = TOP - 0.06;
const HUNG = 0.03;
const FABRIC_Z = 0.04;
const CHAIN = 0.78;
const CHAIN_Z = 0.064;
const VIEW = { yaw: 20, pitch: 8, fov: 28, padding: 0.1, focus: 'body' } as const;
const SPAN = { param: 'width', scale: 1 / WIDTH } as const;

function across(side: 1 | -1, offset: number): { param: string; scale: number; offset: number } {
  return { param: 'width', scale: side * 0.5, offset };
}

function slab(
  id: string,
  [width, height, depth, radius]: readonly [number, number, number, number],
  material: string,
  options: Omit<ModelSpecPart, 'id' | 'geometry' | 'material'>,
): ModelSpecPart {
  return part(id, roundedBox({ width, height, depth, radius, segments: 3 }), material, options);
}

const PARTS: ModelSpec['parts'] = [
  slab('cassette', [WIDTH, CASE_H, CASE_D, 0.014], 'body', {
    transform: { position: [0, TOP + CASE_H / 2, CASE_D / 2], scale: [SPAN, 1, 1] },
    contact: true,
  }),
  slab('slot', [WIDTH - 0.03, 0.006, 0.02, 0.002], 'trim', {
    parent: 'cassette',
    transform: { position: [0, -CASE_H / 2 + 0.002, FABRIC_Z - CASE_D / 2] },
    minLod: 1,
  }),
  slab('capLeft', [0.012, CASE_H + 0.004, CASE_D + 0.004, 0.005], 'trim', {
    transform: { position: [across(-1, -0.004), TOP + CASE_H / 2, CASE_D / 2] },
  }),
  slab('capRight', [0.012, CASE_H + 0.004, CASE_D + 0.004, 0.005], 'trim', {
    transform: { position: [across(1, 0.004), TOP + CASE_H / 2, CASE_D / 2] },
  }),
  hinge('roll', { at: [0, TOP, FABRIC_Z], transform: { scale: [1, DROP, 1] } }),
  slab('fabric', [WIDTH - 0.03, 1, 0.003, 0.0015], 'fabric', {
    parent: 'roll',
    transform: { position: [0, -0.5, 0], scale: [SPAN, 1, 1] },
  }),
  slab('bar', [WIDTH - 0.02, 0.024, 0.016, 0.007], 'body', {
    transform: { position: [0, TOP - DROP, FABRIC_Z], scale: [SPAN, 1, 1] },
  }),
  slab('hem', [WIDTH - 0.03, 0.02, 0.0034, 0.0015], 'fabric', {
    parent: 'bar',
    transform: { position: [0, 0.02, 0] },
    minLod: 2,
  }),
  slab('pull', [0.04, 0.012, 0.01, 0.004], 'trim', {
    parent: 'bar',
    transform: { position: [0, -0.014, 0.004] },
    minLod: 1,
  }),
  part('chainFront', cylinder({ top: 0.0016, height: CHAIN, segments: 10 }), 'trim', {
    transform: { position: [across(1, -0.03), TOP - CHAIN / 2, CHAIN_Z + 0.004] },
  }),
  part('chainBack', cylinder({ top: 0.0016, height: CHAIN, segments: 10 }), 'trim', {
    transform: { position: [across(1, -0.03), TOP - CHAIN / 2, CHAIN_Z - 0.004] },
    minLod: 1,
  }),
  part('loop', { type: 'torus', radius: 0.004, tube: 0.0016, segments: 16 }, 'trim', {
    transform: { position: [across(1, -0.03), TOP - CHAIN, CHAIN_Z], rotation: [0, 90, 0] },
    minLod: 1,
  }),
  part('stop', { type: 'sphere', radius: 0.0042, segments: 16 }, 'trim', {
    transform: { position: [across(1, -0.03), TOP - CHAIN * 0.62, CHAIN_Z + 0.004] },
    minLod: 2,
  }),
  slab('led', [0.004, 0.004, 0.0012, 0.0018], 'accent', {
    parent: 'capRight',
    transform: { position: [0, -0.016, CASE_D / 2 + 0.002] },
    minLod: 1,
  }),
];

export const ROLLER_BLIND_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.cover.roller-blind',
  version: '1.0.0',
  title: 'Roller blind',
  category: 'cover',
  family: 'cover',
  footprint: { width: 1.22, depth: DEPTH, height: HEIGHT },
  size: { width: { param: 'width', extra: 0.02, resizes: true } },
  framing: {
    tile: { ...VIEW, padding: 0.03 },
    card: { ...VIEW, padding: 0.06 },
    hero: { ...VIEW, padding: 0.1 },
  },
  shots: [
    {
      id: 'rolling',
      when: whenPhase('opening', 'closing'),
      focus: 'body',
      zoom: 1.08,
      yaw: 14,
      pitch: 6,
      easeMs: 900,
      loopS: 1,
      symmetry: 360,
      stillAt: 0,
    },
  ],
  meta: {
    names: {
      display: 'Roller blind',
      synonyms: ['roller blind', 'roller shade', 'window blind', 'motorised blind', 'shade'],
    },
    sizeClass: 'large',
    variants: ['linen', 'stone', 'charcoal'],
  },
  params: { width: { min: 0.4, max: 2.4, default: WIDTH, unit: 'm' } },
  materials: {
    body: { finish: 'matte-white', roughness: 0.5 },
    fabric: { color: '#C9BBA2', roughness: 0.92, sheen: 0.55, pattern: 'knit' },
    trim: { finish: 'graphite' },
    accent: { color: '#5ED3CF', roughness: 0.3, opacity: 0 },
  },
  finishes: {
    linen: {},
    stone: { fabric: { color: '#9A9C9E' } },
    charcoal: { fabric: { color: '#4A4C50' }, body: { finish: 'graphite' } },
  },
  defaultFinish: 'linen',
  parts: PARTS,
  anchors: [
    { kind: 'mount', id: 'wall', position: [0, HEIGHT / 2, 0], mount: 'wall' },
    { kind: 'label', id: 'pin', position: [0, HEIGHT + 0.06, CASE_D / 2] },
    {
      kind: 'hit',
      id: 'body',
      position: [0, HEIGHT / 2, DEPTH / 2],
      size: [WIDTH, HEIGHT, DEPTH],
    },
  ],
  channels: [
    {
      id: 'rollDrop',
      target: 'roll',
      property: 'scale',
      axis: 'y',
      source: 'position',
      map: { type: 'linear', in: [0, 1], out: [1, HUNG / DROP], clamp: true },
      motion: { type: 'pose', easeMs: 1600 },
      reduced: 'hold',
    },
    {
      id: 'barLift',
      target: 'bar',
      property: 'translate',
      axis: 'y',
      source: 'position',
      map: { type: 'linear', in: [0, 1], out: [0, DROP - HUNG], clamp: true },
      motion: { type: 'pose', easeMs: 1600 },
      reduced: 'hold',
    },
    ...statusLedChannels('led'),
    enumChannel('ledFault', ['led', 'colour'], ['fault', { true: FAULT }]),
  ],
  states: {
    closed: { position: 0, online: true, phase: 'idle' },
    half: { position: 0.5, online: true, phase: 'idle' },
    open: { position: 1, online: true, phase: 'idle' },
    opening: { position: 0.6, online: true, phase: 'opening' },
    fault: { position: 0.3, online: true, fault: true },
    offline: { online: false },
  },
};
