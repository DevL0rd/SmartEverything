import type { ModelSpecGeometry, ModelSpecPart } from '@smarteverything/domain';

type Of<T extends ModelSpecGeometry['type']> = Extract<ModelSpecGeometry, { type: T }>;

type Input<T extends ModelSpecGeometry['type']> = Omit<Of<T>, 'type'>;

export function roundedBox(input: Input<'roundedBox'>): Of<'roundedBox'> {
  return { type: 'roundedBox', ...input };
}

export function lathe(input: Input<'lathe'>): Of<'lathe'> {
  return { type: 'lathe', ...input };
}

export function slats(input: Input<'slats'>): Of<'slats'> {
  return { type: 'slats', ...input };
}

export function grille(input: Input<'grille'>): Of<'grille'> {
  return { type: 'grille', ...input };
}

export type PartOptions = Omit<ModelSpecPart, 'id' | 'geometry' | 'material'>;

export function part(
  id: string,
  geometry: ModelSpecGeometry,
  material: string,
  options: PartOptions = {},
): ModelSpecPart {
  return { id, geometry, material, ...options };
}

export type Vec = readonly [number, number, number];

export interface Place extends PartOptions {
  readonly at: Vec;
  readonly segments?: number;
}

export function placed({ at, segments: _segments, ...options }: Place): PartOptions {
  return { ...options, transform: { position: [at[0], at[1], at[2]], ...options.transform } };
}

export function box(
  id: string,
  [width, height, depth, radius]: readonly [number, number, number, number],
  material: string,
  place: Place,
): ModelSpecPart {
  const segments = place.segments ?? 4;
  return part(id, roundedBox({ width, height, depth, radius, segments }), material, placed(place));
}
