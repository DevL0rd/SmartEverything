import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { block, by, rod } from '../../living/fc06/kit';
import { bathroomItem } from '../fc17/kit';

const TRAY = 0.045;
const GLASS_H = 1.9;
const GLASS_T = 0.008;
const POST_H = 1.96;

function glass(): ModelSpecPart[] {
  return [
    block('doorGlass', 'glass', [by('width', 1, -0.07), GLASS_H, GLASS_T], {
      at: [0, TRAY + GLASS_H / 2, by('depth', 0.5, -0.02)],
      round: 0.003,
      segments: 3,
    }),
    block('sideGlass', 'glass', [GLASS_T, GLASS_H, by('depth', 1, -0.07)], {
      at: [by('width', 0.5, -0.02), TRAY + GLASS_H / 2, 0],
      round: 0.003,
      segments: 3,
    }),
  ];
}

function frame(): ModelSpecPart[] {
  return [
    block('topRailFront', 'accent', [by('width', 1, -0.04), 0.03, 0.026], {
      at: [0, POST_H, by('depth', 0.5, -0.02)],
      round: 0.008,
      segments: 3,
    }),
    block('topRailSide', 'accent', [0.026, 0.03, by('depth', 1, -0.04)], {
      at: [by('width', 0.5, -0.02), POST_H, 0],
      round: 0.008,
      segments: 3,
    }),
    block('footRailFront', 'accent', [by('width', 1, -0.04), 0.022, 0.026], {
      at: [0, TRAY + 0.011, by('depth', 0.5, -0.02)],
      round: 0.006,
      segments: 3,
      minLod: 1,
    }),
    rod(
      'cornerPost',
      'accent',
      { height: POST_H - TRAY, top: 0.014, segments: 24 },
      {
        at: [by('width', 0.5, -0.02), TRAY + (POST_H - TRAY) / 2, by('depth', 0.5, -0.02)],
      },
    ),
    rod(
      'doorHandle',
      'accent',
      { height: 0.42, top: 0.009, segments: 24 },
      {
        at: [by('width', 0.5, -0.14), 1.05, by('depth', 0.5, 0.012)],
        minLod: 1,
      },
    ),
    ...[0.3, 0.8].map((fraction, index) =>
      block(`hinge${String(index + 1)}`, 'accent', [0.03, 0.08, 0.02], {
        at: [by('width', -0.5, 0.04), 0.3 + fraction * 1.4, by('depth', 0.5, -0.02)],
        round: 0.006,
        segments: 3,
        minLod: 2,
      }),
    ),
  ];
}

function shower(): ModelSpecPart[] {
  return [
    block('arm', 'accent', [0.022, 0.022, 0.34], {
      at: [0, 1.9, by('depth', -0.5, 0.2)],
      round: 0.008,
      segments: 3,
    }),
    rod(
      'rainHead',
      'accent',
      { height: 0.016, top: 0.14, segments: 48 },
      {
        at: [0, 1.88, by('depth', -0.5, 0.36)],
      },
    ),
    rod(
      'drain',
      'accent',
      { height: 0.006, top: 0.04, segments: 24 },
      {
        at: [0, TRAY + 0.003, 0],
        minLod: 1,
      },
    ),
  ];
}

export const SHOWER_ENCLOSURE_MODEL: ModelSpec = bathroomItem({
  id: 'cat.bathroom.shower-enclosure',
  title: 'Shower enclosure',
  footprint: { width: 0.9, depth: 0.921, height: 2 },
  size: {
    width: { param: 'width', extra: 0, resizes: true },
    depth: { param: 'depth', extra: 0.021, resizes: true },
  },
  meta: {
    names: {
      display: 'Shower enclosure',
      synonyms: [
        'shower cubicle',
        'shower cabin',
        'glass shower',
        'corner shower',
        'shower stall',
        'walk in shower',
      ],
    },
    sizeClass: 'large',
    aliases: ['cat.bathroom.shower'],
  },
  params: {
    width: { min: 0.7, max: 1.4, default: 0.9, unit: 'm' },
    depth: { min: 0.7, max: 1.4, default: 0.9, unit: 'm' },
  },
  materials: {
    ware: { finish: 'ceramic' },
    glass: { finish: 'clear-glass', opacity: 0.3 },
    accent: { finish: 'chrome' },
  },
  roles: { ware: 'ware', accent: 'fixture' },
  pitch: 14,
  wall: true,
  parts: [
    block('tray', 'ware', [by('width', 1), TRAY, by('depth', 1)], {
      at: [0, TRAY / 2, 0],
      round: 0.012,
      segments: 3,
      contact: true,
    }),
    ...glass(),
    ...frame(),
    ...shower(),
  ],
});
