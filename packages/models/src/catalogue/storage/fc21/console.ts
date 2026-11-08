import type { ModelSpec } from '@smarteverything/domain';
import {
  STORAGE_ACCENT,
  block,
  by,
  corners,
  ferrules,
  legs,
  rod,
  storageItem,
  woodOf,
} from './kit';

const DEPTH = 0.32;
const HEIGHT = 0.8;
const TOP_T = 0.03;
const LEG_H = HEIGHT - TOP_T;
const LEG_CORNERS = corners(by('length', 0.5, -0.06), 0.12, by('length', -0.5, 0.06), -0.12);

export const CONSOLE_TABLE_MODEL: ModelSpec = storageItem({
  id: 'cat.storage.console-table',
  title: 'Console table',
  footprint: { width: 1.2, depth: DEPTH, height: HEIGHT },
  size: { width: { param: 'length', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Console table',
      synonyms: ['hall table', 'entryway table', 'sofa table', 'narrow table', 'hallway console'],
    },
    sizeClass: 'medium',
    aliases: ['cat.storage.hall-table'],
  },
  params: { length: { min: 0.9, max: 1.6, default: 1.2, unit: 'm' } },
  materials: { body: woodOf('oak'), accent: STORAGE_ACCENT },
  slots: ['body'],
  wall: true,
  parts: [
    block('top', 'body', [by('length', 1), TOP_T, DEPTH], {
      at: [0, HEIGHT - TOP_T / 2, 0],
      round: 0.01,
      segments: 3,
    }),
    block('apron', 'body', [by('length', 1, -0.14), 0.07, 0.02], {
      at: [0, LEG_H - 0.035, 0.12],
      round: 0.006,
      segments: 3,
      minLod: 1,
    }),
    block('drawer', 'body', [by('length', 1, -0.2), 0.1, 0.018], {
      at: [0, LEG_H - 0.09, 0.14],
      round: 0.006,
      segments: 3,
      minLod: 1,
    }),
    rod(
      'pull',
      'accent',
      { height: 0.08, top: 0.007, segments: 12 },
      { at: [0, LEG_H - 0.09, 0.158], turn: [0, 0, 90], minLod: 2 },
    ),
    block('shelf', 'body', [by('length', 1, -0.14), 0.02, DEPTH - 0.06], {
      at: [0, 0.18, 0],
      round: 0.006,
      segments: 3,
      minLod: 1,
    }),
    ...legs('body', LEG_CORNERS, { height: LEG_H, top: 0.019, bottom: 0.013 }),
    ...ferrules(LEG_CORNERS, 0.014),
  ],
});
