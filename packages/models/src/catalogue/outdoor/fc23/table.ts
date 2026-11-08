import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { OUTDOOR_FRAME, block, by, corners, legs, outdoorItem, piece } from './kit';

const DEPTH = 0.8;
const HEIGHT = 0.74;
const TOP_T = 0.03;
const LEG_H = HEIGHT - TOP_T;
const LEG_CORNERS = corners(by('length', 0.5, -0.08), 0.3, by('length', -0.5, 0.08), -0.3);

function aprons(): ModelSpecPart[] {
  return [
    ...[-1, 1].map((side) =>
      block(side < 0 ? 'apronBack' : 'apronFront', 'frame', [by('length', 1, -0.16), 0.07, 0.025], {
        at: [0, LEG_H - 0.035, side * 0.3],
        round: 0.008,
        segments: 3,
        minLod: 1,
      }),
    ),
    ...[-1, 1].map((side) =>
      block(side < 0 ? 'apronLeft' : 'apronRight', 'frame', [0.025, 0.07, 0.56], {
        at: [by('length', side * 0.5, -side * 0.08), LEG_H - 0.035, 0],
        round: 0.008,
        segments: 3,
        minLod: 1,
      }),
    ),
  ];
}

export const PATIO_TABLE_MODEL: ModelSpec = outdoorItem({
  id: 'cat.outdoor.patio-table',
  title: 'Patio table',
  footprint: { width: 1.6, depth: DEPTH, height: HEIGHT },
  size: { width: { param: 'length', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Patio table',
      synonyms: [
        'garden table',
        'outdoor dining table',
        'terrace table',
        'deck table',
        'slatted table',
      ],
    },
    sizeClass: 'large',
    aliases: ['cat.outdoor.garden-table', 'cat.outdoor.outdoor-table'],
  },
  params: { length: { min: 1.2, max: 2.4, default: 1.6, unit: 'm' } },
  materials: { frame: OUTDOOR_FRAME },
  slots: { frame: ['frame'] },
  parts: [
    piece(
      'top',
      'frame',
      {
        type: 'slats',
        count: 8,
        spacing: 0.1,
        width: by('length', 1),
        height: 0.088,
        depth: TOP_T,
      },
      { at: [0, HEIGHT - TOP_T / 2, 0], turn: [90, 0, 0] },
    ),
    ...legs('frame', LEG_CORNERS, { height: LEG_H, top: 0.034, bottom: 0.027 }),
    ...aprons(),
  ],
});
