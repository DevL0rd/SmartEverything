import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { extrudePath, pathBuilder, roundedRectPath, type PathCommand } from '../../../helpers/path';
import { block, by, piece, rod } from '../../living/fc06/kit';
import { bathroomItem } from './kit';

const LENGTH = 1.7;
const DEPTH = 0.75;
const HEIGHT = 0.56;
const WALL = 0.09;
const FLOOR_TOP = 0.16;
const BEVEL = 0.008;

function clockwiseRect(width: number, height: number, radius: number): PathCommand[] {
  const x = width / 2;
  const y = height / 2;
  const corner = { rx: radius, ry: radius, sweep: false };
  return [
    ...pathBuilder(-x, -y + radius)
      .line(-x, y - radius)
      .arc(corner, -x + radius, y)
      .line(x - radius, y)
      .arc(corner, x, y - radius)
      .line(x, -y + radius)
      .arc(corner, x - radius, -y)
      .line(-x + radius, -y)
      .arc(corner, -x, -y + radius)
      .build(),
  ];
}

function tubParts(): ModelSpecPart[] {
  const path = [
    ...clockwiseRect(LENGTH, DEPTH, 0.05),
    ...roundedRectPath(LENGTH - 2 * WALL, DEPTH - 2 * WALL, 0.14),
  ];
  const factor = by('length', 1 / LENGTH);
  return [
    piece('tub', 'ware', extrudePath(path, HEIGHT - 2 * BEVEL, BEVEL), {
      at: [0, HEIGHT / 2, 0],
      turn: [90, 0, 0],
      scale: [factor, 1, 1],
      contact: true,
    }),
    block(
      'bed',
      'ware',
      [by('length', 1, -2 * WALL + 0.04), FLOOR_TOP - 0.02, DEPTH - 2 * WALL + 0.04],
      {
        at: [0, (FLOOR_TOP - 0.02) / 2 + 0.02, 0],
        round: 0.01,
        segments: 3,
      },
    ),
    block('backrest', 'ware', [0.07, 0.4, DEPTH - 2 * WALL - 0.02], {
      at: [by('length', -0.5, WALL + 0.12), FLOOR_TOP + 0.19, 0],
      turn: [0, 0, -16],
      round: 0.03,
      segments: 3,
    }),
  ];
}

function fittings(): ModelSpecPart[] {
  const end = by('length', 0.5, -WALL / 2);
  return [
    rod(
      'tapBase',
      'accent',
      { height: 0.02, top: 0.024, bottom: 0.03, segments: 32 },
      {
        at: [end, HEIGHT + 0.01, 0],
      },
    ),
    rod(
      'tapColumn',
      'accent',
      { height: 0.1, top: 0.011, bottom: 0.013, segments: 24 },
      {
        at: [end, HEIGHT + 0.07, 0],
      },
    ),
    rod(
      'tapSpout',
      'accent',
      { height: 0.11, top: 0.01, segments: 24 },
      {
        at: [by('length', 0.5, -WALL / 2 - 0.045), HEIGHT + 0.12, 0],
        turn: [0, 0, 90],
      },
    ),
    rod(
      'tapLever',
      'accent',
      { height: 0.05, top: 0.007, segments: 16 },
      {
        at: [by('length', 0.5, -WALL / 2 - 0.0), HEIGHT + 0.095, 0.03],
        turn: [90, 0, 0],
        minLod: 1,
      },
    ),
    rod(
      'drain',
      'accent',
      { height: 0.006, top: 0.033, segments: 32 },
      {
        at: [by('length', 0.5, -WALL - 0.14), FLOOR_TOP + 0.003, 0],
        minLod: 1,
      },
    ),
  ];
}

export const BUILT_IN_BATH_MODEL: ModelSpec = bathroomItem({
  id: 'cat.bathroom.built-in-bath',
  title: 'Built-in bath',
  footprint: { width: 1.716, depth: DEPTH, height: HEIGHT + 0.19 },
  size: { width: { param: 'length', scale: 1.0094, extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Built-in bath',
      synonyms: [
        'alcove bath',
        'inset bathtub',
        'fitted bath',
        'rectangular bath',
        'shower bath',
        'bathtub',
      ],
    },
    sizeClass: 'large',
    aliases: ['cat.bathroom.alcove-bath'],
  },
  params: { length: { min: 1.5, max: 1.9, default: LENGTH, unit: 'm' } },
  materials: {
    ware: { finish: 'ceramic' },
    accent: { finish: 'chrome' },
  },
  roles: { ware: 'ware', accent: 'fixture' },
  pitch: 24,
  wall: true,
  parts: [...tubParts(), ...fittings()],
});
