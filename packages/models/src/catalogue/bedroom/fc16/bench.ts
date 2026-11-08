import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import {
  block,
  by,
  corners,
  ferrules,
  legs,
  upholsteryFinishes,
  upholsteryOf,
  woodOf,
} from '../../living/fc06/kit';
import { bedroomItem } from '../fc14/kit';

const DEPTH = 0.42;
const LEG = 0.32;
const SEAT_H = 0.14;
const FRAME_H = 0.05;

function parts(): ModelSpecPart[] {
  const x = by('width', 0.5, -0.06);
  const negX = by('width', -0.5, 0.06);
  const feet = corners(x, DEPTH / 2 - 0.06, negX, -DEPTH / 2 + 0.06);
  const base = LEG + FRAME_H;
  return [
    block('frame', 'frame', [by('width', 1, -0.08), FRAME_H, DEPTH - 0.06], {
      at: [0, LEG + FRAME_H / 2, 0],
      round: 0.012,
      segments: 3,
    }),
    block('seat', 'seat', [by('width', 1), SEAT_H, DEPTH], {
      at: [0, base + SEAT_H / 2, 0],
      round: 0.06,
      contact: true,
    }),
    ...legs('frame', feet, { height: LEG, top: 0.026, bottom: 0.016 }),
    ...ferrules(feet, 0.0165),
  ];
}

export const BED_BENCH_MODEL: ModelSpec = bedroomItem({
  id: 'cat.bedroom.bed-bench',
  title: 'Bed bench',
  footprint: { width: 1.2, depth: DEPTH, height: LEG + FRAME_H + SEAT_H },
  size: { width: { param: 'width', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Bed bench',
      synonyms: [
        'end of bed bench',
        'bedroom bench',
        'upholstered bench',
        'foot of bed bench',
        'ottoman bench',
      ],
    },
    sizeClass: 'medium',
    aliases: ['cat.bedroom.bench'],
  },
  params: { width: { min: 0.8, max: 1.6, default: 1.2, unit: 'm' } },
  materials: {
    seat: upholsteryOf('oat'),
    frame: woodOf('oak'),
    accent: { finish: 'brushed-aluminium' },
  },
  finishes: upholsteryFinishes(['seat']),
  defaultFinish: 'oat',
  pitch: 22,
  parts: parts(),
});
