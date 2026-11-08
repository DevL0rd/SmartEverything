import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { STORAGE_ACCENT, STORAGE_METAL, by, piece, rod, storageItem, woodOf } from './kit';

const BASE_R = 0.22;
const BASE_H = 0.03;
const POLE_R = 0.022;
const ARM_RADIUS = 0.011;
const ARM_POINTS: readonly (readonly [number, number, number])[] = [
  [0.012, 0, 0],
  [0.11, 0.014, 0],
  [0.2, 0.1, 0],
];
const KNOB_AT = [0.203, 0.107, 0] as const;
const TIERS = [
  { name: 'upper', drop: 0.08, turn: 0 },
  { name: 'lower', drop: 0.24, turn: 45 },
] as const;

function arm(tier: (typeof TIERS)[number], index: number): ModelSpecPart[] {
  const angle = tier.turn + index * 90;
  const name = `${tier.name}${String(index + 1)}`;
  const at = [0, by('height', 1, -tier.drop), 0] as const;
  return [
    piece(
      `arm${name}`,
      'body',
      {
        type: 'tube',
        points: ARM_POINTS.map((point) => [...point]),
        radius: ARM_RADIUS,
        segments: 12,
      },
      { at, turn: [0, angle, 0] },
    ),
    piece(
      `knob${name}`,
      'accent',
      { type: 'sphere', radius: 0.017, segments: 16 },
      { at: KNOB_AT, minLod: 1, parent: `arm${name}` },
    ),
  ];
}

export const COAT_RACK_MODEL: ModelSpec = storageItem({
  id: 'cat.storage.coat-rack',
  title: 'Coat rack',
  footprint: { width: 2 * BASE_R, depth: 2 * BASE_R, height: 1.794 },
  size: { height: { param: 'height', extra: 0.044, resizes: true } },
  meta: {
    names: {
      display: 'Coat rack',
      synonyms: ['coat stand', 'hat stand', 'coat tree', 'hall tree', 'jacket stand'],
    },
    sizeClass: 'medium',
    aliases: ['cat.storage.coat-stand'],
  },
  params: { height: { min: 1.4, max: 1.95, default: 1.75, unit: 'm' } },
  materials: { body: woodOf('oak'), base: STORAGE_METAL, accent: STORAGE_ACCENT },
  slots: ['body'],
  pitch: 12,
  parts: [
    rod(
      'base',
      'base',
      { height: BASE_H, top: BASE_R, segments: 48 },
      { at: [0, BASE_H / 2, 0], contact: true },
    ),
    rod(
      'pole',
      'body',
      { height: by('height', 1, -BASE_H), top: POLE_R, segments: 24 },
      { at: [0, by('height', 0.5, BASE_H / 2), 0] },
    ),
    piece(
      'finial',
      'accent',
      { type: 'sphere', radius: 0.026, segments: 24 },
      { at: [0, by('height', 1, 0.004), 0], minLod: 1 },
    ),
    ...TIERS.flatMap((tier) => [0, 1, 2, 3].flatMap((index) => arm(tier, index))),
  ],
});
