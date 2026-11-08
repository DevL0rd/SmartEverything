import type { ModelSpec, ModelSpecMaterial, ModelSpecPart } from '@smarteverything/domain';
import type { FinishSet } from '../../../helpers/finishes';
import { decorItem, fabric, type DecorInput } from '../../decor/fc30/kit';

export { SIZE_PARAM, block, by, cyl, piece, sized } from '../../decor/fc30/kit';

export interface Colourway {
  readonly pile: string;
  readonly border: string;
  readonly accent: string;
}

export interface Weave {
  readonly pile: (color: string) => ModelSpecMaterial;
  readonly border: (color: string) => ModelSpecMaterial;
  readonly accent: (color: string) => ModelSpecMaterial;
}

export function solid(color: string): ModelSpecMaterial {
  return { color, roughness: 0.85 };
}

export function ribbed(color: string): ModelSpecMaterial {
  return { color, roughness: 0.9, pattern: 'ribbed' };
}

export const WOOL: Weave = { pile: fabric, border: fabric, accent: solid };

export const WOOL_WAYS: Readonly<Record<string, Colourway>> = {
  oat: { pile: '#CBBDA5', border: '#8A7B66', accent: '#A2553B' },
  slate: { pile: '#69717C', border: '#2B3242', accent: '#CBBDA5' },
  sage: { pile: '#8FA48A', border: '#4C5E49', accent: '#D9CDB2' },
  terracotta: { pile: '#B5654A', border: '#6E3B2B', accent: '#E3C9A8' },
  ink: { pile: '#2B3242', border: '#69717C', accent: '#C9A25A' },
};

export interface Woven {
  readonly materials: ModelSpec['materials'];
  readonly finish: FinishSet;
}

function materialsOf(way: Colourway, weave: Weave): Record<string, ModelSpecMaterial> {
  return {
    pile: weave.pile(way.pile),
    border: weave.border(way.border),
    accent: weave.accent(way.accent),
  };
}

export function woven(table: Readonly<Record<string, Colourway>>, weave: Weave = WOOL): Woven {
  const names = Object.keys(table);
  const first = names[0];
  const way = first === undefined ? undefined : table[first];
  if (first === undefined || way === undefined) throw new Error('a rug has a colourway');
  return {
    materials: materialsOf(way, weave),
    finish: {
      finishes: Object.fromEntries(
        Object.entries(table).map(([name, entry]) => [name, materialsOf(entry, weave)]),
      ),
      defaultFinish: first,
    },
  };
}

export interface RugInput extends Pick<
  DecorInput,
  'id' | 'title' | 'footprint' | 'meta' | 'params' | 'size'
> {
  readonly woven: Woven;
  readonly parts: ModelSpecPart[];
}

export function rugItem(input: RugInput): ModelSpec {
  return decorItem({
    id: input.id,
    title: input.title,
    category: 'rugs',
    footprint: input.footprint,
    meta: input.meta,
    ...(input.params === undefined ? {} : { params: input.params }),
    ...(input.size === undefined ? {} : { size: input.size }),
    materials: input.woven.materials,
    finish: input.woven.finish,
    mount: 'floor',
    pitch: 35,
    parts: input.parts,
  });
}
