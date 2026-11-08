import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { block, by, piece, woodFinishes, woodOf } from '../../living/fc06/kit';
import { officeItem } from '../fc19/kit';

const DEPTH = 0.3;
const SIDE = 0.03;
const SHELVES = 4;
const BOOK_DEPTH = 0.2;
const BOOK_H = 0.24;

function books(
  id: string,
  material: 'books' | 'accent',
  level: number,
  group: { readonly count: number; readonly thick: number; readonly from: number },
): ModelSpecPart {
  const spacing = group.thick + 0.004;
  const centre = group.from + ((group.count - 1) * spacing) / 2 + group.thick / 2;
  return piece(
    id,
    material,
    {
      type: 'slats',
      count: group.count,
      spacing,
      width: BOOK_H - (level % 2) * 0.02,
      height: group.thick,
      depth: BOOK_DEPTH,
    },
    {
      at: [by('width', -0.5, centre), by('height', 0.2 * level, 0.0125 + BOOK_H / 2), 0.01],
      turn: [0, 0, 90],
      minLod: 1,
    },
  );
}

function shelfBooks(): ModelSpecPart[] {
  return Array.from({ length: SHELVES }, (_, index) => {
    const level = index + 1;
    return [
      books(`booksSlate${String(level)}`, 'books', level, { count: 5, thick: 0.03, from: 0.05 }),
      books(`booksAccent${String(level)}`, 'accent', level, { count: 3, thick: 0.028, from: 0.25 }),
    ];
  }).flat();
}

export const BOOKCASE_MODEL: ModelSpec = officeItem({
  id: 'cat.office.bookcase',
  title: 'Bookcase',
  footprint: { width: 0.8, depth: DEPTH, height: 1.8 },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    height: { param: 'height', extra: 0, resizes: true },
  },
  meta: {
    names: {
      display: 'Bookcase',
      synonyms: [
        'bookshelf',
        'library shelf',
        'open shelving unit',
        'office shelves',
        'book cabinet',
        'shelving',
      ],
    },
    sizeClass: 'tall',
    aliases: ['cat.office.bookshelf'],
  },
  params: {
    width: { min: 0.7, max: 1.2, default: 0.8, unit: 'm' },
    height: { min: 1.4, max: 2.2, default: 1.8, unit: 'm' },
  },
  materials: {
    body: woodOf('oak'),
    books: { color: '#5E6B73', roughness: 0.8, pattern: 'ribbed' },
    accent: { color: '#B4553A', roughness: 0.8, pattern: 'ribbed' },
  },
  finishes: woodFinishes(['body']),
  defaultFinish: 'oak',
  pitch: 10,
  wall: true,
  parts: [
    ...([-1, 1] as const).map((side) =>
      block(side < 0 ? 'sideLeft' : 'sideRight', 'body', [SIDE, by('height', 1), DEPTH], {
        at: [by('width', side * 0.5, -side * (SIDE / 2)), by('height', 0.5), 0],
        round: 0.01,
        segments: 3,
        contact: true,
      }),
    ),
    block('top', 'body', [by('width', 1), 0.03, DEPTH], {
      at: [0, by('height', 1, -0.015), 0],
      round: 0.01,
      segments: 3,
    }),
    block('kick', 'body', [by('width', 1, -2 * SIDE), 0.08, DEPTH - 0.04], {
      at: [0, 0.04, -0.01],
      round: 0.008,
      segments: 3,
    }),
    block('base', 'body', [by('width', 1, -2 * SIDE), 0.025, DEPTH - 0.02], {
      at: [0, 0.0925, -0.01],
      round: 0.008,
      segments: 3,
    }),
    block('back', 'body', [by('width', 1, -2 * SIDE), by('height', 1, -0.11), 0.012], {
      at: [0, by('height', 0.5, 0.0), -DEPTH / 2 + 0.006],
      round: 0.004,
      segments: 3,
    }),
    piece(
      'shelves',
      'body',
      {
        type: 'slats',
        count: SHELVES,
        spacing: by('height', 0.2),
        width: by('width', 1, -2 * SIDE),
        height: 0.025,
        depth: DEPTH - 0.03,
      },
      { at: [0, by('height', 0.5), -0.005] },
    ),
    ...shelfBooks(),
  ],
});
