import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { colorMaterial } from '../../../helpers/finishes';
import { block, blob, lean, scaleBy, strut, type Point } from '../../outdoor/fc25/kit';
import { ROOT, plantModel } from '../fc27/kit';

const SEGMENTS = [
  { length: 0.15, tilt: 18, radius: 0.03 },
  { length: 0.14, tilt: -16, radius: 0.026 },
  { length: 0.12, tilt: 12, radius: 0.021 },
] as const;

function trunk(): { readonly parts: ModelSpecPart[]; readonly tips: Point[] } {
  let from: Point = START;
  const tips: Point[] = [];
  const parts = SEGMENTS.map((segment, index) => {
    const part = strut(
      `trunk${String(index + 1)}`,
      'accent',
      {
        from,
        length: segment.length,
        tilt: segment.tilt,
        yaw: 0,
        bottom: segment.radius,
        top: segment.radius * 0.85,
        bevel: 0.006,
        segments: 20,
      },
      { parent: ROOT },
    );
    from = lean(from, segment.length, segment.tilt, 0);
    tips.push(from);
    return part;
  });
  return { parts, tips };
}

const START: Point = [0.04, 0.1, 0];

interface Limb {
  readonly id: string;
  readonly from: Point;
  readonly length: number;
  readonly tilt: number;
  readonly yaw: number;
  readonly radii: readonly [number, number, number];
}

function limbs(tips: readonly Point[]): Limb[] {
  const [a = START, b = START] = tips;
  return [
    { id: 'Left', from: a, length: 0.15, tilt: 68, yaw: 0, radii: [0.1, 0.04, 0.09] },
    { id: 'Right', from: b, length: 0.14, tilt: -70, yaw: 0, radii: [0.09, 0.038, 0.085] },
    { id: 'Low', from: START, length: 0.1, tilt: -62, yaw: 70, radii: [0.07, 0.03, 0.065] },
  ];
}

function pads(tips: readonly Point[]): ModelSpecPart[] {
  const [, , c = START] = tips;
  const top = blob('padTop', 'leaf', [0.14, 0.05, 0.12], {
    at: [c[0] - 0.01, c[1] + 0.04, c[2]],
    parent: ROOT,
    segments: 28,
  });
  return [
    top,
    ...limbs(tips).flatMap((limb) => {
      const end = lean(limb.from, limb.length, limb.tilt, limb.yaw);
      return [
        strut(
          `branch${limb.id}`,
          'accent',
          {
            from: limb.from,
            length: limb.length,
            tilt: limb.tilt,
            yaw: limb.yaw,
            bottom: 0.011,
            top: 0.008,
            bevel: 0,
            segments: 12,
          },
          { parent: ROOT },
        ),
        blob(`pad${limb.id}`, 'leaf', limb.radii, {
          at: [end[0], end[1] + 0.025, end[2]],
          parent: ROOT,
          segments: 28,
        }),
      ];
    }),
  ];
}

export function bonsaiParts(): ModelSpecPart[] {
  const stem = trunk();
  return [
    block(ROOT, 'pot', [0.36, 0.02, 0.26], {
      round: 0.008,
      segments: 3,
      scale: scaleBy('size'),
      contact: true,
    }),
    block('pot', 'pot', [0.32, 0.075, 0.22], {
      round: 0.02,
      segments: 4,
      at: [0, 0.0575, 0],
      parent: ROOT,
    }),
    block('soil', 'soil', [0.29, 0.02, 0.19], {
      round: 0.008,
      segments: 3,
      at: [0, 0.092, 0],
      parent: ROOT,
    }),
    ...stem.parts,
    ...pads(stem.tips),
  ];
}

export const BONSAI_MODEL: ModelSpec = plantModel({
  id: 'cat.plants.bonsai',
  title: 'Bonsai',
  footprint: { width: 0.54, depth: 0.29, height: 0.59 },
  view: { yaw: 30, pitch: 20, fov: 28, padding: 0.08 },
  names: {
    display: 'Bonsai',
    synonyms: ['bonsai', 'bonsai tree', 'miniature tree', 'potted tree', 'japanese tree'],
  },
  sizeClass: 'small',
  materials: {
    leaf: colorMaterial('#3F7A45', { roughness: 0.75, sheen: 0.3 }),
    accent: colorMaterial('#6B4F3A', { roughness: 0.9, pattern: 'ribbed' }),
  },
  parts: bonsaiParts(),
});
