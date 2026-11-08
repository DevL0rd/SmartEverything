import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { OUTDOOR_FRAME, block, by, outdoorItem, piece } from '../fc23/kit';

const TILT = 10;
const COS = Math.cos((TILT * Math.PI) / 180);
const SEAT_Y = 0.44;
const REAR_Z = -0.27;
const FRONT_Z = 0.22;

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function frames(): ModelSpecPart[] {
  return [-1, 1].flatMap((side) => {
    const name = side < 0 ? 'Left' : 'Right';
    const x = by('length', side * 0.5, -side * 0.05);
    return [
      block(`front${name}`, 'frame', [0.05, 0.62, 0.05], {
        at: [x, 0.31, FRONT_Z],
        round: 0.012,
        segments: 3,
        contact: true,
      }),
      block(`rear${name}`, 'frame', [0.05, round4(0.9 / COS), 0.05], {
        at: [x, 0.45, REAR_Z],
        turn: [-TILT, 0, 0],
        round: 0.012,
        segments: 3,
        contact: true,
      }),
      block(`arm${name}`, 'frame', [0.06, 0.035, 0.5], {
        at: [x, 0.62, -0.02],
        round: 0.012,
        segments: 3,
        minLod: 1,
      }),
      block(`brace${name}`, 'frame', [0.035, 0.06, 0.46], {
        at: [x, SEAT_Y - 0.045, 0],
        round: 0.01,
        segments: 3,
        minLod: 1,
      }),
    ];
  });
}

export const GARDEN_BENCH_MODEL: ModelSpec = outdoorItem({
  id: 'cat.outdoor.garden-bench',
  title: 'Garden bench',
  footprint: { width: 1.5, depth: 0.62, height: 0.93 },
  size: { width: { param: 'length', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Garden bench',
      synonyms: ['park bench', 'outdoor bench', 'patio bench', 'slatted bench', 'wooden bench'],
    },
    sizeClass: 'large',
    aliases: ['cat.outdoor.park-bench', 'cat.outdoor.bench'],
  },
  params: { length: { min: 1, max: 2, default: 1.5, unit: 'm' } },
  materials: { frame: OUTDOOR_FRAME },
  slots: { frame: ['frame'] },
  pitch: 14,
  parts: [
    piece(
      'seat',
      'frame',
      {
        type: 'slats',
        count: 5,
        spacing: 0.075,
        width: by('length', 1),
        height: 0.065,
        depth: 0.028,
      },
      { at: [0, SEAT_Y, 0.02], turn: [90, 0, 0] },
    ),
    piece(
      'back',
      'frame',
      {
        type: 'slats',
        count: 4,
        spacing: 0.1,
        width: by('length', 1, -0.1),
        height: 0.09,
        depth: 0.025,
      },
      { at: [0, 0.73, -0.32], turn: [-TILT, 0, 0] },
    ),
    ...frames(),
  ],
});
