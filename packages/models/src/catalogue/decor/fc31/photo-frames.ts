import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { PAPER, block, by, decorItem, woodAndBlack } from '../fc30/kit';

interface Frame {
  readonly name: string;
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly height: number;
}

const FRAMES: readonly Frame[] = [
  { name: 'A', x: -0.12, z: 0, width: 0.15, height: 0.2 },
  { name: 'B', x: 0.06, z: 0.045, width: 0.2, height: 0.15 },
  { name: 'C', x: 0.22, z: -0.01, width: 0.11, height: 0.14 },
];

const LEAN = -9;
const DEPTH = 0.02;

function frame(shape: Frame, index: number): ModelSpecPart[] {
  const rad = (Math.abs(LEAN) * Math.PI) / 180;
  const id = `frame${shape.name}`;
  const small = { round: 0.001, segments: 3 } as const;
  return [
    {
      ...block(id, 'frame', [shape.width, shape.height, DEPTH], {
        at: [shape.x, (shape.height / 2) * Math.cos(rad) + (DEPTH / 2) * Math.sin(rad), shape.z],
        turn: [LEAN, 0, 0],
        round: 0.004,
        segments: 3,
        contact: true,
      }),
      visible: by('frames', 1, -index),
    },
    block(`mat${shape.name}`, 'mat', [shape.width - 0.03, shape.height - 0.03, 0.002], {
      at: [0, 0, DEPTH / 2 + 0.0005],
      parent: id,
      ...small,
    }),
    block(`photo${shape.name}`, 'photo', [shape.width - 0.07, shape.height - 0.07, 0.0015], {
      at: [0, 0, DEPTH / 2 + 0.0017],
      parent: id,
      ...small,
    }),
    block(
      `hill${shape.name}`,
      'accent',
      [shape.width - 0.07, (shape.height - 0.07) * 0.4, 0.0015],
      {
        at: [0, -(shape.height - 0.07) * 0.3, DEPTH / 2 + 0.0027],
        parent: id,
        ...small,
      },
    ),
    block(`strut${shape.name}`, 'frame', [0.02, shape.height * 0.6, 0.008], {
      at: [0, -shape.height * 0.12, -DEPTH / 2 - 0.004],
      parent: id,
      round: 0.002,
      segments: 3,
      minLod: 1,
    }),
  ];
}

export const PHOTO_FRAMES_MODEL: ModelSpec = decorItem({
  id: 'cat.decor.photo-frames',
  title: 'Photo frames',
  footprint: { width: 0.5, depth: 0.1, height: 0.2 },
  meta: {
    names: {
      display: 'Photo frames',
      synonyms: [
        'picture frames',
        'photo frame set',
        'standing frames',
        'tabletop frames',
        'frames',
      ],
    },
    sizeClass: 'small',
  },
  params: { frames: { min: 1, max: 3, default: 3, unit: 'count' } },
  materials: {
    frame: { finish: 'oak' },
    mat: PAPER,
    photo: { color: '#9DB4C0', roughness: 0.4 },
    accent: { color: '#6F8A6A', roughness: 0.6 },
  },
  finish: woodAndBlack('frame'),
  mount: 'desk',
  parts: FRAMES.flatMap((entry, index) => frame(entry, index)),
});
