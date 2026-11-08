import type { ModelSpec, ModelSpecMaterial } from '@smarteverything/domain/model-spec';
import { Color, DoubleSide, FrontSide, MeshPhysicalMaterial, type Texture } from 'three';
import type { ModelPattern } from './patterns';

export interface FinishLook {
  readonly color: string;
  readonly roughness: number;
  readonly metalness: number;
  readonly clearcoat?: number;
  readonly sheen?: number;
  readonly opacity?: number;
  readonly reflection?: number;
  readonly pattern?: ModelPattern;
}

export const FINISH_TOKENS = {
  'matte-white': { color: '#F2F1EE', roughness: 0.62, metalness: 0 },
  'warm-white': { color: '#EFE8DC', roughness: 0.5, metalness: 0, clearcoat: 0.25 },
  'satin-black': { color: '#1D1E21', roughness: 0.42, metalness: 0, clearcoat: 0.35 },
  graphite: { color: '#3A3D42', roughness: 0.48, metalness: 0.15, clearcoat: 0.2 },
  'brushed-aluminium': { color: '#C8CBD0', roughness: 0.32, metalness: 1, pattern: 'brushed' },
  chrome: { color: '#E6E8EB', roughness: 0.06, metalness: 1, reflection: 1.4 },
  'smoked-acrylic': {
    color: '#2A2C30',
    roughness: 0.08,
    metalness: 0,
    clearcoat: 1,
    opacity: 0.72,
  },
  'frosted-glass': { color: '#EEF2F4', roughness: 0.55, metalness: 0, opacity: 0.6 },
  'clear-glass': {
    color: '#F6FAFC',
    roughness: 0.03,
    metalness: 0,
    opacity: 0.18,
    reflection: 1.8,
  },
  'knit-fabric': { color: '#8E8A84', roughness: 0.9, metalness: 0, sheen: 0.8, pattern: 'knit' },
  leather: { color: '#6B4A33', roughness: 0.55, metalness: 0, clearcoat: 0.15, pattern: 'leather' },
  oak: { color: '#B88A5A', roughness: 0.6, metalness: 0, clearcoat: 0.1, pattern: 'wood-grain' },
  walnut: {
    color: '#5E3F2C',
    roughness: 0.55,
    metalness: 0,
    clearcoat: 0.15,
    pattern: 'wood-grain',
  },
  ash: { color: '#D8C7A8', roughness: 0.6, metalness: 0, pattern: 'wood-grain' },
  marble: { color: '#E9E6E1', roughness: 0.25, metalness: 0, clearcoat: 0.4, pattern: 'marble' },
  terrazzo: { color: '#DAD4CB', roughness: 0.45, metalness: 0, pattern: 'terrazzo' },
  ceramic: { color: '#F4F2EE', roughness: 0.18, metalness: 0, clearcoat: 0.6 },
  rubber: { color: '#232427', roughness: 0.92, metalness: 0 },
  terracotta: { color: '#B8664A', roughness: 0.85, metalness: 0 },
} as const satisfies Readonly<Record<string, FinishLook>>;

export type FinishToken = keyof typeof FINISH_TOKENS;

export interface ModelMaterialParams {
  readonly slot: string;
  readonly color: string;
  readonly roughness: number;
  readonly metalness: number;
  readonly clearcoat: number;
  readonly sheen: number;
  readonly opacity: number;
  readonly reflection: number;
  readonly pattern: ModelPattern | null;
}

type Surface = Omit<ModelSpecMaterial, 'finish' | 'color'>;

const PLAIN: FinishLook = { color: '#FFFFFF', roughness: 0.5, metalness: 0 };

export function isFinishToken(token: string): token is FinishToken {
  return Object.hasOwn(FINISH_TOKENS, token);
}

export function finishLook(token: string): FinishLook {
  if (!isFinishToken(token)) throw new Error(`unknown finish token ${token}`);
  return FINISH_TOKENS[token];
}

function surfaceOf(material: ModelSpecMaterial): Surface {
  const { finish: _finish, color: _color, ...surface } = material;
  return surface;
}

function baseOf(material: ModelSpecMaterial): FinishLook {
  if (material.finish !== undefined) return finishLook(material.finish);
  return { ...PLAIN, color: material.color ?? PLAIN.color };
}

