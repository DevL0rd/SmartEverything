import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import {
  STORAGE_ACCENT,
  STORAGE_METAL,
  block,
  by,
  fabric,
  piece,
  rod,
  storageItem,
  woodOf,
} from '../fc21/kit';

const DEPTH = 0.4;
const HEIGHT = 1.75;
const POST = 0.03;
const SHELF_BOTTOM = 0.18;
const SHELF_PITCH = 0.76;

function posts(): ModelSpecPart[] {
  return [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ].map(([sx = 1, sz = 1], index) =>
    block(`post${String(index + 1)}`, 'frame', [POST, HEIGHT, POST], {
      at: [by('width', sx * 0.5, -sx * (POST / 2)), HEIGHT / 2, sz * (DEPTH / 2 - POST / 2)],
      round: 0.008,
      segments: 3,
      contact: true,
    }),
  );
}

function baskets(): ModelSpecPart[] {
  return [-1, 1].map((side) =>
    block(
      side < 0 ? 'basketLeft' : 'basketRight',
      'cloth',
      [by('width', 0.5, -0.1), 0.26, DEPTH - 0.06],
      {
        at: [by('width', side * 0.25), SHELF_BOTTOM + 0.015 + 0.13, 0],
        round: 0.05,
        segments: 3,
        minLod: 1,
      },
    ),
  );
}

function towels(): ModelSpecPart[] {
  const y = SHELF_BOTTOM + SHELF_PITCH + 0.015;
  return [0, 1, 2].map((index) =>
    block(`towel${String(index + 1)}`, 'cloth', [0.32, 0.055, 0.26], {
      at: [by('width', -0.25), y + 0.0275 + index * 0.057, 0.01 * (index % 2)],
      round: 0.02,
      segments: 3,
      minLod: 1,
    }),
  );
}

export const LAUNDRY_SHELVES_MODEL: ModelSpec = storageItem({
  id: 'cat.storage.laundry-shelves',
  title: 'Laundry shelves',
  footprint: { width: 1, depth: DEPTH, height: HEIGHT },
  size: { width: { param: 'width', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Laundry shelves',
      synonyms: ['laundry rack', 'utility shelves', 'laundry room shelving', 'linen shelves'],
    },
    sizeClass: 'large',
    aliases: ['cat.storage.laundry-rack'],
  },
  params: { width: { min: 0.7, max: 1.5, default: 1, unit: 'm' } },
  materials: {
    shelf: woodOf('oak'),
    frame: STORAGE_METAL,
    cloth: fabric('#8FA3AD'),
    accent: STORAGE_ACCENT,
  },
  slots: ['shelf'],
  pitch: 12,
  wall: true,
  parts: [
    piece(
      'shelves',
      'shelf',
      {
        type: 'slats',
        count: 3,
        spacing: SHELF_PITCH,
        width: by('width', 1),
        height: 0.03,
        depth: DEPTH,
      },
      { at: [0, SHELF_BOTTOM + SHELF_PITCH, 0] },
    ),
    ...posts(),
    rod(
      'rail',
      'accent',
      { height: by('width', 1, -0.06), top: 0.012, segments: 16 },
      { at: [0, 1.5, 0], turn: [0, 0, 90], minLod: 1 },
    ),
    block('shirt', 'cloth', [0.4, 0.55, 0.03], {
      at: [by('width', 0.2), 1.22, 0],
      round: 0.012,
      segments: 3,
      minLod: 1,
    }),
    ...baskets(),
    ...towels(),
  ],
});
