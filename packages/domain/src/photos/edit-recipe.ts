import { z } from 'zod';
import { ID } from './shared';
import { PHOTO_BOX } from './people';

export const PHOTO_FILTERS = [
  'vivid',
  'warm',
  'cool',
  'mono',
  'noir',
  'sepia',
  'fade',
  'dramatic',
  'vintage',
  'chrome',
] as const;

export type PhotoFilter = (typeof PHOTO_FILTERS)[number];

const SLIDER = z.number().min(-100).max(100);

const STRENGTH = z.number().min(0).max(100);

export const PHOTO_LIGHT = z
  .strictObject({
    exposure: SLIDER,
    contrast: SLIDER,
    highlights: SLIDER,
    shadows: SLIDER,
    whites: SLIDER,
    blacks: SLIDER,
  })
  .readonly();

export const PHOTO_COLOUR = z
  .strictObject({ saturation: SLIDER, warmth: SLIDER, tint: SLIDER })
  .readonly();

export const PHOTO_ERASER_PATCH = z.strictObject({ patchId: ID, box: PHOTO_BOX }).readonly();

export const PHOTO_RECIPE = z
  .strictObject({
    crop: PHOTO_BOX.nullable(),
    quarterTurns: z.int().min(0).max(3),
    straighten: z.number().min(-45).max(45),
    flipHorizontal: z.boolean(),
    flipVertical: z.boolean(),
    light: PHOTO_LIGHT,
    colour: PHOTO_COLOUR,
    filter: z
      .strictObject({ preset: z.enum(PHOTO_FILTERS), strength: STRENGTH })
      .readonly()
      .nullable(),
    patches: z.array(PHOTO_ERASER_PATCH).readonly(),
  })
  .readonly();

export type PhotoRecipe = z.infer<typeof PHOTO_RECIPE>;

export const IDENTITY_RECIPE: PhotoRecipe = {
  crop: null,
  quarterTurns: 0,
  straighten: 0,
  flipHorizontal: false,
  flipVertical: false,
  light: { exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 },
  colour: { saturation: 0, warmth: 0, tint: 0 },
  filter: null,
  patches: [],
};
