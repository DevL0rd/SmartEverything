import type { JsonValue } from '@smarteverything/domain';
export const MICROWAVE_RECIPE_SCHEMA: Readonly<Record<string, JsonValue>> = {
  'raw:samsungce.cook_recipe:set_cook_recipe': {
    type: 'object',
    additionalProperties: false,
    properties: {
      recipeType: {
        type: 'string',
        enum: ['normal', 'todayRecipe', 'imageScanCook'],
      },
      recipeStages: {
        type: 'object',
        additionalProperties: false,
        properties: {
          temperatureUnit: {
            type: 'string',
            enum: ['F', 'C'],
          },
          accessories: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'none',
                'plateUpper',
                'plateLower',
                'plateBoth',
                'steamQooker',
                'grillUpper',
                'grillLower',
                'heatingPan',
              ],
            },
          },
          hasIndicationForZone4: {
            type: 'string',
            enum: ['true', 'false'],
          },
          notifyPreheatForFirstStage: {
            type: 'string',
            enum: ['true', 'false'],
          },
          isCookRecipeDefault: {
            type: 'string',
            enum: ['true', 'false'],
          },
          burnNotification: {
            type: 'string',
            enum: ['true', 'false'],
          },
          zoneInfo: {
            type: 'string',
            enum: ['single', 'multi'],
          },
          turnTableControl: {
            type: 'string',
            enum: ['default', 'off'],
          },
          stages: {
            type: 'array',
            items: {
              type: 'object',
            },
          },
          visionIndex: {
            type: 'string',
          },
          vaporData: {
            type: 'string',
          },
        },
      },
      recipeDisplay: {
        type: 'object',
        additionalProperties: false,
        properties: {
          language: {
            type: 'string',
            pattern: '^[a-z]{2}_[A-Z]{2}$',
          },
          menu: {
            type: 'string',
            maxLength: 40,
          },
          option: {
            type: 'string',
            maxLength: 25,
          },
          servingSize: {
            type: 'string',
            maxLength: 25,
          },
        },
      },
      recipeZones: {
        type: 'object',
        additionalProperties: false,
        patternProperties: {
          '^zone[1-9]$': {
            type: 'string',
            maxLength: 25,
          },
        },
      },
    },
    required: ['recipeType', 'recipeStages', 'recipeDisplay', 'recipeZones'],
  },
};
