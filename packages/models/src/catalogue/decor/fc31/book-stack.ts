import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { PAPER, block, by, decorItem, finishesOf } from '../fc30/kit';

interface Book {
  readonly width: number;
  readonly thick: number;
  readonly depth: number;
  readonly yaw: number;
  readonly cover: 'coverA' | 'coverB';
}

const BOOKS: readonly Book[] = [
  { width: 0.26, thick: 0.038, depth: 0.19, yaw: 0, cover: 'coverA' },
  { width: 0.235, thick: 0.05, depth: 0.17, yaw: 7, cover: 'coverB' },
  { width: 0.22, thick: 0.03, depth: 0.16, yaw: -5, cover: 'coverA' },
  { width: 0.2, thick: 0.044, depth: 0.145, yaw: 4, cover: 'coverB' },
  { width: 0.18, thick: 0.028, depth: 0.13, yaw: -8, cover: 'coverA' },
  { width: 0.16, thick: 0.04, depth: 0.12, yaw: 3, cover: 'coverB' },
];

function book(shape: Book, index: number): ModelSpecPart[] {
  const below = BOOKS.slice(0, index).reduce((sum, entry) => sum + entry.thick, 0);
  const visible = by('books', 1, -index);
  const name = String(index + 1);
  const at = [0, below + shape.thick / 2, 0] as const;
  return [
    {
      ...block(`cover${name}`, shape.cover, [shape.width, shape.thick, shape.depth], {
        at,
        turn: [0, shape.yaw, 0],
        round: 0.004,
        segments: 3,
        contact: index === 0,
      }),
      visible,
    },
    {
      ...block(
        `pages${name}`,
        'pages',
        [shape.width - 0.012, shape.thick - 0.01, shape.depth + 0.004],
        { at, turn: [0, shape.yaw, 0], round: 0.002, segments: 3, minLod: 1 },
      ),
      visible,
    },
    ...(index % 2 === 0
      ? [
          {
            ...block(`ribbon${name}`, 'accent', [0.006, 0.002, 0.05], {
              at: [0, below + shape.thick + 0.001, shape.depth / 2 - 0.02],
              turn: [0, shape.yaw, 0],
              round: 0.0008,
              segments: 3,
              minLod: 2,
            }),
            visible,
          },
        ]
      : []),
  ];
}

export const BOOK_STACK_MODEL: ModelSpec = decorItem({
  id: 'cat.decor.book-stack',
  title: 'Book stack',
  footprint: { width: 0.26, depth: 0.19, height: 0.162 },
  meta: {
    names: {
      display: 'Book stack',
      synonyms: ['books', 'stack of books', 'coffee table books', 'pile of books', 'decor books'],
    },
    sizeClass: 'small',
  },
  params: { books: { min: 2, max: 6, default: 4, unit: 'count' } },
  materials: {
    coverA: { color: '#2F4A5C', roughness: 0.7 },
    coverB: { color: '#B5654A', roughness: 0.7 },
    pages: PAPER,
    accent: { color: '#C9A25A', roughness: 0.5 },
  },
  finish: finishesOf(
    {
      classic: {},
      sage: { coverA: { color: '#7F9479' }, coverB: { color: '#D9CDB2' } },
      ink: { coverA: { color: '#25272B' }, coverB: { color: '#6C5A48' } },
      blush: { coverA: { color: '#C99A94' }, coverB: { color: '#4C5A66' } },
    },
    'classic',
  ),
  mount: 'desk',
  parts: BOOKS.flatMap((entry, index) => book(entry, index)),
});
