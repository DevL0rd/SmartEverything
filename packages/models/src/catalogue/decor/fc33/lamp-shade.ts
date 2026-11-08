import type { ModelSpec } from '@smarteverything/domain';
import { BRASS, SIZE_PARAM, ball, cyl, decorItem, finishesOf, sized, turned } from '../fc30/kit';

const BASE = [
  [0, 0],
  [0.07, 0],
  [0.082, 0.012],
  [0.095, 0.07],
  [0.085, 0.14],
  [0.045, 0.2],
  [0.025, 0.235],
  [0.03, 0.245],
  [0, 0.245],
] as const;

const SHADE = [
  [0.19, 0],
  [0.121, 0.24],
  [0.118, 0.24],
  [0.187, 0],
] as const;

const LEVEL = 0.29;

export const LAMP_SHADE_MODEL: ModelSpec = decorItem({
  id: 'cat.decor.lamp-shade',
  title: 'Table lamp shade',
  footprint: { width: 0.4, depth: 0.4, height: 0.58 },
  meta: {
    names: {
      display: 'Table lamp shade',
      synonyms: ['table lamp', 'lamp shade', 'lampshade', 'desk lamp shade', 'bedside lamp shade'],
    },
    sizeClass: 'small',
  },
  params: { size: SIZE_PARAM },
  materials: {
    base: { finish: 'ceramic' },
    shade: { color: '#EFE6D2', roughness: 0.9, sheen: 0.6, pattern: 'knit' },
    accent: BRASS,
  },
  finish: finishesOf(
    {
      'white-linen': {},
      'terracotta-linen': { base: { finish: 'terracotta' } },
      'ink-white': { base: { finish: 'satin-black' }, shade: { color: '#F4F1EA' } },
      'sage-oat': { base: { color: '#8FA48A', roughness: 0.25 }, shade: { color: '#D9CDB2' } },
    },
    'white-linen',
  ),
  mount: 'desk',
  parts: sized('size', [
    turned('foot', 'base', BASE, { contact: true, segments: 72 }),
    cyl(
      'stem',
      'accent',
      { height: 0.31, top: 0.006, bevel: 0.002, segments: 16 },
      { at: [0, 0.4, 0] },
    ),
    turned('shade', 'shade', SHADE, { at: [0, LEVEL, 0], segments: 96 }),
    ball('finial', 'accent', 0.015, { at: [0, LEVEL + 0.262, 0], segments: 24 }),
  ]),
});
