import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { block, by, woodOf } from '../../living/fc06/kit';
import { deskFinishes, officeItem } from './kit';

const HEIGHT = 0.74;
const TOP_T = 0.03;
const MAIN_D = 0.7;
const ARM_W = 0.62;
const LEG = 0.045;
const INSET = 0.06;
const OVERLAP = 0.1;

function leg(id: string, x: ReturnType<typeof by>, z: ReturnType<typeof by>): ModelSpecPart {
  return block(id, 'frame', [LEG, HEIGHT - TOP_T, LEG], {
    at: [x, (HEIGHT - TOP_T) / 2, z],
    round: 0.012,
    segments: 3,
    contact: true,
  });
}

function legs(): ModelSpecPart[] {
  const left = by('width', -0.5, INSET);
  const right = by('width', 0.5, -INSET);
  const inner = by('width', 0.5, -ARM_W + INSET);
  const back = by('reach', -0.5, INSET);
  const mainFront = by('reach', -0.5, MAIN_D - INSET);
  const front = by('reach', 0.5, -INSET);
  return [
    leg('legBackLeft', left, back),
    leg('legMainFront', left, mainFront),
    leg('legBackRight', right, back),
    leg('legReturnOuter', right, front),
    leg('legReturnInner', inner, front),
  ];
}

export const L_DESK_MODEL: ModelSpec = officeItem({
  id: 'cat.office.l-desk',
  title: 'L-shaped desk',
  footprint: { width: 1.8, depth: 1.4, height: HEIGHT },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    depth: { param: 'reach', extra: 0, resizes: true },
  },
  meta: {
    names: {
      display: 'L-shaped desk',
      synonyms: [
        'l desk',
        'corner desk',
        'return desk',
        'l shaped office desk',
        'corner workstation',
        'wraparound desk',
      ],
    },
    sizeClass: 'large',
    aliases: ['cat.office.l-shaped-desk', 'cat.office.corner-desk'],
  },
  params: {
    width: { min: 1.4, max: 2.2, default: 1.8, unit: 'm' },
    reach: { min: 1, max: 1.6, default: 1.4, unit: 'm' },
  },
  materials: {
    top: woodOf('oak'),
    frame: { finish: 'graphite' },
    accent: { finish: 'chrome' },
  },
  finishes: deskFinishes(['top'], ['frame']),
  defaultFinish: 'oak',
  pitch: 24,
  wall: true,
  extraAnchors: [{ kind: 'mount', id: 'surface', position: [0, HEIGHT, 0], mount: 'desk' }],
  parts: [
    block('mainTop', 'top', [by('width', 1), TOP_T, MAIN_D], {
      at: [0, HEIGHT - TOP_T / 2, by('reach', -0.5, MAIN_D / 2)],
      round: 0.012,
      segments: 3,
    }),
    block('returnTop', 'top', [ARM_W, TOP_T, by('reach', 1, -MAIN_D + OVERLAP)], {
      at: [by('width', 0.5, -ARM_W / 2), HEIGHT - TOP_T / 2 - 0.0008, (MAIN_D - OVERLAP) / 2],
      round: 0.012,
      segments: 3,
    }),
    ...legs(),
    block('modesty', 'frame', [by('width', 1, -2 * INSET - 0.04), 0.22, 0.018], {
      at: [0, HEIGHT - TOP_T - 0.12, by('reach', -0.5, INSET)],
      round: 0.007,
      segments: 3,
    }),
  ],
});
