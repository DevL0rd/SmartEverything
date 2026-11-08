import type { ModelSpec } from '@smarteverything/domain';
import {
  STORAGE_ACCENT,
  block,
  by,
  corners,
  fabric,
  ferrules,
  legs,
  piece,
  storageItem,
  woodOf,
} from './kit';

const DEPTH = 0.38;
const SEAT_Y = 0.4;
const SEAT_T = 0.04;
const LEG_H = SEAT_Y - SEAT_T / 2;
const LEG_CORNERS = corners(by('length', 0.5, -0.07), 0.12, by('length', -0.5, 0.07), -0.12);

export const HALLWAY_BENCH_MODEL: ModelSpec = storageItem({
  id: 'cat.storage.hallway-bench',
  title: 'Hallway bench',
  footprint: { width: 1.1, depth: DEPTH, height: 0.47 },
  size: { width: { param: 'length', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Hallway bench',
      synonyms: ['entryway bench', 'hall bench', 'shoe bench', 'mudroom bench', 'bench seat'],
    },
    sizeClass: 'medium',
    aliases: ['cat.storage.entryway-bench'],
  },
  params: { length: { min: 0.8, max: 1.6, default: 1.1, unit: 'm' } },
  materials: { body: woodOf('oak'), cushion: fabric('#CBBDA5'), accent: STORAGE_ACCENT },
  slots: ['body'],
  parts: [
    block('seat', 'body', [by('length', 1), SEAT_T, DEPTH], {
      at: [0, SEAT_Y, 0],
      round: 0.012,
      segments: 3,
    }),
    block('cushion', 'cushion', [by('length', 1, -0.04), 0.055, DEPTH - 0.04], {
      at: [0, SEAT_Y + SEAT_T / 2 + 0.0275, 0],
      round: 0.02,
      segments: 3,
    }),
    ...legs('body', LEG_CORNERS, { height: LEG_H, top: 0.022, bottom: 0.015 }),
    piece(
      'shelf',
      'body',
      {
        type: 'slats',
        count: 4,
        spacing: 0.075,
        width: by('length', 1, -0.19),
        height: 0.05,
        depth: 0.016,
      },
      { at: [0, 0.14, 0], turn: [90, 0, 0] },
    ),
    ...ferrules(LEG_CORNERS, 0.016),
  ],
});
