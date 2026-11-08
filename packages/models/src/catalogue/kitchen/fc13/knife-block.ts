import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { extrudePath, pathBuilder, type PathBuilder } from '../../../helpers/path';
import { block, piece } from '../../living/fc06/kit';
import { kitchenItem } from './kit';

const WIDTH = 0.15;
const HALF_DEPTH = 0.1;
const LOW = 0.15;
const HIGH = 0.26;
const RADIUS = 0.012;
const SLOPE = Math.atan2(HIGH - LOW, 2 * HALF_DEPTH);
const SURFACE_Y = (HIGH + LOW) / 2;
const HANDLE_LENGTHS = [0.09, 0.11, 0.1, 0.085] as const;
const PITCH = 0.036;

type Point = readonly [number, number];

function toward(from: Point, to: Point, distance: number): Point {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  return [from[0] + (dx / length) * distance, from[1] + (dy / length) * distance];
}

function profile(): PathBuilder {
  const points: readonly Point[] = [
    [-HALF_DEPTH, 0],
    [HALF_DEPTH, 0],
    [HALF_DEPTH, LOW],
    [-HALF_DEPTH, HIGH],
  ];
  const corner = (index: number): { at: Point; in: Point; out: Point } => {
    const at = points[index % points.length] ?? [0, 0];
    const before = points[(index + points.length - 1) % points.length] ?? at;
    const after = points[(index + 1) % points.length] ?? at;
    return { at, in: toward(at, before, RADIUS), out: toward(at, after, RADIUS) };
  };
  const first = corner(0);
  return [1, 2, 3, 4].reduce(
    (path, index) => {
      const next = corner(index);
      return path
        .line(next.in[0], next.in[1])
        .quadratic(next.at[0], next.at[1], next.out[0], next.out[1]);
    },
    pathBuilder(first.out[0], first.out[1]),
  );
}

function along(distance: number): readonly [number, number] {
  return [SURFACE_Y + Math.cos(SLOPE) * distance, Math.sin(SLOPE) * distance];
}

function handleParts(): ModelSpecPart[] {
  return HANDLE_LENGTHS.flatMap((length, index) => {
    const x = (index - 1.5) * PITCH;
    const name = String(index + 1);
    const [y, z] = along(length / 2 - 0.015);
    const [bolsterY, bolsterZ] = along(0.004);
    const turn = [(SLOPE * 180) / Math.PI, 0, 0] as const;
    return [
      block(`handle${name}`, 'trim', [0.026, length, 0.016], {
        at: [x, y, z],
        turn,
        round: 0.007,
        segments: 3,
      }),
      block(`bolster${name}`, 'accent', [0.027, 0.012, 0.017], {
        at: [x, bolsterY, bolsterZ],
        turn,
        round: 0.004,
        segments: 3,
        minLod: 1,
      }),
    ];
  });
}

export const KNIFE_BLOCK_MODEL: ModelSpec = kitchenItem({
  id: 'cat.kitchen.knife-block',
  title: 'Knife block',
  footprint: { width: WIDTH, depth: 2 * HALF_DEPTH, height: HIGH + 0.02 },
  meta: {
    names: {
      display: 'Knife block',
      synonyms: ['knife holder', 'knife stand', 'knife set', 'cutlery block', 'chef knives'],
    },
    sizeClass: 'small',
    aliases: ['cat.kitchen.knife-holder'],
  },
  materials: {
    body: { finish: 'oak' },
    trim: { finish: 'satin-black' },
    accent: { finish: 'brushed-aluminium' },
  },
  defaultFinish: 'oak',
  slots: { body: ['body'] },
  pitch: 24,
  parts: [
    piece('body', 'body', extrudePath(profile(), WIDTH, 0.004), {
      turn: [0, -90, 0],
      contact: true,
    }),
    ...handleParts(),
  ],
});
