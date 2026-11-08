import type { ModelSpec } from '@smarteverything/domain';
import { OUTDOOR_FRAME, OUTDOOR_METAL, block, by, outdoorItem, piece } from '../fc23/kit';

const BOARDS = 18;
const POST = 0.09;
const DEPTH = 0.1;

export const FENCE_PANEL_MODEL: ModelSpec = outdoorItem({
  id: 'cat.outdoor.fence-panel',
  title: 'Fence panel',
  footprint: { width: 2, depth: DEPTH, height: 1.88 },
  size: {
    width: { param: 'length', extra: 0.2, resizes: true },
    height: { param: 'height', extra: 0.08, resizes: true },
  },
  meta: {
    names: {
      display: 'Fence panel',
      synonyms: [
        'garden fence',
        'privacy fence',
        'timber fence',
        'boundary fence',
        'fence section',
      ],
    },
    sizeClass: 'large',
    aliases: ['cat.outdoor.fence', 'cat.outdoor.fencing'],
  },
  params: {
    length: { min: 1.2, max: 2.4, default: 1.8, unit: 'm' },
    height: { min: 0.9, max: 2, default: 1.8, unit: 'm' },
  },
  materials: { frame: OUTDOOR_FRAME, accent: OUTDOOR_METAL },
  slots: { frame: ['frame'] },
  pitch: 14,
  parts: [
    piece(
      'boards',
      'frame',
      {
        type: 'slats',
        count: BOARDS,
        spacing: by('length', 1 / BOARDS),
        width: by('height', 1, -0.12),
        height: by('length', 1 / BOARDS, -0.012),
        depth: 0.02,
      },
      { at: [0, by('height', 0.5, -0.01), 0.02], turn: [0, 0, 90] },
    ),
    ...[0.25, 0.75].map((fraction, index) =>
      block(`rail${String(index + 1)}`, 'frame', [by('length', 1), 0.07, 0.03], {
        at: [0, by('height', fraction), -0.015],
        round: 0.008,
        segments: 3,
        minLod: 1,
      }),
    ),
    block('cap', 'frame', [by('length', 1), 0.05, 0.07], {
      at: [0, by('height', 1, -0.045), 0.01],
      round: 0.012,
      segments: 3,
    }),
    ...[-1, 1].flatMap((side) => {
      const name = side < 0 ? 'Left' : 'Right';
      const x = by('length', side * 0.5, side * (POST / 2));
      return [
        block(`post${name}`, 'frame', [POST, by('height', 1, 0.05), POST], {
          at: [x, by('height', 0.5, 0.025), 0],
          round: 0.012,
          segments: 3,
          contact: true,
        }),
        block(`postCap${name}`, 'accent', [POST + 0.02, 0.03, POST + 0.02], {
          at: [x, by('height', 1, 0.065), 0],
          round: 0.008,
          segments: 3,
          minLod: 1,
        }),
      ];
    }),
  ],
});
