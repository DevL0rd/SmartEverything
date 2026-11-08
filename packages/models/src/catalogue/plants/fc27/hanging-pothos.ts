import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import {
  arch,
  catalogueModel,
  leafBlob,
  piece,
  rod,
  strut,
  scaleBy,
  SIZE_PARAM,
  TALL_VIEW,
  type Point,
} from '../../outdoor/fc25/kit';
import { PLANT_MATERIALS, POT_FINISHES, potProfile } from './kit';
import { colorMaterial, tokenMaterial } from '../../../helpers/finishes';

const HOOK = 'hook';
const DROP = 0.55;
const POT = { bottom: 0.1, top: 0.15, height: 0.2 } as const;
const DEG = Math.PI / 180;

interface Vine {
  readonly angle: number;
  readonly out: number;
  readonly length: number;
}

const VINES: readonly Vine[] = [
  { angle: 20, out: 0.05, length: 0.75 },
  { angle: 110, out: 0.08, length: 0.95 },
  { angle: 200, out: 0.06, length: 0.6 },
  { angle: 285, out: 0.09, length: 0.85 },
];

function vinePoints(vine: Vine): Point[] {
  const cos = Math.cos(vine.angle * DEG);
  const sin = Math.sin(vine.angle * DEG);
  const rim = POT.top + 0.01;
  return [0, 0.3, 0.62, 1].map((t, index) => {
    const reach = rim + vine.out * (index === 0 ? 0 : 1 + t * 0.4);
    return [reach * cos, -DROP - 0.02 - vine.length * t * (1 - 0.1 * t), reach * sin];
  });
}

function vineParts(vine: Vine, index: number): ModelSpecPart[] {
  const name = String(index + 1);
  const points = vinePoints(vine);
  const stems = arch(`vine${name}`, 'leaf', { points, radius: 0.009 });
  const leaves = [0.18, 0.34, 0.5, 0.66, 0.82, 0.96].map((along, step): ModelSpecPart => {
    const span = along * (points.length - 1);
    const at = Math.min(points.length - 2, Math.floor(span));
    const from = points[at] ?? [0, 0, 0];
    const to = points[at + 1] ?? from;
    const k = span - at;
    const base: Point = [
      from[0] + (to[0] - from[0]) * k,
      from[1] + (to[1] - from[1]) * k,
      from[2] + (to[2] - from[2]) * k,
    ];
    return leafBlob(
      `pothos${name}${String(step + 1)}`,
      'leaf',
      {
        base,
        length: 0.06,
        width: 0.048,
        thick: 0.008,
        tilt: 150 + (step % 3) * 10,
        yaw: vine.angle + step * 67,
        segments: 16,
      },
      { parent: HOOK, ...(step % 2 === 0 ? {} : { minLod: 1 as const }) },
    );
  });
  return [{ ...stems, parent: HOOK }, ...leaves];
}

function cords(): ModelSpecPart[] {
  const reach = POT.top;
  const length = Math.hypot(DROP, reach);
  const tilt = (Math.atan(reach / DROP) * 180) / Math.PI;
  return [0, 120, 240].map((angle, index) => {
    const rad = angle * DEG;
    return strut(
      `cord${String(index + 1)}`,
      'accent',
      {
        from: [reach * Math.cos(rad), -DROP, reach * Math.sin(rad)],
        length,
        tilt,
        yaw: -angle,
        top: 0.006,
        bevel: 0,
        segments: 8,
      },
      { parent: HOOK },
    );
  });
}

export const HANGING_POTHOS_MODEL: ModelSpec = catalogueModel({
  id: 'cat.plants.hanging-pothos',
  title: 'Hanging pothos',
  category: 'plants',
  footprint: { width: 0.6, depth: 0.64, height: 1.52 },
  mount: 'ceiling',
  view: TALL_VIEW,
  meta: {
    names: {
      display: 'Hanging pothos',
      synonyms: [
        'hanging pothos',
        'trailing plant',
        'devil’s ivy',
        'hanging planter',
        'hanging plant',
      ],
    },
    sizeClass: 'medium',
  },
  params: { size: SIZE_PARAM },
  materials: {
    ...PLANT_MATERIALS,
    leaf: colorMaterial('#3F8A4A', { roughness: 0.7, sheen: 0.35 }),
    accent: tokenMaterial('chrome'),
  },
  finish: POT_FINISHES,
  parts: [
    rod(
      HOOK,
      'accent',
      { height: 0.02, top: 0.05, bevel: 0.006, segments: 32 },
      { scale: scaleBy('size'), contact: false },
    ),
    piece(
      'pot',
      'pot',
      { type: 'lathe', profile: potProfile(POT, -DROP - 0.2), segments: 48 },
      { parent: HOOK },
    ),
    rod(
      'soil',
      'soil',
      { height: 0.03, top: POT.top - 0.015, bevel: 0.008, segments: 40 },
      { at: [0, -DROP - 0.04, 0], parent: HOOK },
    ),
    ...cords(),
    ...VINES.flatMap(vineParts),
  ],
  anchorParent: HOOK,
});
