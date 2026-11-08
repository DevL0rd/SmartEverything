import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { STORAGE_ACCENT, STORAGE_METAL, block, by, piece, rod, storageItem, woodOf } from './kit';

const DEPTH = 0.32;
const POST = 0.032;
const SHELF_T = 0.03;
const FIRST = 0.1;
const TIERS = 5;
const LOSS = FIRST + SHELF_T / 2;

function posts(): ModelSpecPart[] {
  return [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ].flatMap(([sx = 1, sz = 1], index) => {
    const x = by('width', sx * 0.5, -sx * (POST / 2));
    const z = sz * (DEPTH / 2 - POST / 2);
    const name = String(index + 1);
    return [
      block(`post${name}`, 'frame', [POST, by('height', 1), POST], {
        at: [x, by('height', 0.5), z],
        round: 0.008,
        segments: 3,
        contact: true,
      }),
      rod(
        `foot${name}`,
        'accent',
        { height: 0.014, top: POST * 0.7, segments: 16 },
        { at: [x, 0.007, z], minLod: 2 },
      ),
    ];
  });
}

function rails(): ModelSpecPart[] {
  return [0.26, 0.74].map((fraction, index) =>
    block(`rail${String(index + 1)}`, 'frame', [by('width', 1, -2 * POST), 0.04, 0.012], {
      at: [0, by('height', fraction), -(DEPTH / 2 - 0.02)],
      round: 0.004,
      segments: 3,
      minLod: 1,
    }),
  );
}

export const SHELVING_UNIT_MODEL: ModelSpec = storageItem({
  id: 'cat.storage.shelving-unit',
  title: 'Shelving unit',
  footprint: { width: 0.9128, depth: DEPTH, height: 1.8 },
  size: {
    width: { param: 'width', extra: 0.0128, resizes: true },
    height: { param: 'height', extra: 0, resizes: true },
  },
  meta: {
    names: {
      display: 'Shelving unit',
      synonyms: ['shelf unit', 'open shelves', 'storage rack', 'bookcase', 'garage shelving'],
    },
    sizeClass: 'large',
    aliases: ['cat.storage.shelves', 'cat.storage.shelf-unit'],
  },
  params: {
    width: { min: 0.6, max: 1.4, default: 0.9, unit: 'm' },
    height: { min: 1, max: 2.2, default: 1.8, unit: 'm' },
  },
  materials: { shelf: woodOf('oak'), frame: STORAGE_METAL, accent: STORAGE_ACCENT },
  slots: ['shelf'],
  pitch: 12,
  wall: true,
  parts: [
    piece(
      'shelves',
      'shelf',
      {
        type: 'slats',
        count: TIERS,
        spacing: by('height', 1 / (TIERS - 1), -LOSS / (TIERS - 1)),
        width: by('width', 1),
        height: SHELF_T,
        depth: DEPTH,
      },
      { at: [0, by('height', 0.5, FIRST - LOSS / 2), 0] },
    ),
    ...posts(),
    ...rails(),
  ],
});
