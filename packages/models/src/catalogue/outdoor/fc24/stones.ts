import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { by, outdoorSpec, rod } from '../fc23/kit';

const MAX = 9;
const PITCH = 0.55;
const THICK = 0.06;

export const STONE_FINISH_NAMES = ['slate', 'sandstone', 'granite', 'limestone'] as const;

const STONE_COLOURS = {
  slate: '#5C6168',
  sandstone: '#C9A37A',
  granite: '#8D8F92',
  limestone: '#D6D0C0',
} as const;

const STONES: readonly (readonly [number, number, number, number])[] = [
  [0.21, 0.04, 12, 0.19],
  [0.19, -0.05, 40, 0.22],
  [0.22, 0.03, 75, 0.18],
  [0.2, -0.04, 20, 0.21],
  [0.23, 0.05, 55, 0.19],
  [0.19, -0.03, 8, 0.22],
  [0.21, 0.04, 62, 0.2],
  [0.22, -0.05, 30, 0.18],
  [0.2, 0.03, 85, 0.21],
];

function stone(index: number): ModelSpecPart[] {
  const [radius = 0.2, dx = 0, turn = 0, depth = 0.2] = STONES[index] ?? [];
  const z = (index - 4) * PITCH;
  const name = String(index + 1);
  const visible = by('count', 1, -index);
  return [
    {
      ...rod(
        `stone${name}`,
        'stone',
        { height: THICK, top: radius, segments: 32 },
        {
          at: [dx, THICK / 2, z],
          turn: [0, turn, 0],
          scale: [1, 1, depth / radius],
          contact: true,
        },
      ),
      visible,
    },
    {
      ...rod(
        `moss${name}`,
        'moss',
        { height: 0.008, top: radius * 0.3, segments: 16 },
        { at: [dx + radius * 0.4, THICK + 0.002, z - depth * 0.25], minLod: 1 },
      ),
      visible,
    },
  ];
}

export const PATH_STONES_MODEL: ModelSpec = outdoorSpec({
  id: 'cat.outdoor.path-stones',
  title: 'Path stones',
  footprint: { width: 0.56, depth: 2.9, height: THICK + 0.01 },
  meta: {
    names: {
      display: 'Path stones',
      synonyms: ['stepping stones', 'garden path', 'paving stones', 'flagstones', 'stone path'],
    },
    sizeClass: 'medium',
    aliases: ['cat.outdoor.stepping-stones', 'cat.outdoor.garden-path'],
  },
  params: { count: { min: 3, max: MAX, default: 5, unit: 'count' } },
  materials: {
    stone: { color: STONE_COLOURS.slate, roughness: 0.85 },
    moss: { color: '#55743F', roughness: 0.95 },
  },
  finishes: Object.fromEntries(
    STONE_FINISH_NAMES.map((name) => [
      name,
      { stone: { color: STONE_COLOURS[name], roughness: 0.85 } },
    ]),
  ),
  defaultFinish: 'slate',
  pitch: 40,
  parts: Array.from({ length: MAX }, (_, index) => stone(index)).flat(),
});
