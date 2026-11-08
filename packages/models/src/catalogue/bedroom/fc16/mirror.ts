import type { ModelSpec } from '@smarteverything/domain';
import { block, by, piece, woodFinishes, woodOf } from '../../living/fc06/kit';
import { MIRROR_MATERIAL, bedroomItem } from '../fc14/kit';

const LEAN = 6;
const TILT = 90 - LEAN;
const RAD = (LEAN * Math.PI) / 180;
const THICK = 0.035;
const FOOT_LEN = 0.3;

export const FLOOR_MIRROR_MODEL: ModelSpec = bedroomItem({
  id: 'cat.bedroom.floor-mirror',
  title: 'Floor mirror',
  footprint: { width: 0.55, depth: 0.3, height: 1.6728 },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    height: { param: 'height', scale: 0.9945, extra: 0.0319, resizes: true },
  },
  meta: {
    names: {
      display: 'Floor mirror',
      synonyms: [
        'full length mirror',
        'standing mirror',
        'leaning mirror',
        'cheval mirror',
        'mirror',
      ],
    },
    sizeClass: 'tall',
    aliases: ['cat.bedroom.mirror-floor', 'cat.bedroom.full-length-mirror'],
  },
  params: {
    width: { min: 0.4, max: 0.8, default: 0.55, unit: 'm' },
    height: { min: 1.4, max: 1.9, default: 1.65, unit: 'm' },
  },
  materials: {
    frame: woodOf('walnut'),
    mirror: MIRROR_MATERIAL,
  },
  finishes: woodFinishes(['frame']),
  defaultFinish: 'walnut',
  pitch: 10,
  wall: true,
  parts: [
    piece(
      'frame',
      'frame',
      {
        type: 'cylinder',
        height: THICK,
        topRadius: 0.5,
        bottomRadius: 0.5,
        bevel: 0.01,
        segments: 72,
      },
      {
        at: [0, by('height', 0.5 * Math.cos(RAD), 0.03), 0],
        turn: [TILT, 0, 0],
        scale: [by('width', 1), 1, by('height', 1)],
        contact: true,
      },
    ),
    piece(
      'glass',
      'mirror',
      { type: 'cylinder', height: 0.012, topRadius: 0.5, bottomRadius: 0.5, segments: 72 },
      {
        at: [
          0,
          by('height', 0.5 * Math.cos(RAD), 0.03 + 0.02 * Math.sin(RAD)),
          0.02 * Math.cos(RAD),
        ],
        turn: [TILT, 0, 0],
        scale: [by('width', 1, -0.09), 1, by('height', 1, -0.09)],
      },
    ),
    ...[-1, 1].map((side) =>
      block(`foot${side < 0 ? 'Left' : 'Right'}`, 'frame', [0.05, 0.03, FOOT_LEN], {
        at: [by('width', side * 0.28), 0.015, 0],
        round: 0.01,
        segments: 3,
        minLod: 1,
      }),
    ),
  ],
});
