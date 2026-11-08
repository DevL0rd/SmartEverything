import type { ModelSpecChannel } from './spec-motion';
import type { ModelSpecPart } from './spec-parts';

export type ModelSpecParamValues = Readonly<Record<string, number>>;

export type ModelSpecLod = 0 | 1 | 2;

export type ModelSpecBindable = number | NonNullable<ModelSpecPart['visible']>;

interface ParamRange {
  readonly min: number;
  readonly max: number;
  readonly default: number;
}

interface PartsSubject {
  readonly parts: readonly ModelSpecPart[];
  readonly channels?: readonly ModelSpecChannel[] | undefined;
}

export function modelParamValues(
  spec: { readonly params?: Readonly<Record<string, ParamRange>> | undefined },
  given: ModelSpecParamValues = {},
): ModelSpecParamValues {
  return Object.fromEntries(
    Object.entries(spec.params ?? {}).map(([name, param]) => [
      name,
      Math.min(param.max, Math.max(param.min, given[name] ?? param.default)),
    ]),
  );
}

export function resolveModelBinding(
  value: ModelSpecBindable,
  params: ModelSpecParamValues,
): number {
  if (typeof value === 'number') return value;
  const base = params[value.param];
  if (base === undefined) throw new Error(`model param ${value.param} has no value`);
  return base * (value.scale ?? 1) + (value.offset ?? 0);
}

export function partVisibleFor(part: ModelSpecPart, params: ModelSpecParamValues): boolean {
  return part.visible === undefined || resolveModelBinding(part.visible, params) > 0;
}

export function blurLayerIds(spec: PartsSubject): ReadonlySet<string> {
  return new Set((spec.channels ?? []).flatMap((channel) => channel.blur?.part ?? []));
}

export function shownParts(
  spec: PartsSubject,
  lod: ModelSpecLod,
  params: ModelSpecParamValues,
  without: ReadonlySet<string> = new Set(),
): readonly ModelSpecPart[] {
  const byId = new Map(spec.parts.map((part) => [part.id, part]));
  const shown = (part: ModelSpecPart): boolean => {
    if ((part.minLod ?? 0) > lod || without.has(part.id) || !partVisibleFor(part, params)) {
      return false;
    }
    const parent = part.parent === undefined ? undefined : byId.get(part.parent);
    return parent === undefined || shown(parent);
  };
  return spec.parts.filter(shown);
}

export function stillParts(
  spec: PartsSubject,
  lod: ModelSpecLod,
  params: ModelSpecParamValues,
): readonly ModelSpecPart[] {
  return shownParts(spec, lod, params, blurLayerIds(spec));
}
