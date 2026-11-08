import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { finishSet, tokenMaterial } from '../../../helpers/finishes';
import { pathBuilder, type PathCommand } from '../../../helpers/path';
import {
  REST_STATES,
  STRUCTURE_FINISH_NAMES,
  anchorsOf,
  box,
  cylinder,
  framingOf,
} from '../fc01/look';
import { RISE, RISERS, RUN } from './flight';

const TOTAL_RUN = RISERS * RUN;
const SLOPE = RISE / RUN;
const HAND = 0.95;
const NEWEL = 0.06;
const BAR = 0.016;
const POST_START = 0.13;
const POST_END = TOTAL_RUN - 0.13;
const VIEW = { yaw: 55, pitch: 15, fov: 28, padding: 0.08 } as const;

function handV(u: number): number {
  return SLOPE * u + RISE + HAND;
}

function zOf(u: number): number {
  return TOTAL_RUN / 2 - u;
}

function balusterPath(): PathCommand[] {
  return Array.from({ length: RISERS - 2 }, (_, index) => {
    const step = index + 1;
    const u = (step + 0.5) * RUN;
    return pathBuilder(u - BAR / 2, (step + 1) * RISE)
      .line(u + BAR / 2, (step + 1) * RISE)
      .line(u + BAR / 2, handV(u) - 0.015)
      .line(u - BAR / 2, handV(u) - 0.015)
      .close()
      .build();
  }).flat();
}

function rail(id: string, material: string, radius: number, lift: number): ModelSpecPart {
  const from = POST_START;
  const to = POST_END;
  const length = Math.hypot(to - from, SLOPE * (to - from));
  const middle = (from + to) / 2;
  return cylinder(
    id,
    material,
    { radius, h: length, bevel: 0.004, seg: 32 },
    {
      at: [0, handV(middle) - HAND + lift, zOf(middle)],
      turn: [-(90 - (Math.atan(SLOPE) * 180) / Math.PI), 0, 0],
    },
  );
}

function newels(): ModelSpecPart[] {
  const low = { from: 0, to: handV(POST_START) + 0.1 };
  const high = { from: 2.5, to: handV(POST_END) + 0.1 };
  return [
    { id: 'newelStart', ...low, u: POST_START },
    { id: 'newelEnd', ...high, u: POST_END },
  ].flatMap((newel) => [
    box(
      newel.id,
      'rail',
      { w: NEWEL, h: newel.to - newel.from, d: NEWEL, r: 0.006 },
      { at: [0, (newel.from + newel.to) / 2, zOf(newel.u)], contact: true },
    ),
    box(
      `${newel.id}Cap`,
      'rail',
      { w: NEWEL + 0.012, h: 0.02, d: NEWEL + 0.012, r: 0.006 },
      { at: [0, newel.to + 0.01, zOf(newel.u)], minLod: 1 },
    ),
  ]);
}

export const STAIR_RAILING_MODEL: ModelSpec = {
  schema: 1,
  id: 'cat.structure.stair-railing',
  version: '1.0.0',
  title: 'Stair railing',
  category: 'structure',
  footprint: { width: NEWEL + 0.012, depth: POST_END - POST_START + NEWEL, height: 3.97 },
  framing: framingOf(VIEW),
  meta: {
    names: {
      display: 'Stair railing',
      synonyms: ['stair railing', 'staircase balustrade', 'handrail', 'banister', 'stair banister'],
    },
    sizeClass: 'large',
    variants: [...STRUCTURE_FINISH_NAMES],
  },
  materials: {
    rail: tokenMaterial('matte-white', { roughness: 0.5 }),
    bar: tokenMaterial('graphite'),
  },
  ...finishSet(
    {
      plasterWhite: {},
      warmWhite: { rail: { finish: 'warm-white', roughness: 0.46 } },
      concrete: { rail: { color: '#8C8A85', roughness: 0.8 } },
      brick: { rail: { color: '#6E3B2E', roughness: 0.55 } },
      timber: { rail: { finish: 'oak' } },
    },
    'timber',
  ),
  parts: [
    {
      id: 'balusters',
      geometry: { type: 'extrude', path: balusterPath(), depth: BAR - 0.006, bevel: 0.003 },
      material: 'bar',
      transform: { position: [0, 0, TOTAL_RUN / 2], rotation: [0, 90, 0] },
    },
    rail('handrail', 'rail', 0.024, HAND),
    rail('midRail', 'bar', 0.012, 0.4),
    ...newels(),
  ],
  anchors: anchorsOf({
    id: 'stairRailing',
    mount: 'floor',
    size: [NEWEL + 0.012, 3.97, POST_END - POST_START + NEWEL],
    centreY: 1.985,
  }),
  states: REST_STATES,
};
