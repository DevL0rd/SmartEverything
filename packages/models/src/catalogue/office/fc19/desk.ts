import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { block, by, piece, rod, woodOf } from '../../living/fc06/kit';
import { deskFinishes, officeItem } from './kit';

const HEIGHT = 0.74;
const TOP_T = 0.03;
const LEG = 0.045;
const INSET = 0.06;

function frame(): ModelSpecPart[] {
  const legH = HEIGHT - TOP_T;
  return [
    ...([-1, 1] as const).flatMap((sx) =>
      ([-1, 1] as const).map((sz) =>
        block(`leg${sx < 0 ? 'L' : 'R'}${sz < 0 ? 'B' : 'F'}`, 'frame', [LEG, legH, LEG], {
          at: [by('width', sx * 0.5, -sx * INSET), legH / 2, by('depth', sz * 0.5, -sz * INSET)],
          round: 0.012,
          segments: 3,
          contact: true,
        }),
      ),
    ),
    ...([-1, 1] as const).map((sx) =>
      block(`sideRail${sx < 0 ? 'L' : 'R'}`, 'frame', [0.022, 0.07, by('depth', 1, -2 * INSET)], {
        at: [by('width', sx * 0.5, -sx * INSET), legH - 0.05, 0],
        round: 0.007,
        segments: 3,
      }),
    ),
    block('modesty', 'frame', [by('width', 1, -2 * INSET - 0.04), 0.22, 0.018], {
      at: [0, legH - 0.17, by('depth', -0.5, INSET)],
      round: 0.007,
      segments: 3,
    }),
  ];
}

export const DESK_MODEL: ModelSpec = officeItem({
  id: 'cat.office.desk',
  title: 'Desk',
  footprint: { width: 1.4, depth: 0.7, height: HEIGHT },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    depth: { param: 'depth', extra: 0, resizes: true },
  },
  meta: {
    names: {
      display: 'Desk',
      synonyms: [
        'office desk',
        'writing desk',
        'work desk',
        'computer desk',
        'study desk',
        'table desk',
      ],
    },
    sizeClass: 'medium',
    aliases: ['cat.office.writing-desk'],
  },
  params: {
    width: { min: 1, max: 2, default: 1.4, unit: 'm' },
    depth: { min: 0.5, max: 0.9, default: 0.7, unit: 'm' },
  },
  materials: {
    top: woodOf('oak'),
    frame: { finish: 'graphite' },
    accent: { finish: 'chrome' },
  },
  finishes: deskFinishes(['top'], ['frame']),
  defaultFinish: 'oak',
  pitch: 20,
  wall: true,
  extraAnchors: [{ kind: 'mount', id: 'surface', position: [0, HEIGHT, 0], mount: 'desk' }],
  parts: [
    block('top', 'top', [by('width', 1), TOP_T, by('depth', 1)], {
      at: [0, HEIGHT - TOP_T / 2, 0],
      round: 0.012,
      segments: 3,
    }),
    ...frame(),
    piece(
      'grommet',
      'accent',
      { type: 'torus', radius: 0.026, tube: 0.005, segments: 32 },
      {
        at: [by('width', 0.5, -0.2), HEIGHT + 0.001, by('depth', -0.5, 0.12)],
        turn: [90, 0, 0],
        minLod: 1,
      },
    ),
    ...([-1, 1] as const).flatMap((sx) =>
      ([-1, 1] as const).map((sz) =>
        rod(
          `glide${sx < 0 ? 'L' : 'R'}${sz < 0 ? 'B' : 'F'}`,
          'accent',
          { height: 0.008, top: 0.018, segments: 24 },
          {
            at: [by('width', sx * 0.5, -sx * INSET), 0.004, by('depth', sz * 0.5, -sz * INSET)],
            minLod: 2,
          },
        ),
      ),
    ),
  ],
});
