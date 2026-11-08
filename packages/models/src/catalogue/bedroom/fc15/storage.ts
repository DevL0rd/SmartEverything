import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { block, by, piece } from '../../living/fc06/kit';
import { chest, vase } from './chest';

function lamp(): ModelSpecPart[] {
  const x = by('width', -0.2);
  return [
    vase('lampBase', x, 0.035),
    piece(
      'lampShade',
      'decor',
      {
        type: 'cylinder',
        height: 0.15,
        topRadius: 0.08,
        bottomRadius: 0.105,
        bevel: 0.004,
        segments: 40,
      },
      { at: [x, by('height', 1, 0.17), -0.03], minLod: 2 },
    ),
    block('books', 'accent', [0.2, 0.05, 0.15], {
      at: [by('width', 0.17), by('height', 1, 0.025), -0.02],
      turn: [0, 12, 0],
      round: 0.006,
      segments: 3,
      minLod: 2,
    }),
  ];
}

function tray(): ModelSpecPart[] {
  return [
    block('tray', 'accent', [0.34, 0.02, 0.22], {
      at: [by('width', -0.2), by('height', 1, 0.01), -0.02],
      round: 0.008,
      segments: 3,
      minLod: 2,
    }),
    vase('vaseTall', by('width', 0.3), 0.045),
    vase('vaseSmall', by('width', 0.18), 0.03),
  ];
}

export const NIGHTSTAND_MODEL: ModelSpec = chest({
  id: 'cat.bedroom.nightstand',
  title: 'Nightstand',
  depth: 0.4,
  leg: 0.14,
  rows: [0.6, 0.4],
  columns: 1,
  pull: 'knob',
  width: { min: 0.38, max: 0.6, default: 0.48 },
  height: { min: 0.45, max: 0.65, default: 0.55 },
  extra: { width: 0.02, height: 0.245 },
  meta: {
    names: {
      display: 'Nightstand',
      synonyms: ['bedside table', 'night table', 'bedside cabinet', 'bed side table', 'side table'],
    },
    sizeClass: 'small',
    aliases: ['cat.bedroom.bedside-table'],
  },
  top: lamp(),
});

export const DRESSER_MODEL: ModelSpec = chest({
  id: 'cat.bedroom.dresser',
  title: 'Dresser',
  depth: 0.48,
  leg: 0.16,
  rows: [0.37, 0.33, 0.3],
  columns: 2,
  pull: 'bar',
  width: { min: 1, max: 1.6, default: 1.3 },
  height: { min: 0.75, max: 1, default: 0.85 },
  extra: { width: 0.02, height: 0.108 },
  meta: {
    names: {
      display: 'Dresser',
      synonyms: ['chest of drawers', 'drawers', 'bureau', 'drawer unit', 'tallboy'],
    },
    sizeClass: 'large',
    aliases: ['cat.bedroom.chest-of-drawers', 'cat.bedroom.drawers'],
  },
  top: tray(),
});
