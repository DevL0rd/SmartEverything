import type { ModelSpec } from '@smarteverything/domain';
import { block, by, fabric, rod, upholsteryFinishes } from '../../living/fc06/kit';
import { officeItem, starBase } from './kit';

const SEAT_Y = 0.46;

function up(y: number): ReturnType<typeof by> {
  return by('lift', 1, y - SEAT_Y);
}

export const OFFICE_CHAIR_MODEL: ModelSpec = officeItem({
  id: 'cat.office.office-chair',
  title: 'Office chair',
  footprint: { width: 0.66, depth: 0.66, height: 1.0861 },
  size: { height: { param: 'lift', extra: 0.6261, resizes: true } },
  meta: {
    names: {
      display: 'Office chair',
      synonyms: [
        'task chair',
        'swivel chair',
        'desk chair',
        'ergonomic chair',
        'mesh office chair',
        'computer chair',
      ],
    },
    sizeClass: 'medium',
    aliases: ['cat.office.task-chair'],
  },
  params: { lift: { min: 0.42, max: 0.54, default: SEAT_Y, unit: 'm' } },
  materials: {
    seat: fabric('#2B3242'),
    frame: { finish: 'satin-black' },
    accent: { finish: 'chrome' },
  },
  finishes: upholsteryFinishes(['seat']),
  defaultFinish: 'ink',
  pitch: 16,
  parts: [
    ...starBase({ radius: 0.31, arm: 0.052, wheelLod: 1 }),
    block('hub', 'frame', [0.1, 0.05, 0.1], {
      at: [0, 0.12, 0],
      round: 0.025,
      segments: 3,
      minLod: 1,
    }),
    rod(
      'column',
      'accent',
      { height: by('lift', 1, -0.22), top: 0.027, segments: 32 },
      {
        at: [0, by('lift', 0.5, 0.03), 0],
      },
    ),
    block('mechanism', 'frame', [0.24, 0.05, 0.26], {
      at: [0, up(0.39), 0.0],
      round: 0.02,
      segments: 3,
      minLod: 1,
    }),
    block('cushion', 'seat', [0.5, 0.085, 0.49], {
      at: [0, up(SEAT_Y), 0.03],
      round: 0.038,
      segments: 4,
    }),
    block('stem', 'frame', [0.05, 0.32, 0.034], {
      at: [0, up(0.56), -0.235],
      turn: [-10, 0, 0],
      round: 0.014,
      segments: 3,
      minLod: 1,
    }),
    block('backFrame', 'frame', [0.49, 0.58, 0.034], {
      at: [0, up(0.8), -0.29],
      turn: [-9, 0, 0],
      round: 0.02,
      segments: 3,
    }),
    block('mesh', 'seat', [0.42, 0.5, 0.044], {
      at: [0, up(0.8), -0.29],
      turn: [-9, 0, 0],
      round: 0.018,
      segments: 3,
    }),
    ...([-1, 1] as const).flatMap((side) => {
      const name = side < 0 ? 'Left' : 'Right';
      return [
        block(`armPost${name}`, 'frame', [0.03, 0.2, 0.03], {
          at: [side * 0.27, up(0.56), 0.02],
          round: 0.01,
          segments: 3,
        }),
        block(`armPad${name}`, 'frame', [0.07, 0.035, 0.27], {
          at: [side * 0.27, up(0.675), 0.03],
          round: 0.016,
          segments: 3,
        }),
      ];
    }),
  ],
});
