import type { HomeMapEditSizeParam, HomeMapSizeAxis } from '../home-map-manipulate-types';
import { MODEL_SPEC_SIZE_AXES, type ModelSpec, type ModelSpecFov } from './spec';
import {
  FAMILY_PLACEMENT,
  MOUNT_HEIGHT_M,
  registryPlacement,
  type ModelCatalogueMetadata,
  type PlacementEntry,
  type PlacementMount,
} from './device-registry';
import type { PlacementFootprint } from './placement-footprint';

export interface PlacementFacts {
  readonly mount: PlacementMount;
  readonly defaultHeightM: number;
  readonly footprint: PlacementFootprint;
  readonly fov?: ModelSpecFov;
}

function specMount(spec: ModelSpec): PlacementMount | undefined {
  const anchor = spec.anchors?.find((candidate) => candidate.kind === 'mount');
  if (anchor === undefined) return undefined;
  return anchor.mount === 'desk' ? 'table' : anchor.mount;
}

function baseFor(modelId: string, spec: ModelSpec | undefined): PlacementEntry | undefined {
  const registered = registryPlacement(modelId);
  if (registered !== undefined) return registered;
  return spec?.family === undefined ? undefined : FAMILY_PLACEMENT[spec.family];
}

function heightFor(mount: PlacementMount, base: PlacementEntry | undefined): number {
  return base?.mount === mount ? base.defaultHeightM : MOUNT_HEIGHT_M[mount];
}

function footprintFor(
  base: PlacementEntry | undefined,
  spec: ModelSpec | undefined,
): PlacementFootprint | undefined {
  if (spec === undefined) return base?.footprint;
  const { width, depth, height } = spec.footprint;
  return { w: width, d: depth, h: height };
}

export function placementFacts(modelId: string, spec?: ModelSpec): PlacementFacts | undefined {
  const base = baseFor(modelId, spec);
  const mount = (spec === undefined ? undefined : specMount(spec)) ?? base?.mount;
  const footprint = footprintFor(base, spec);
  if (mount === undefined || footprint === undefined) return undefined;
  const fov = spec?.fov ?? base?.fov;
  return {
    mount,
    defaultHeightM: heightFor(mount, base),
    footprint,
    ...(fov === undefined ? {} : { fov }),
  };
}

export function modelSizeParams(spec: ModelSpec): readonly HomeMapEditSizeParam[] {
  return MODEL_SPEC_SIZE_AXES.flatMap((axis): HomeMapEditSizeParam[] => {
    const extent = spec.size?.[axis];
    const param = extent === undefined ? undefined : spec.params?.[extent.param];
    if (extent === undefined || param === undefined) return [];
    return [
      {
        name: extent.param,
        axis,
        min: param.min,
        max: param.max,
        scale: extent.scale ?? 1,
        extra: extent.extra,
        resizes: extent.resizes,
      },
    ];
  });
}

export function modelOuterSize(
  spec: ModelSpec,
  params: Readonly<Record<string, number>>,
): Readonly<Record<HomeMapSizeAxis, number>> {
  const extentOf = (axis: HomeMapSizeAxis): number => {
    const extent = spec.size?.[axis];
    const value =
      extent === undefined
        ? undefined
        : (params[extent.param] ?? spec.params?.[extent.param]?.default);
    return extent === undefined || value === undefined
      ? spec.footprint[axis]
      : value * (extent.scale ?? 1) + extent.extra;
  };
  return { width: extentOf('width'), depth: extentOf('depth'), height: extentOf('height') };
}

function metaNames(spec: ModelSpec): ModelCatalogueMetadata['names'] {
  const names = spec.meta?.names;
  return { display: names?.display ?? spec.title, synonyms: [...(names?.synonyms ?? [])] };
}

export function catalogueMetadata(spec: ModelSpec): ModelCatalogueMetadata | undefined {
  const facts = placementFacts(spec.id, spec);
  if (facts === undefined) return undefined;
  const { sizeClass, variants, aliases } = spec.meta ?? {};
  return {
    id: spec.id,
    version: spec.version,
    category: spec.category,
    names: metaNames(spec),
    ...(sizeClass === undefined ? {} : { sizeClass }),
    mount: facts.mount,
    defaultHeightM: facts.defaultHeightM,
    variants: [...(variants ?? [])],
    finishes: Object.keys(spec.finishes ?? {}),
    aliases: [...(aliases ?? [])],
  };
}
