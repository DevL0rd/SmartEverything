import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { ball, block, by, decorItem, fabric, finishesOf } from '../fc30/kit';

interface Pillow {
  readonly name: string;
  readonly cover: 'coverA' | 'coverB';
  readonly size: readonly [number, number, number];
  readonly at: readonly [number, number, number];
  readonly turn: readonly [number, number, number];
}

const PILLOWS: readonly Pillow[] = [
  {
    name: 'Back',
    cover: 'coverA',
    size: [0.45, 0.45, 0.14],
    at: [-0.22, 0.236, -0.05],
    turn: [-12, 6, 3],
  },
  {
    name: 'Lumbar',
    cover: 'coverB',
    size: [0.5, 0.3, 0.12],
    at: [0.02, 0.158, 0.1],
    turn: [-8, -4, -2],
  },
  {
    name: 'Corner',
    cover: 'coverA',
    size: [0.38, 0.38, 0.12],
    at: [0.24, 0.27, -0.03],
    turn: [-10, -10, 40],
  },
];

function pillow(shape: Pillow, index: number): ModelSpecPart[] {
  const id = `pillow${shape.name}`;
  return [
    {
      ...block(id, shape.cover, shape.size, {
        at: shape.at,
        turn: shape.turn,
        round: 0.055,
        segments: 5,
        contact: true,
      }),
      visible: by('pillows', 1, -index),
    },
    ball(`button${shape.name}`, 'accent', 0.012, {
      at: [0, 0, shape.size[2] / 2 + 0.004],
      parent: id,
      segments: 16,
      minLod: 1,
    }),
  ];
}

export const THROW_PILLOWS_MODEL: ModelSpec = decorItem({
  id: 'cat.decor.throw-pillows',
  title: 'Throw pillows',
  footprint: { width: 0.95, depth: 0.3, height: 0.47 },
  meta: {
    names: {
      display: 'Throw pillows',
      synonyms: [
        'cushions',
        'scatter cushions',
        'sofa pillows',
        'decorative pillows',
        'accent pillows',
      ],
    },
    sizeClass: 'small',
  },
  params: { pillows: { min: 1, max: 3, default: 3, unit: 'count' } },
  materials: {
    coverA: fabric('#CBBDA5'),
    coverB: fabric('#7F9479'),
    accent: { color: '#B89A5A', roughness: 0.4 },
  },
  finish: finishesOf(
    {
      'oat-sage': {},
      'slate-rust': { coverA: fabric('#69717C'), coverB: fabric('#A2553B') },
      'ink-blush': { coverA: fabric('#2B3242'), coverB: fabric('#C99A94') },
      'forest-oat': { coverA: fabric('#3E5A49'), coverB: fabric('#CBBDA5') },
    },
    'oat-sage',
  ),
  mount: 'floor',
  parts: PILLOWS.flatMap((entry, index) => pillow(entry, index)),
});
