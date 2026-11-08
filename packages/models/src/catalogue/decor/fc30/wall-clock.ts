import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { BRASS, block, by, cyl, decorItem, finishesOf, hoop } from './kit';

const FRONT = 0.015;

function mark(index: number): ModelSpecPart {
  const angle = index * 30;
  const major = index % 3 === 0;
  const rad = (angle * Math.PI) / 180;
  return block(
    `mark${String(index)}`,
    'hands',
    [major ? 0.008 : 0.004, by('diameter', major ? 0.06 : 0.035), 0.003],
    {
      at: [
        by('diameter', 0.4 * Math.sin(rad)),
        by('diameter', 0.5 + 0.4 * Math.cos(rad)),
        FRONT + 0.0035,
      ],
      turn: [0, 0, -angle],
      round: 0.0012,
      segments: 3,
      minLod: major ? 1 : 2,
    },
  );
}

function hand(
  id: string,
  material: string,
  shape: {
    readonly angle: number;
    readonly length: number;
    readonly width: number;
    readonly z: number;
  },
): ModelSpecPart {
  const rad = (shape.angle * Math.PI) / 180;
  return block(id, material, [shape.width, by('diameter', shape.length), 0.003], {
    at: [
      by('diameter', (shape.length / 2) * Math.sin(rad)),
      by('diameter', 0.5 + (shape.length / 2) * Math.cos(rad)),
      shape.z,
    ],
    turn: [0, 0, -shape.angle],
    round: 0.0012,
    segments: 3,
  });
}

export const WALL_CLOCK_MODEL: ModelSpec = decorItem({
  id: 'cat.decor.wall-clock',
  title: 'Wall clock',
  footprint: { width: 0.35, depth: 0.035, height: 0.35 },
  size: {
    width: { param: 'diameter', extra: 0, resizes: true },
    height: { param: 'diameter', extra: 0, resizes: false },
  },
  meta: {
    names: {
      display: 'Wall clock',
      synonyms: ['clock', 'round clock', 'analogue clock', 'hanging clock', 'wall timepiece'],
    },
    sizeClass: 'medium',
  },
  params: { diameter: { min: 0.25, max: 0.7, default: 0.35, unit: 'm' } },
  materials: {
    case: { finish: 'satin-black' },
    face: { finish: 'warm-white' },
    hands: { finish: 'graphite' },
    accent: { color: '#C4503A', roughness: 0.5 },
  },
  finish: finishesOf(
    {
      black: {},
      walnut: { case: { finish: 'walnut' }, hands: { finish: 'satin-black' } },
      oak: { case: { finish: 'oak' }, hands: { finish: 'satin-black' } },
      brass: { case: BRASS, face: { finish: 'satin-black' }, hands: { finish: 'warm-white' } },
    },
    'black',
  ),
  mount: 'wall',
  parts: [
    cyl(
      'case',
      'case',
      { height: 0.03, top: by('diameter', 0.5), bevel: 0.008, segments: 64 },
      { at: [0, by('diameter', 0.5), 0], turn: [90, 0, 0], contact: true },
    ),
    hoop(
      'bezel',
      'case',
      { radius: by('diameter', 0.5, -0.01), tube: 0.01, segments: 64 },
      { at: [0, by('diameter', 0.5), 0.01] },
    ),
    cyl(
      'face',
      'face',
      { height: 0.003, top: by('diameter', 0.5, -0.018), bevel: 0.001, segments: 64 },
      { at: [0, by('diameter', 0.5), 0.0155], turn: [90, 0, 0] },
    ),
    ...Array.from({ length: 12 }, (_, index) => mark(index)),
    hand('hourHand', 'hands', { angle: 305, length: 0.2, width: 0.012, z: FRONT + 0.0035 }),
    hand('minuteHand', 'hands', { angle: 60, length: 0.3, width: 0.008, z: FRONT + 0.0055 }),
    hand('secondHand', 'accent', { angle: 180, length: 0.32, width: 0.003, z: FRONT + 0.0075 }),
    cyl(
      'hub',
      'accent',
      { height: 0.006, top: 0.009, bevel: 0.002, segments: 32 },
      { at: [0, by('diameter', 0.5), FRONT + 0.009], turn: [90, 0, 0] },
    ),
  ],
});
