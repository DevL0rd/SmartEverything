import type { ModelSpec } from '@smarteverything/domain';
import { block, rod } from '../../living/fc06/kit';
import { bathroomItem } from './kit';
import { seatParts } from './seat';

const PANEL_FACE = -0.17;

export const WALL_HUNG_TOILET_MODEL: ModelSpec = bathroomItem({
  id: 'cat.bathroom.wall-hung-toilet',
  title: 'Wall-hung toilet',
  footprint: { width: 0.5, depth: 0.54, height: 1.12 },
  meta: {
    names: {
      display: 'Wall-hung toilet',
      synonyms: [
        'wall hung wc',
        'wall mounted toilet',
        'floating toilet',
        'concealed cistern toilet',
        'rimless toilet',
      ],
    },
    sizeClass: 'small',
    aliases: ['cat.bathroom.wall-mounted-toilet'],
  },
  materials: {
    ware: { finish: 'ceramic' },
    panel: { finish: 'matte-white' },
    accent: { finish: 'chrome' },
  },
  roles: { ware: 'ware', panel: 'panel', accent: 'fixture' },
  pitch: 20,
  wall: true,
  parts: [
    block('panel', 'panel', [0.5, 1.12, 0.1], {
      at: [0, 0.56, -0.22],
      round: 0.02,
      segments: 3,
      contact: true,
    }),
    block('bowl', 'ware', [0.36, 0.24, 0.5], {
      at: [0, 0.26, 0.02],
      round: 0.11,
      segments: 4,
    }),
    ...seatParts({ width: 0.36, length: 0.46, y: 0.38, z: 0.03 }),
    block('plate', 'accent', [0.24, 0.16, 0.012], {
      at: [0, 0.92, PANEL_FACE + 0.006],
      round: 0.005,
      segments: 3,
    }),
    ...([-1, 1] as const).map((side) =>
      rod(
        side < 0 ? 'plateButtonLeft' : 'plateButtonRight',
        'panel',
        { height: 0.008, top: 0.034, segments: 32 },
        { at: [side * 0.055, 0.92, PANEL_FACE + 0.016], turn: [90, 0, 0], minLod: 1 },
      ),
    ),
  ],
});
