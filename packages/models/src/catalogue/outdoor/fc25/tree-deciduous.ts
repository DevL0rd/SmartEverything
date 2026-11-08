import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { colorMaterial, finishSet } from '../../../helpers/finishes';
import {
  SIZE_PARAM,
  TALL_VIEW,
  blob,
  catalogueModel,
  rod,
  scaleBy,
  strut,
  type Point,
  type Vec,
} from './kit';

const MULCH = { radius: 0.8, height: 0.05 } as const;
const TRUNK = { height: 2.9, bottom: 0.27, top: 0.15 } as const;

interface Lobe {
  readonly id: string;
  readonly at: Vec;
  readonly radii: Vec;
  readonly material: 'leaf' | 'leafDeep';
  readonly minLod?: 0 | 1 | 2;
}

const LOBES: readonly Lobe[] = [
  { id: 'crownMain', at: [0, 4.35, 0], radii: [1.75, 1.3, 1.75], material: 'leaf' },
  { id: 'crownLeft', at: [-1.05, 3.75, 0.4], radii: [1.15, 0.9, 1.1], material: 'leaf' },
  { id: 'crownRight', at: [1.1, 3.85, -0.3], radii: [1.2, 0.95, 1.12], material: 'leaf' },
  { id: 'crownTop', at: [0.1, 5.15, 0.05], radii: [1.05, 0.85, 1.05], material: 'leaf' },
  { id: 'crownFront', at: [0.25, 3.75, 1.15], radii: [1.05, 0.8, 0.98], material: 'leaf' },
  { id: 'crownBack', at: [-0.3, 4.05, -1.15], radii: [1.1, 0.85, 1.02], material: 'leafDeep' },
  {
    id: 'crownLow',
    at: [-1.2, 3.25, -0.55],
    radii: [0.85, 0.62, 0.82],
    material: 'leafDeep',
    minLod: 1,
  },
  {
    id: 'crownLowRight',
    at: [1.2, 3.3, 0.6],
    radii: [0.88, 0.64, 0.84],
    material: 'leafDeep',
    minLod: 1,
  },
];

const TUFTS: readonly Lobe[] = [
  { id: 'tuftA', at: [-1.7, 4.4, 0.9], radii: [0.42, 0.34, 0.4], material: 'leaf' },
  { id: 'tuftB', at: [1.6, 4.65, 0.6], radii: [0.44, 0.34, 0.42], material: 'leaf' },
  { id: 'tuftC', at: [0.6, 5.7, -0.4], radii: [0.4, 0.32, 0.38], material: 'leaf' },
  { id: 'tuftD', at: [-0.7, 5.55, 0.7], radii: [0.4, 0.3, 0.38], material: 'leaf' },
  { id: 'tuftE', at: [0.4, 4.9, 1.55], radii: [0.42, 0.34, 0.4], material: 'leaf' },
  { id: 'tuftF', at: [-1.45, 3.4, 1.05], radii: [0.4, 0.3, 0.38], material: 'leaf' },
];

function lobeParts(): ModelSpecPart[] {
  const lobes = LOBES.map((lobe) =>
    blob(lobe.id, lobe.material, lobe.radii, {
      at: lobe.at,
      parent: 'mulch',
      segments: 40,
      ...(lobe.minLod === undefined ? {} : { minLod: lobe.minLod }),
    }),
  );
  const tufts = TUFTS.map((tuft) =>
    blob(tuft.id, tuft.material, tuft.radii, {
      at: tuft.at,
      parent: 'mulch',
      segments: 24,
      minLod: 2,
    }),
  );
  return [...lobes, ...tufts];
}

const BRANCH_BASE: Point = [0, 2.5, 0];

function branches(): ModelSpecPart[] {
  return [0, 120, 240].map((yaw, index) =>
    strut(
      `branch${String(index + 1)}`,
      'bark',
      { from: BRANCH_BASE, length: 1.45, tilt: 38, yaw, top: 0.045, bottom: 0.075 },
      { parent: 'mulch', minLod: 1 },
    ),
  );
}

function trunkParts(): ModelSpecPart[] {
  return [
    rod(
      'trunk',
      'bark',
      { height: TRUNK.height, top: TRUNK.top, bottom: TRUNK.bottom, bevel: 0.04, segments: 32 },
      { at: [0, TRUNK.height / 2, 0], parent: 'mulch' },
    ),
    rod(
      'trunkFlare',
      'bark',
      { height: 0.32, top: 0.27, bottom: 0.46, bevel: 0.05, segments: 32 },
      { at: [0, 0.16, 0], parent: 'mulch', minLod: 1 },
    ),
    ...branches(),
  ];
}

export const TREE_DECIDUOUS_MODEL: ModelSpec = catalogueModel({
  id: 'cat.outdoor.tree-deciduous',
  title: 'Deciduous tree',
  category: 'outdoor',
  footprint: { width: 4.5, depth: 4.3, height: 6.05 },
  view: TALL_VIEW,
  meta: {
    names: {
      display: 'Deciduous tree',
      synonyms: ['tree', 'oak tree', 'maple tree', 'shade tree', 'broadleaf tree', 'garden tree'],
    },
    sizeClass: 'large',
  },
  params: { size: SIZE_PARAM },
  materials: {
    bark: colorMaterial('#6B4F3A', { roughness: 0.92, pattern: 'ribbed' }),
    leaf: colorMaterial('#5E9148', { roughness: 0.78, sheen: 0.3 }),
    leafDeep: colorMaterial('#3F6F3A', { roughness: 0.82, sheen: 0.25 }),
  },
  finish: finishSet(
    {
      summer: {},
      spring: {
        leaf: { color: '#8DBE5C' },
        leafDeep: { color: '#6FA24A' },
      },
      blossom: {
        leaf: { color: '#F2B8CB' },
        leafDeep: { color: '#E596B3' },
      },
      autumn: {
        leaf: { color: '#D9822B' },
        leafDeep: { color: '#B5471E' },
      },
    },
    'summer',
  ),
  parts: [
    rod(
      'mulch',
      'bark',
      { height: MULCH.height, top: MULCH.radius, bevel: 0.018, segments: 48 },
      { scale: scaleBy('size'), contact: true },
    ),
    ...trunkParts(),
    ...lobeParts(),
  ],
  anchorParent: 'mulch',
});
