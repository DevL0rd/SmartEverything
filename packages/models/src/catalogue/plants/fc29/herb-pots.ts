import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { colorMaterial } from '../../../helpers/finishes';
import { block, rod, scaleBy, turned } from '../../outdoor/fc25/kit';
import { ROOT, leafPart, plantModel, potProfile } from '../fc27/kit';

const POT = { bottom: 0.045, top: 0.065, height: 0.1 } as const;
const SOIL_Y = POT.height - 0.03;

interface Herb {
  readonly name: string;
  readonly x: number;
  readonly count: number;
  readonly length: number;
  readonly width: number;
  readonly tilt: number;
  readonly lod: number;
}

const HERBS: readonly Herb[] = [
  { name: 'basil', x: -0.2, count: 6, length: 0.07, width: 0.045, tilt: 60, lod: 4 },
  { name: 'mint', x: 0, count: 6, length: 0.055, width: 0.04, tilt: 50, lod: 4 },
  { name: 'rosemary', x: 0.2, count: 7, length: 0.1, width: 0.01, tilt: 22, lod: 4 },
];

function planter(herb: Herb): ModelSpecPart[] {
  const leaves = Array.from({ length: herb.count }, (_, index) =>
    leafPart(
      `${herb.name}${String(index + 1)}`,
      {
        base: [herb.x, SOIL_Y, 0],
        length: herb.length * (1 + (index % 3) * 0.12),
        width: herb.width,
        thick: 0.008,
        tilt: herb.tilt + (index % 3) * 9,
        yaw: index * (360 / herb.count) + herb.x * 100,
        segments: 14,
      },
      'leaf',
      index < herb.lod ? {} : { minLod: 1 },
    ),
  );
  return [
    turned(
      `${herb.name}Pot`,
      'pot',
      { profile: potProfile(POT), segments: 32 },
      { at: [herb.x, 0, 0], parent: ROOT },
    ),
    rod(
      `${herb.name}Soil`,
      'soil',
      { height: 0.03, top: POT.top - 0.015, bevel: 0.006, segments: 24 },
      { at: [herb.x, SOIL_Y - 0.01, 0], parent: ROOT },
    ),
    ...leaves,
  ];
}

export const HERB_POTS_MODEL: ModelSpec = plantModel({
  id: 'cat.plants.herb-pots',
  title: 'Herb pots',
  footprint: { width: 0.65, depth: 0.35, height: 0.28 },
  view: { yaw: 25, pitch: 24, fov: 28, padding: 0.08 },
  names: {
    display: 'Herb pots',
    synonyms: [
      'herb pots',
      'herb garden',
      'kitchen herbs',
      'basil mint rosemary',
      'windowsill herbs',
    ],
  },
  sizeClass: 'small',
  materials: { leaf: colorMaterial('#5E9B49', { roughness: 0.65, sheen: 0.35 }) },
  parts: [
    block(ROOT, 'pot', [0.62, 0.02, 0.18], {
      round: 0.008,
      segments: 3,
      scale: scaleBy('size'),
      contact: true,
    }),
    ...HERBS.flatMap(planter),
  ],
});
