import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { STORAGE_ACCENT, block, by, rod, storageItem, woodOf } from '../fc21/kit';

const FRONT_TILT = 6;
const REAR_TILT = 24;
const FRONT_TAN = Math.tan((FRONT_TILT * Math.PI) / 180);
const REAR_TAN = Math.tan((REAR_TILT * Math.PI) / 180);
const FRONT_COS = Math.cos((FRONT_TILT * Math.PI) / 180);
const REAR_COS = Math.cos((REAR_TILT * Math.PI) / 180);
const FRONT_Z = 0.28;
const REAR_Z = -0.42;
const HALF = 0.2;
const TREADS = [0.22, 0.47, 0.72] as const;
const BASE_H = 1.2;
const FRONT_TOP = FRONT_Z - FRONT_TAN * BASE_H;
const REAR_TOP = REAR_Z + REAR_TAN * BASE_H;
const MID_TOP = (FRONT_TOP + REAR_TOP) / 2;

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function rails(): ModelSpecPart[] {
  return [-1, 1].flatMap((side) => {
    const name = side < 0 ? 'Left' : 'Right';
    return [
      block(`front${name}`, 'frame', [0.045, by('height', round4(1 / FRONT_COS)), 0.026], {
        at: [
          side * HALF,
          by('height', 0.5),
          by('height', round4(FRONT_TAN / 2), round4(FRONT_TOP)),
        ],
        turn: [-FRONT_TILT, 0, 0],
        round: 0.008,
        segments: 3,
        contact: true,
      }),
      block(`rear${name}`, 'frame', [0.04, by('height', round4(1 / REAR_COS)), 0.024], {
        at: [side * HALF, by('height', 0.5), by('height', -round4(REAR_TAN / 2), round4(REAR_TOP))],
        turn: [REAR_TILT, 0, 0],
        round: 0.008,
        segments: 3,
        contact: true,
      }),
    ];
  });
}

function treads(): ModelSpecPart[] {
  return TREADS.map((fraction, index) =>
    block(`tread${String(index + 1)}`, 'frame', [2 * HALF + 0.03, 0.026, 0.12], {
      at: [
        0,
        by('height', fraction),
        by('height', round4(FRONT_TAN * (1 - fraction)), round4(FRONT_TOP - 0.005)),
      ],
      round: 0.008,
      segments: 3,
    }),
  );
}

function spreaders(): ModelSpecPart[] {
  const at = 0.4;
  return [-1, 1].map((side) =>
    rod(
      side < 0 ? 'spreaderLeft' : 'spreaderRight',
      'accent',
      {
        height: by(
          'height',
          round4((1 - at) * (FRONT_TAN + REAR_TAN)),
          round4(FRONT_TOP - REAR_TOP),
        ),
        top: 0.007,
        segments: 12,
      },
      {
        at: [
          side * HALF,
          by('height', at),
          by('height', round4(((1 - at) * (FRONT_TAN - REAR_TAN)) / 2), round4(MID_TOP)),
        ],
        turn: [90, 0, 0],
        minLod: 1,
      },
    ),
  );
}

export const STEP_LADDER_MODEL: ModelSpec = storageItem({
  id: 'cat.storage.step-ladder',
  title: 'Step ladder',
  footprint: { width: 0.46, depth: 0.7382, height: 1.2097 },
  size: {
    depth: { param: 'height', scale: 0.5272, extra: 0.1056, resizes: false },
    height: { param: 'height', extra: 0.0097, resizes: true },
  },
  meta: {
    names: {
      display: 'Step ladder',
      synonyms: [
        'stepladder',
        'folding ladder',
        'a-frame ladder',
        'step stool ladder',
        'household ladder',
      ],
    },
    sizeClass: 'medium',
    aliases: ['cat.storage.ladder'],
  },
  params: { height: { min: 0.9, max: 1.8, default: 1.2, unit: 'm' } },
  materials: { frame: woodOf('oak'), accent: STORAGE_ACCENT },
  slots: ['frame'],
  pitch: 14,
  parts: [
    ...rails(),
    ...treads(),
    block('platform', 'frame', [2 * HALF + 0.06, 0.03, 0.26], {
      at: [0, by('height', 1, -0.015), round4(MID_TOP)],
      round: 0.01,
      segments: 3,
    }),
    ...spreaders(),
  ],
});
