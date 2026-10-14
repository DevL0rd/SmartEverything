import { z } from 'zod';
const RECIPE_BYTE = z.number().int().min(0).max(255);
const RECIPE_IDENTIFIERS = {
  recipeType: z.string(),
  categoryId: RECIPE_BYTE,
  itemId: RECIPE_BYTE,
  servingSize: RECIPE_BYTE,
  browingLevel: RECIPE_BYTE.optional(),
  option: RECIPE_BYTE.optional(),
};
export const MICROWAVE_DEFINED_RECIPE = z.strictObject({
  cavityId: z.string().optional(),
  ...RECIPE_IDENTIFIERS,
});
export const MICROWAVE_COOK_DEFINED_RECIPE = z.strictObject(RECIPE_IDENTIFIERS);
export const MICROWAVE_UPDATE_SCHEDULE = z.strictObject({
  scheduledTime: z.iso.datetime({ offset: true }).optional(),
});
export const MICROWAVE_UPDATE_MODULE = z.strictObject({ module: z.string().optional() });
export const MICROWAVE_RECIPE_DISPLAY = z.strictObject({
  language: z
    .string()
    .regex(/^[a-z]{2}_[A-Z]{2}$/)
    .optional(),
  menu: z.string().max(40).optional(),
  option: z.string().max(25).optional(),
  servingSize: z.string().max(25).optional(),
});
export const MICROWAVE_RECIPE_ZONES = z.record(z.string().regex(/^zone[1-9]$/), z.string().max(25));
const STRING_BOOLEAN = z.enum(['true', 'false']);
export const MICROWAVE_RECIPE_STAGES = z.strictObject({
  temperatureUnit: z.enum(['F', 'C']).optional(),
  accessories: z
    .array(
      z.enum([
        'none',
        'plateUpper',
        'plateLower',
        'plateBoth',
        'steamQooker',
        'grillUpper',
        'grillLower',
        'heatingPan',
      ]),
    )
    .optional(),
  hasIndicationForZone4: STRING_BOOLEAN.optional(),
  notifyPreheatForFirstStage: STRING_BOOLEAN.optional(),
  isCookRecipeDefault: STRING_BOOLEAN.optional(),
  burnNotification: STRING_BOOLEAN.optional(),
  zoneInfo: z.enum(['single', 'multi']).optional(),
  turnTableControl: z.enum(['default', 'off']).optional(),
  stages: z.array(z.record(z.string(), z.json())).optional(),
  visionIndex: z.string().optional(),
  vaporData: z.string().optional(),
});
export const MICROWAVE_COOK_RECIPE = z.strictObject({
  recipeType: z.enum(['normal', 'todayRecipe', 'imageScanCook']),
  recipeStages: MICROWAVE_RECIPE_STAGES,
  recipeDisplay: MICROWAVE_RECIPE_DISPLAY,
  recipeZones: MICROWAVE_RECIPE_ZONES,
});
