import type { ModelSpecPart } from '@smarteverything/domain';
import { piece, rod } from '../../living/fc06/kit';
import { ellipseSlab } from './kit';

export interface SeatShape {
  readonly width: number;
  readonly length: number;
  readonly y: number;
  readonly z: number;
}

const TUBE = 0.1;
const THICK = 0.03;
const LID = 0.02;

export function seatParts(shape: SeatShape): ModelSpecPart[] {
  const outer = 0.5 + TUBE;
  return [
    piece(
      'seat',
      'ware',
      { type: 'torus', radius: 0.5, tube: TUBE, segments: 48 },
      {
        at: [0, shape.y + THICK / 2, shape.z],
        turn: [90, 0, 0],
        scale: [shape.width / (2 * outer), shape.length / (2 * outer), THICK / (2 * TUBE)],
      },
    ),
    ellipseSlab(
      'lid',
      'ware',
      { plan: [shape.width, shape.length], height: LID },
      {
        at: [0, shape.y + THICK + LID / 2, shape.z],
      },
    ),
    ...([-1, 1] as const).map((side) =>
      rod(
        side < 0 ? 'hingeLeft' : 'hingeRight',
        'accent',
        { height: 0.03, top: 0.011, segments: 24 },
        {
          at: [side * shape.width * 0.28, shape.y + THICK, shape.z - shape.length / 2 + 0.01],
          minLod: 1,
        },
      ),
    ),
  ];
}
