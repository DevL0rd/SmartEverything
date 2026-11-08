import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { block, by, fabric, rod } from '../../living/fc06/kit';
import { bathroomItem } from '../fc17/kit';

const RUNGS = 8;
const OFFSET = 0.05;
const DRAPED = 6;
const DROP = 0.22;

function frame(): ModelSpecPart[] {
  return [
    ...([-1, 1] as const).map((side) =>
      rod(
        side < 0 ? 'uprightLeft' : 'uprightRight',
        'frame',
        { height: by('height', 1), top: 0.014, segments: 24 },
        { at: [by('width', side * 0.5, -side * 0.014), by('height', 0.5), OFFSET] },
      ),
    ),
    ...Array.from({ length: RUNGS }, (_, index) =>
      rod(
        `rung${String(index + 1)}`,
        'frame',
        { height: by('width', 1, -0.02), top: 0.0105, segments: 16 },
        { at: [0, by('height', (index + 0.5) / RUNGS), OFFSET], turn: [0, 0, 90] },
      ),
    ),
    ...([-1, 1] as const).flatMap((side) =>
      [0.05, 1].map((fraction, index) =>
        block(
          `bracket${side < 0 ? 'Left' : 'Right'}${String(index + 1)}`,
          'frame',
          [0.034, 0.05, OFFSET],
          {
            at: [
              by('width', side * 0.5, -side * 0.014),
              by('height', fraction, fraction === 1 ? -0.05 : 0),
              OFFSET / 2,
            ],
            round: 0.008,
            segments: 3,
            minLod: 1,
          },
        ),
      ),
    ),
  ];
}

function towel(): ModelSpecPart[] {
  const rung = (DRAPED + 0.5) / RUNGS;
  return [
    rod(
      'towelRoll',
      'towel',
      { height: by('width', 1, -0.1), top: 0.02, segments: 24 },
      {
        at: [0, by('height', rung, 0.004), OFFSET],
        turn: [0, 0, 90],
      },
    ),
    ...([-1, 1] as const).map((side) =>
      block(
        side < 0 ? 'towelBack' : 'towelFront',
        'towel',
        [by('width', 1, -0.1), DROP * 2, 0.016],
        {
          at: [0, by('height', rung, -DROP), OFFSET + side * 0.02],
          round: 0.006,
          segments: 3,
        },
      ),
    ),
  ];
}

export const TOWEL_RAIL_MODEL: ModelSpec = bathroomItem({
  id: 'cat.bathroom.towel-rail',
  title: 'Towel rail',
  footprint: { width: 0.506, depth: 0.09, height: 1.2 },
  size: {
    width: { param: 'width', extra: 0.006, resizes: true },
    height: { param: 'height', extra: 0, resizes: true },
  },
  meta: {
    names: {
      display: 'Towel rail',
      synonyms: [
        'heated towel rail',
        'towel radiator',
        'ladder towel warmer',
        'towel warmer',
        'bathroom radiator',
      ],
    },
    sizeClass: 'tall',
    aliases: ['cat.bathroom.heated-towel-rail'],
  },
  params: {
    width: { min: 0.4, max: 0.7, default: 0.5, unit: 'm' },
    height: { min: 0.8, max: 1.6, default: 1.2, unit: 'm' },
  },
  materials: {
    frame: { finish: 'chrome' },
    towel: fabric('#ECE8DF'),
  },
  roles: { frame: 'fixture', towel: 'soft' },
  pitch: 10,
  wall: true,
  parts: [...frame(), ...towel()],
});
