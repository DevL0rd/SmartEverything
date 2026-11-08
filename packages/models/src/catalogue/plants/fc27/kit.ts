import type { ModelSpec, ModelSpecMaterial, ModelSpecPart } from '@smarteverything/domain';
import { colorMaterial, finishSet, tokenMaterial } from '../../../helpers/finishes';
import {
  SIZE_PARAM,
  TALL_VIEW,
  catalogueModel,
  leafBlob,
  rod,
  scaleBy,
  strut,
  turned,
  type Footprint,
  type LeafShape,
  type Place,
  type View,
} from '../../outdoor/fc25/kit';

export const ROOT = 'saucer';

export const POT_FINISHES = finishSet(
  {
    terracotta: {},
    whiteCeramic: { pot: { finish: 'ceramic' } },
    blackMatte: { pot: { finish: 'satin-black', roughness: 0.85, clearcoat: 0 } },
    wovenBasket: { pot: { color: '#B58C5A', roughness: 0.92, pattern: 'knit' } },
  },
  'terracotta',
);

export const PLANT_MATERIALS = {
  pot: tokenMaterial('terracotta'),
  leaf: colorMaterial('#4F8A43', { roughness: 0.72, sheen: 0.35 }),
  soil: colorMaterial('#3A2A20', { roughness: 0.96 }),
} as const satisfies Readonly<Record<string, ModelSpecMaterial>>;

export interface Pot {
  readonly bottom: number;
  readonly top: number;
  readonly height: number;
}

export function potProfile(pot: Pot, rimY = 0): [number, number][] {
  const { bottom, top, height } = pot;
  return [
    [0, rimY + 0.012],
    [bottom - 0.012, rimY + 0.012],
    [bottom, rimY + 0.026],
    [top, rimY + height],
    [top + 0.012, rimY + height + 0.01],
    [top + 0.006, rimY + height + 0.024],
    [top - 0.014, rimY + height + 0.016],
    [top - 0.016, rimY + height - 0.05],
  ];
}

export function potParts(pot: Pot): ModelSpecPart[] {
  return [
    rod(
      ROOT,
      'pot',
      { height: 0.016, top: pot.bottom + 0.03, bevel: 0.006, segments: 40 },
      { scale: scaleBy('size'), contact: true },
    ),
    turned('pot', 'pot', { profile: potProfile(pot), segments: 48 }, { parent: ROOT }),
    rod(
      'soil',
      'soil',
      { height: 0.03, top: pot.top - 0.015, bevel: 0.008, segments: 40 },
      { at: [0, pot.height - 0.04, 0], parent: ROOT },
    ),
  ];
}

export function leafPart(
  id: string,
  shape: LeafShape,
  material = 'leaf',
  place: Place = {},
): ModelSpecPart {
  return leafBlob(id, material, { segments: 20, ...shape }, { parent: ROOT, ...place });
}

export interface Stem {
  readonly from: readonly [number, number, number];
  readonly length: number;
  readonly tilt: number;
  readonly yaw: number;
  readonly radius: number;
}

export function stemPart(
  id: string,
  shape: Stem,
  material = 'leaf',
  place: Place = {},
): ModelSpecPart {
  return strut(
    id,
    material,
    {
      from: shape.from,
      length: shape.length,
      tilt: shape.tilt,
      yaw: shape.yaw,
      top: shape.radius * 0.8,
      bottom: shape.radius,
      bevel: 0,
      segments: 12,
    },
    { parent: ROOT, ...place },
  );
}

export interface PlantInput {
  readonly id: string;
  readonly title: string;
  readonly footprint: Footprint;
  readonly names: { readonly display: string; readonly synonyms: string[] };
  readonly sizeClass: 'small' | 'medium' | 'large' | 'tall';
  readonly materials?: Readonly<Record<string, ModelSpecMaterial>>;
  readonly parts: ModelSpecPart[];
  readonly view?: View;
}

export function plantModel(input: PlantInput): ModelSpec {
  return catalogueModel({
    id: input.id,
    title: input.title,
    category: 'plants',
    footprint: input.footprint,
    view: input.view ?? TALL_VIEW,
    meta: { names: input.names, sizeClass: input.sizeClass },
    params: { size: SIZE_PARAM },
    materials: { ...PLANT_MATERIALS, ...input.materials },
    finish: POT_FINISHES,
    parts: input.parts,
    anchorParent: ROOT,
  });
}
