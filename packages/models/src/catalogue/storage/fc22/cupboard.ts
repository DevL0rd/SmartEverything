import type { ModelSpec } from '@smarteverything/domain';
import {
  STORAGE_ACCENT,
  STORAGE_METAL,
  block,
  by,
  piece,
  rod,
  storageItem,
  woodOf,
} from '../fc21/kit';

const DEPTH = 0.4;
const HEIGHT = 1.9;
const PLINTH = 0.08;
const DOOR_T = 0.02;

export const BROOM_CUPBOARD_MODEL: ModelSpec = storageItem({
  id: 'cat.storage.broom-cupboard',
  title: 'Broom cupboard',
  footprint: { width: 0.6, depth: DEPTH + DOOR_T, height: HEIGHT },
  size: { width: { param: 'width', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Broom cupboard',
      synonyms: [
        'utility cupboard',
        'cleaning cupboard',
        'broom closet',
        'tall cupboard',
        'mop cabinet',
      ],
    },
    sizeClass: 'large',
    aliases: ['cat.storage.broom-closet', 'cat.storage.utility-cupboard'],
  },
  params: { width: { min: 0.45, max: 0.9, default: 0.6, unit: 'm' } },
  materials: { body: woodOf('oak'), plinth: STORAGE_METAL, accent: STORAGE_ACCENT },
  slots: ['body'],
  pitch: 12,
  wall: true,
  parts: [
    block('carcass', 'body', [by('width', 1), HEIGHT - PLINTH, DEPTH], {
      at: [0, PLINTH + (HEIGHT - PLINTH) / 2, 0],
      round: 0.012,
      segments: 3,
    }),
    block('plinth', 'plinth', [by('width', 1, -0.04), PLINTH, DEPTH - 0.04], {
      at: [0, PLINTH / 2, -0.005],
      round: 0.008,
      segments: 3,
      contact: true,
    }),
    block('door', 'body', [by('width', 1, -0.016), HEIGHT - PLINTH - 0.03, DOOR_T], {
      at: [0, PLINTH + (HEIGHT - PLINTH) / 2, DEPTH / 2 + DOOR_T / 2],
      round: 0.006,
      segments: 3,
      minLod: 1,
    }),
    piece(
      'louvres',
      'plinth',
      {
        type: 'slats',
        count: 5,
        spacing: 0.032,
        width: by('width', 1, -0.2),
        height: 0.012,
        depth: 0.008,
      },
      { at: [0, HEIGHT - 0.24, DEPTH / 2 + DOOR_T + 0.003], minLod: 1 },
    ),
    rod(
      'pull',
      'accent',
      { height: 0.22, top: 0.01, segments: 16 },
      { at: [by('width', 0.5, -0.06), 1.0, DEPTH / 2 + DOOR_T + 0.025], minLod: 1 },
    ),
    ...[1.5, 0.5].map((y, index) =>
      block(`hinge${String(index + 1)}`, 'accent', [0.012, 0.09, 0.008], {
        at: [by('width', -0.5, 0.006), y, DEPTH / 2 + DOOR_T + 0.002],
        round: 0.003,
        segments: 3,
        minLod: 2,
      }),
    ),
  ],
});
