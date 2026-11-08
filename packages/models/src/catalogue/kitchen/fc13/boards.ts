import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { block, by, piece } from '../../living/fc06/kit';
import { kitchenItem } from './kit';

const LARGE = { w: 0.42, t: 0.024, d: 0.3 } as const;
const MEDIUM = { w: 0.38, t: 0.02, d: 0.27 } as const;
const DISC = { radius: 0.115, t: 0.018, handleX: 0.17, handleW: 0.14, handleD: 0.055 } as const;

function largeBoard(): ModelSpecPart[] {
  return [
    block('board1', 'body', [LARGE.w, LARGE.t, LARGE.d], {
      at: [0, LARGE.t / 2, 0],
      round: 0.008,
      segments: 3,
      contact: true,
    }),
  ];
}

function mediumBoard(): ModelSpecPart[] {
  const visible = by('boards', 1, -1.5);
  return [
    {
      ...block('board2', 'body', [MEDIUM.w, MEDIUM.t, MEDIUM.d], {
        at: [0.004, LARGE.t + MEDIUM.t / 2, 0.006],
        turn: [0, 7, 0],
        round: 0.008,
        segments: 3,
      }),
      visible,
    },
  ];
}

function paddle(): ModelSpecPart[] {
  const y = LARGE.t + MEDIUM.t + DISC.t / 2;
  const visible = by('boards', 1, -2.5);
  return [
    {
      ...piece(
        'board3',
        'body',
        {
          type: 'cylinder',
          height: DISC.t,
          topRadius: DISC.radius,
          bottomRadius: DISC.radius,
          bevel: 0.006,
          segments: 64,
        },
        { at: [-0.06, y, 0.012], turn: [0, -14, 0] },
      ),
      visible,
    },
    block('paddleHandle', 'body', [DISC.handleW, DISC.t, DISC.handleD], {
      at: [DISC.handleX - 0.02, 0, 0],
      parent: 'board3',
      round: 0.008,
      segments: 3,
    }),
    piece(
      'paddleRing',
      'accent',
      { type: 'torus', radius: 0.014, tube: 0.0035, segments: 24 },
      { at: [DISC.handleX + 0.03, DISC.t / 2, 0], turn: [90, 0, 0], parent: 'board3', minLod: 1 },
    ),
  ];
}

export const CUTTING_BOARDS_MODEL: ModelSpec = kitchenItem({
  id: 'cat.kitchen.cutting-boards',
  title: 'Cutting boards',
  footprint: { width: 0.44, depth: 0.34, height: 0.065 },
  meta: {
    names: {
      display: 'Cutting boards',
      synonyms: [
        'chopping board',
        'chopping boards',
        'cutting board',
        'board set',
        'serving board',
      ],
    },
    sizeClass: 'small',
    aliases: ['cat.kitchen.cutting-board', 'cat.kitchen.chopping-board'],
  },
  params: { boards: { min: 1, max: 3, default: 3, unit: 'count' } },
  materials: {
    body: { finish: 'oak' },
    accent: { finish: 'brushed-aluminium' },
  },
  defaultFinish: 'oak',
  slots: { body: ['body'] },
  pitch: 35,
  parts: [...largeBoard(), ...mediumBoard(), ...paddle()],
});
