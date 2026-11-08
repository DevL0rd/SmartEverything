import type { ModelSpec } from '@smarteverything/domain';
import { block, by, piece } from '../../living/fc06/kit';
import { bathroomItem } from '../fc17/kit';

const HEIGHT = 0.045;
const RIM = 0.05;

export const SHOWER_TRAY_MODEL: ModelSpec = bathroomItem({
  id: 'cat.bathroom.shower-tray',
  title: 'Shower tray',
  footprint: { width: 0.9, depth: 0.9, height: HEIGHT },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    depth: { param: 'depth', extra: 0, resizes: true },
  },
  meta: {
    names: {
      display: 'Shower tray',
      synonyms: [
        'shower base',
        'shower pan',
        'low profile tray',
        'square shower tray',
        'shower floor',
      ],
    },
    sizeClass: 'medium',
    aliases: ['cat.bathroom.shower-base'],
  },
  params: {
    width: { min: 0.7, max: 1.6, default: 0.9, unit: 'm' },
    depth: { min: 0.7, max: 1.0, default: 0.9, unit: 'm' },
  },
  materials: {
    ware: { finish: 'ceramic' },
    accent: { finish: 'chrome' },
  },
  roles: { ware: 'ware', accent: 'fixture' },
  pitch: 35,
  wall: true,
  parts: [
    block('bed', 'ware', [by('width', 1, -0.05), 0.03, by('depth', 1, -0.05)], {
      at: [0, 0.015, 0],
      round: 0.008,
      segments: 3,
      contact: true,
    }),
    ...([-1, 1] as const).flatMap((side) => {
      const name = side < 0 ? 'Back' : 'Front';
      return [
        block(`rim${name}`, 'ware', [by('width', 1), HEIGHT, RIM], {
          at: [0, HEIGHT / 2, by('depth', side * 0.5, (-side * RIM) / 2)],
          round: 0.014,
          segments: 3,
        }),
        block(
          `side${name === 'Back' ? 'Left' : 'Right'}`,
          'ware',
          [RIM, HEIGHT, by('depth', 1, -2 * RIM + 0.01)],
          {
            at: [by('width', side * 0.5, (-side * RIM) / 2), HEIGHT / 2, 0],
            round: 0.014,
            segments: 3,
          },
        ),
      ];
    }),
    piece(
      'drain',
      'accent',
      { type: 'grille', width: 0.11, height: 0.11, rows: 4, columns: 4, holeRadius: 0.009 },
      { at: [0, 0.032, 0], turn: [-90, 0, 0], minLod: 1 },
    ),
  ],
});
