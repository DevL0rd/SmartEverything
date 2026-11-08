import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { colorMaterial, finishSet } from '../../../helpers/finishes';
import {
  SIZE_PARAM,
  TALL_VIEW,
  blob,
  catalogueModel,
  lean,
  leafBlob,
  rod,
  scaleBy,
  strut,
  type Point,
} from './kit';

const SEGMENTS = 4;
const SEGMENT_LENGTH = 1.3;
const FROND_COUNT = 9;
const INNER = { length: 0.62, width: 0.3, thick: 0.03 } as const;
const OUTER = { length: 0.56, width: 0.24, thick: 0.026 } as const;

interface Joint {
  readonly from: Point;
  readonly to: Point;
}

function trunkJoints(): Joint[] {
  const joints: Joint[] = [];
  let from: Point = [0, 0, 0];
  for (let index = 0; index < SEGMENTS; index += 1) {
    const to = lean(from, SEGMENT_LENGTH, 2.5 + index * 2.5, 180);
    joints.push({ from, to });
    from = to;
  }
  return joints;
}

const JOINTS = trunkJoints();

const CROWN: Point = JOINTS[SEGMENTS - 1]?.to ?? [0, 5.2, 0];

function trunk(): ModelSpecPart[] {
  return JOINTS.map((joint, index) =>
    strut(
      `trunk${String(index + 1)}`,
      'trunk',
      {
        from: joint.from,
        length: SEGMENT_LENGTH,
        tilt: 2.5 + index * 2.5,
        yaw: 180,
        bottom: 0.27 - index * 0.022,
        top: 0.245 - index * 0.022,
        bevel: 0.045,
        segments: 32,
      },
      { parent: 'sand' },
    ),
  );
}

function frond(index: number): ModelSpecPart[] {
  const yaw = index * (360 / FROND_COUNT) + 12;
  const rise = 58 + (index % 3) * 7;
  const fall = 104 + (index % 2) * 8;
  const reach = 1 + (index % 3) * 0.06;
  const inner = { ...INNER, length: INNER.length * reach, base: CROWN, tilt: rise, yaw };
  const joint = lean(CROWN, inner.length * 2, rise, yaw);
  const outer = { ...OUTER, length: OUTER.length * reach, base: joint, tilt: fall, yaw };
  const name = String(index + 1);
  return [
    leafBlob(`frondIn${name}`, 'frond', { ...inner, segments: 16 }, { parent: 'sand' }),
    leafBlob(`frondOut${name}`, 'frond', { ...outer, segments: 16 }, { parent: 'sand' }),
  ];
}

function coconuts(): ModelSpecPart[] {
  return [
    [0.12, -0.2, 0.14],
    [-0.1, -0.22, -0.08],
    [0.02, -0.18, -0.22],
  ].map(([x = 0, y = 0, z = 0], index) =>
    blob(`coconut${String(index + 1)}`, 'accent', [0.13, 0.15, 0.13], {
      at: [CROWN[0] + x, CROWN[1] + y, CROWN[2] + z],
      parent: 'sand',
      minLod: 1,
      segments: 20,
    }),
  );
}

export const TREE_PALM_MODEL: ModelSpec = catalogueModel({
  id: 'cat.outdoor.tree-palm',
  title: 'Palm tree',
  category: 'outdoor',
  footprint: { width: 4.75, depth: 4.8, height: 5.9 },
  view: TALL_VIEW,
  meta: {
    names: {
      display: 'Palm tree',
      synonyms: ['palm', 'coconut palm', 'date palm', 'tropical tree', 'garden palm'],
    },
    sizeClass: 'large',
  },
  params: { size: SIZE_PARAM },
  materials: {
    trunk: colorMaterial('#8C6D50', { roughness: 0.9, pattern: 'ribbed' }),
    frond: colorMaterial('#4E9040', { roughness: 0.7, sheen: 0.35 }),
    sand: colorMaterial('#D8C8A2', { roughness: 0.95 }),
    accent: colorMaterial('#5B3B22', { roughness: 0.6 }),
  },
  finish: finishSet(
    {
      green: {},
      lush: { frond: { color: '#2F8A4A' } },
      sunbaked: { frond: { color: '#A7A04C' }, trunk: { color: '#9C7E5C' } },
    },
    'green',
  ),
  parts: [
    rod(
      'sand',
      'sand',
      { height: 0.05, top: 0.8, bevel: 0.018, segments: 48 },
      { scale: scaleBy('size'), contact: true },
    ),
    ...trunk(),
    blob('crownBoss', 'trunk', [0.3, 0.24, 0.3], { at: CROWN, parent: 'sand', segments: 24 }),
    ...coconuts(),
    ...Array.from({ length: FROND_COUNT }, (_, index) => frond(index)).flat(),
  ],
  anchorParent: 'sand',
});
