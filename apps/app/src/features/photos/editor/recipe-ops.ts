import {
  IDENTITY_RECIPE,
  isIdentityRecipe,
  type PhotoBox,
  type PhotoFilter,
  type PhotoRecipe,
} from '@smarteverything/domain';

export type LightKey = keyof PhotoRecipe['light'];

export type ColourKey = keyof PhotoRecipe['colour'];

export const LIGHT_KEYS: readonly LightKey[] = [
  'exposure',
  'contrast',
  'highlights',
  'shadows',
  'whites',
  'blacks',
];

export const COLOUR_KEYS: readonly ColourKey[] = ['saturation', 'warmth', 'tint'];

export type AdjustKey = LightKey | ColourKey;

const LIGHT_SET: ReadonlySet<string> = new Set(LIGHT_KEYS);

export function isLightKey(key: AdjustKey): key is LightKey {
  return LIGHT_SET.has(key);
}

export function adjustValue(recipe: PhotoRecipe, key: AdjustKey): number {
  return isLightKey(key) ? recipe.light[key] : recipe.colour[key];
}

export function adjusted(recipe: PhotoRecipe, key: AdjustKey, value: number): PhotoRecipe {
  return isLightKey(key) ? withLight(recipe, key, value) : withColour(recipe, key, value);
}

export const SLIDER_LABELS: Readonly<Record<LightKey | ColourKey, string>> = {
  exposure: 'Exposure',
  contrast: 'Contrast',
  highlights: 'Highlights',
  shadows: 'Shadows',
  whites: 'Whites',
  blacks: 'Blacks',
  saturation: 'Saturation',
  warmth: 'Warmth',
  tint: 'Tint',
};

export const FILTER_LABELS: Readonly<Record<PhotoFilter, string>> = {
  vivid: 'Vivid',
  warm: 'Warm',
  cool: 'Cool',
  mono: 'Mono',
  noir: 'Noir',
  sepia: 'Sepia',
  fade: 'Fade',
  dramatic: 'Dramatic',
  vintage: 'Vintage',
  chrome: 'Chrome',
};

export const FULL_FILTER = 100;

export function boxRotatedClockwise(box: PhotoBox): PhotoBox {
  return { x: 1 - box.y - box.h, y: box.x, w: box.h, h: box.w };
}

export function boxMirrored(box: PhotoBox): PhotoBox {
  return { x: 1 - box.x - box.w, y: box.y, w: box.w, h: box.h };
}

export function rotatedClockwise(recipe: PhotoRecipe): PhotoRecipe {
  return {
    ...recipe,
    quarterTurns: (recipe.quarterTurns + 1) % 4,
    crop: recipe.crop === null ? null : boxRotatedClockwise(recipe.crop),
  };
}

export function mirrored(recipe: PhotoRecipe): PhotoRecipe {
  const sideways = recipe.quarterTurns % 2 === 1;
  return {
    ...recipe,
    flipHorizontal: sideways ? recipe.flipHorizontal : !recipe.flipHorizontal,
    flipVertical: sideways ? !recipe.flipVertical : recipe.flipVertical,
    straighten: recipe.straighten === 0 ? 0 : -recipe.straighten,
    crop: recipe.crop === null ? null : boxMirrored(recipe.crop),
  };
}

export function straightened(recipe: PhotoRecipe, degrees: number): PhotoRecipe {
  return { ...recipe, straighten: Math.min(45, Math.max(-45, degrees)) };
}

function isWhole(box: PhotoBox): boolean {
  return box.x === 0 && box.y === 0 && box.w === 1 && box.h === 1;
}

export function cropped(recipe: PhotoRecipe, box: PhotoBox | null): PhotoRecipe {
  return { ...recipe, crop: box === null || isWhole(box) ? null : box };
}

export function withLight(recipe: PhotoRecipe, key: LightKey, value: number): PhotoRecipe {
  return { ...recipe, light: { ...recipe.light, [key]: value } };
}

export function withColour(recipe: PhotoRecipe, key: ColourKey, value: number): PhotoRecipe {
  return { ...recipe, colour: { ...recipe.colour, [key]: value } };
}

export function withFilter(recipe: PhotoRecipe, preset: PhotoFilter | null): PhotoRecipe {
  if (preset === null) return { ...recipe, filter: null };
  const strength = recipe.filter?.strength ?? FULL_FILTER;
  return { ...recipe, filter: { preset, strength } };
}

export function withFilterStrength(recipe: PhotoRecipe, strength: number): PhotoRecipe {
  return recipe.filter === null ? recipe : { ...recipe, filter: { ...recipe.filter, strength } };
}

export function withPatch(recipe: PhotoRecipe, patchId: string, box: PhotoBox): PhotoRecipe {
  return { ...recipe, patches: [...recipe.patches, { patchId, box }] };
}

export function geometryReset(recipe: PhotoRecipe): PhotoRecipe {
  return {
    ...recipe,
    crop: null,
    quarterTurns: 0,
    straighten: 0,
    flipHorizontal: false,
    flipVertical: false,
  };
}

export function adjustReset(recipe: PhotoRecipe): PhotoRecipe {
  return { ...recipe, light: IDENTITY_RECIPE.light, colour: IDENTITY_RECIPE.colour };
}

export function sameRecipe(a: PhotoRecipe, b: PhotoRecipe): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function changesAnything(recipe: PhotoRecipe): boolean {
  return !isIdentityRecipe(recipe);
}

export function withoutFilter(recipe: PhotoRecipe): PhotoRecipe {
  return { ...recipe, filter: null };
}

export function withoutCrop(recipe: PhotoRecipe): PhotoRecipe {
  return { ...recipe, crop: null };
}

export function colourOnly(recipe: PhotoRecipe): PhotoRecipe {
  return { ...IDENTITY_RECIPE, light: recipe.light, colour: recipe.colour, filter: recipe.filter };
}

export function signed(value: number): string {
  return value > 0 ? `+${String(value)}` : String(value);
}

export function chipLabel(key: AdjustKey, value: number): string {
  return value === 0 ? SLIDER_LABELS[key] : `${SLIDER_LABELS[key]} ${signed(value)}`;
}
