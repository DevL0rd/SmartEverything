import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { block, by, woodOf } from '../../living/fc06/kit';
import { deskFinishes, officeItem } from './kit';

const DEPTH = 0.75;
const TOP_T = 0.025;
const OUTER_TOP = 0.57;
const INNER_FROM = 0.35;
const COLUMN_X = 0.15;

function column(side: -1 | 1): ModelSpecPart[] {
  const name = side < 0 ? 'L' : 'R';
  const x = by('width', side * 0.5, -side * COLUMN_X);
  return [
    block(`outer${name}`, 'frame', [0.078, OUTER_TOP - 0.045, 0.094], {
      at: [x, (OUTER_TOP + 0.045) / 2, 0],
      round: 0.016,
      segments: 3,
    }),
    block(`inner${name}`, 'frame', [0.06, by('height', 1, -INNER_FROM - 0.065), 0.076], {
      at: [x, by('height', 0.5, (INNER_FROM - 0.065) / 2), 0],
      round: 0.014,
      segments: 3,
    }),
    block(`foot${name}`, 'frame', [0.07, 0.045, 0.66], {
      at: [x, 0.0225, 0],
      round: 0.016,
      segments: 3,
      contact: true,
    }),
    block(`bracket${name}`, 'frame', [0.09, 0.03, 0.42], {
      at: [x, by('height', 1, -TOP_T - 0.015), 0],
      round: 0.01,
      segments: 3,
    }),
  ];
}

export const STANDING_DESK_MODEL: ModelSpec = officeItem({
  id: 'cat.office.standing-desk',
  title: 'Standing desk',
  footprint: { width: 1.6, depth: DEPTH, height: 0.75 },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    height: { param: 'height', extra: 0, resizes: true },
  },
  meta: {
    names: {
      display: 'Standing desk',
      synonyms: [
        'height adjustable desk',
        'sit stand desk',
        'electric standing desk',
        'adjustable desk',
        'motorised desk',
      ],
    },
    sizeClass: 'medium',
    aliases: ['cat.office.sit-stand-desk'],
  },
  params: {
    width: { min: 1.2, max: 2, default: 1.6, unit: 'm' },
    height: { min: 0.65, max: 1.25, default: 0.75, unit: 'm' },
  },
  materials: {
    top: woodOf('oak'),
    frame: { finish: 'graphite' },
    accent: { finish: 'chrome' },
  },
  finishes: deskFinishes(['top'], ['frame']),
  defaultFinish: 'oak',
  pitch: 18,
  wall: true,
  extraAnchors: [{ kind: 'mount', id: 'surface', position: [0, 0.75, 0], mount: 'desk' }],
  parts: [
    block('top', 'top', [by('width', 1), TOP_T, DEPTH], {
      at: [0, by('height', 1, -TOP_T / 2), 0],
      round: 0.011,
      segments: 3,
    }),
    block('crossbar', 'frame', [by('width', 1, -0.3), 0.04, 0.05], {
      at: [0, by('height', 1, -TOP_T - 0.02), -0.12],
      round: 0.012,
      segments: 3,
    }),
    ...column(-1),
    ...column(1),
    block('paddle', 'accent', [0.12, 0.022, 0.05], {
      at: [by('width', 0.5, -0.3), by('height', 1, -TOP_T - 0.011), DEPTH / 2 - 0.05],
      round: 0.008,
      segments: 3,
      minLod: 1,
    }),
  ],
});