function slotMaterial(
  spec: ModelSpec,
  slot: string,
  finish: string | undefined,
): ModelSpecMaterial {
  const base = spec.materials[slot];
  if (base === undefined) throw new Error(`model ${spec.id} has no material slot ${slot}`);
  if (finish === undefined) return base;
  const set = spec.finishes?.[finish];
  if (set === undefined) throw new Error(`model ${spec.id} has no finish ${finish}`);
  const override = set[slot];
  if (override === undefined) return base;
  const swapsLook = override.finish !== undefined || override.color !== undefined;
  const look = swapsLook ? { finish: override.finish, color: override.color } : base;
  return { ...surfaceOf(base), ...surfaceOf(override), finish: look.finish, color: look.color };
}

const LOOK_DEFAULTS = { clearcoat: 0, sheen: 0, opacity: 1, reflection: 1 } as const;

export function resolveMaterial(
  spec: ModelSpec,
  slot: string,
  finish: string | undefined,
): ModelMaterialParams {
  const material = slotMaterial(spec, slot, finish);
  const look = { ...LOOK_DEFAULTS, ...baseOf(material) };
  const surface = surfaceOf(material);
  return {
    slot,
    color: look.color,
    roughness: surface.roughness ?? look.roughness,
    metalness: surface.metalness ?? look.metalness,
    clearcoat: surface.clearcoat ?? look.clearcoat,
    sheen: surface.sheen ?? look.sheen,
    opacity: surface.opacity ?? look.opacity,
    reflection: look.reflection,
    pattern: surface.pattern ?? look.pattern ?? null,
  };
}

export function linearColor(hex: string): readonly [number, number, number] {
  const color = new Color(hex);
  return [color.r, color.g, color.b];
}

export interface MaterialMaps {
  readonly tone?: Texture | undefined;
  readonly relief?: Texture | undefined;
}

export interface MaterialSides {
  readonly doubleSided: boolean;
  readonly faded: boolean;
}

export const DRAW_ORDER = { solid: 0, shell: 1, glow: 2, halo: 3 } as const;

export type DrawLayer = 'solid' | 'shell' | 'glow';

export interface PartSurface extends MaterialSides {
  readonly layer: DrawLayer;
  readonly renderOrder: number;
}

export interface SurfaceShape {
  readonly flat: boolean;
  readonly faded: boolean;
}

export function drawLayer(params: ModelMaterialParams, faded: boolean): DrawLayer {
  if (faded || params.opacity <= 0) return 'glow';
  return params.opacity < 1 ? 'shell' : 'solid';
}

export function partSurface(
  params: ModelMaterialParams,
  { flat, faded }: SurfaceShape,
): PartSurface {
  const layer = drawLayer(params, faded);
  return {
    layer,
    renderOrder: DRAW_ORDER[layer],
    doubleSided: flat || layer === 'shell',
    faded,
  };
}

export function setSeeThrough(material: MeshPhysicalMaterial, transparent: boolean): void {
  Object.assign(material, { transparent, depthWrite: !transparent });
}

export function physicalMaterial(
  params: ModelMaterialParams,
  { doubleSided, faded }: MaterialSides,
  maps: MaterialMaps = {},
): MeshPhysicalMaterial {
  const transparent = faded || params.opacity < 1;
  const material = new MeshPhysicalMaterial({
    color: new Color(params.color),
    roughness: params.roughness,
    metalness: params.metalness,
    clearcoat: params.clearcoat,
    clearcoatRoughness: 0.2,
    sheen: params.sheen,
    sheenRoughness: 0.6,
    sheenColor: new Color(params.color),
    opacity: params.opacity,
    transparent,
    depthWrite: !transparent,
    envMapIntensity: params.reflection,
    side: doubleSided ? DoubleSide : FrontSide,
    vertexColors: faded,
    map: maps.tone ?? null,
    bumpMap: maps.relief ?? null,
    bumpScale: maps.relief === undefined ? 1 : 0.6,
    roughnessMap: maps.relief ?? null,
  });
  material.name = `slot:${params.slot}`;
  return material;
}
