import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { BRASS, SIZE_PARAM, blob, cyl, decorItem, finishesOf, sized } from './kit';

const TRAY = 0.016;

const CANDLES = [
  { id: 'tall', x: 0, z: -0.04, radius: 0.032, height: 0.22 },
  { id: 'mid', x: 0.065, z: 0.03, radius: 0.04, height: 0.14 },
  { id: 'low', x: -0.07, z: 0.055, radius: 0.03, height: 0.09 },
] as const;

function candle(shape: (typeof CANDLES)[number]): ModelSpecPart[] {
  return [
    cyl(
      `candle${shape.id}`,
      'wax',
      { height: shape.height, top: shape.radius, bevel: 0.004, segments: 40 },
      { at: [shape.x, TRAY + shape.height / 2, shape.z], contact: true },
    ),
    blob(`flame${shape.id}`, 'accent', [0.007, 0.016, 0.007], {
      at: [shape.x, TRAY + shape.height + 0.014, shape.z],
      segments: 16,
      minLod: 1,
    }),
  ];
}

export const CANDLE_SET_MODEL: ModelSpec = decorItem({
  id: 'cat.decor.candle-set',
  title: 'Candle set',
  footprint: { width: 0.28, depth: 0.28, height: 0.26 },
  meta: {
    names: {
      display: 'Candle set',
      synonyms: ['candles', 'pillar candles', 'candle trio', 'candle tray', 'candle group'],
    },
    sizeClass: 'small',
  },
  params: { size: SIZE_PARAM },
  materials: {
    tray: BRASS,
    wax: { color: '#EFE5D0', roughness: 0.55 },
    accent: { color: '#EAA63C', roughness: 0.4 },
  },
  finish: finishesOf(
    {
      ivory: {},
      sage: { tray: { finish: 'walnut' }, wax: { color: '#A9B8A0', roughness: 0.55 } },
      terracotta: { wax: { color: '#C98265', roughness: 0.6 } },
      charcoal: { tray: { finish: 'satin-black' }, wax: { color: '#4A4D52', roughness: 0.5 } },
    },
    'ivory',
  ),
  mount: 'desk',
  parts: sized('size', [
    cyl(
      'tray',
      'tray',
      { height: TRAY, top: 0.14, bevel: 0.006, segments: 64 },
      { at: [0, TRAY / 2, 0], contact: true },
    ),
    ...CANDLES.flatMap((shape) => candle(shape)),
  ]),
});
