import type { RenderObject } from '../render-scene';

export const DEFAULT_OBJECT_METRES = 0.6;

export interface PlanSymbolLayer {
  readonly d: string;
  readonly fill: string;
  readonly fillOpacity: number;
  readonly fillRule: 'nonzero' | 'evenodd';
  readonly stroke: string;
}

export interface PlanSymbol {
  readonly layers: readonly PlanSymbolLayer[];
}

export type PlanSymbolOf = (item: RenderObject) => PlanSymbol | null;

export const objectCategory = (item: Pick<RenderObject, 'modelId' | 'kind'>): string => {
  const [scope, category] = (item.modelId ?? '').split('.');
  return scope === 'cat' && category !== undefined && category !== '' ? category : item.kind;
};
