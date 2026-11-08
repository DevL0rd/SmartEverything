import type { ModelSpec } from '@smarteverything/domain';
import { SIZE_PARAM, blob, decorItem, finishesOf, sized, turned, wire } from './kit';

const PROFILE = [
  [0, 0],
  [0.05, 0],
  [0.075, 0.018],
  [0.09, 0.08],
  [0.086, 0.15],
  [0.062, 0.222],
  [0.04, 0.262],
  [0.037, 0.292],
  [0.044, 0.3],
  [0.038, 0.303],
  [0.031, 0.296],
  [0.03, 0.24],
  [0, 0.24],
] as const;

const NECK = 0.27;

const STEMS = [
  {
    id: 'a',
    points: [
      [0, 0, 0],
      [0.012, 0.12, 0.006],
      [0.04, 0.25, 0.012],
    ],
    bloom: [0.04, 0.275, 0.012],
  },
  {
    id: 'b',
    points: [
      [0, 0, 0],
      [-0.02, 0.1, -0.006],
      [-0.065, 0.2, -0.012],
    ],
    bloom: [-0.065, 0.222, -0.012],
  },
  {
    id: 'c',
    points: [
      [0, 0, 0],
      [0.002, 0.16, 0.012],
      [-0.012, 0.3, 0.022],
    ],
    bloom: [-0.012, 0.328, 0.022],
  },
] as const;

export const VASE_MODEL: ModelSpec = decorItem({
  id: 'cat.decor.vase',
  title: 'Vase',
  footprint: { width: 0.22, depth: 0.2, height: 0.62 },
  meta: {
    names: {
      display: 'Vase',
      synonyms: ['flower vase', 'ceramic vase', 'pampas vase', 'table vase', 'decor vase'],
    },
    sizeClass: 'small',
  },
  params: { size: SIZE_PARAM },
  materials: {
    vase: { finish: 'ceramic' },
    stem: { color: '#8C7A55', roughness: 0.9 },
    accent: { color: '#D9C9A3', roughness: 0.95, pattern: 'knit' },
  },
  finish: finishesOf(
    {
      white: {},
      terracotta: { vase: { finish: 'terracotta' } },
      ink: { vase: { finish: 'satin-black' } },
      sage: { vase: { color: '#8FA48A', roughness: 0.25 } },
    },
    'white',
  ),
  mount: 'desk',
  parts: sized('size', [
    turned('body', 'vase', PROFILE, { contact: true, segments: 72 }),
    ...STEMS.flatMap((stem) => [
      wire(`stem${stem.id}`, 'stem', { points: stem.points, radius: 0.003 }, { at: [0, NECK, 0] }),
      blob(`bloom${stem.id}`, 'accent', [0.02, 0.045, 0.02], {
        at: [stem.bloom[0], NECK + stem.bloom[1], stem.bloom[2]],
        segments: 24,
      }),
    ]),
  ]),
});
