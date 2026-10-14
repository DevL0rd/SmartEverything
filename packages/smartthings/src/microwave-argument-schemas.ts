import type { JsonValue } from '@smarteverything/domain';
export const MICROWAVE_ARGUMENT_SCHEMAS: Readonly<Record<string, JsonValue>> = {
  'raw:samsungce.defined_recipe.defined_recipe': {
    type: 'object',
    additionalProperties: false,
    required: ['recipeType', 'categoryId', 'itemId', 'servingSize'],
    properties: {
      cavityId: {
        type: 'string',
      },
      recipeType: {
        type: 'string',
      },
      categoryId: {
        type: 'integer',
        minimum: 0,
        maximum: 255,
      },
      itemId: {
        type: 'integer',
        minimum: 0,
        maximum: 255,
      },
      servingSize: {
        type: 'integer',
        minimum: 0,
        maximum: 255,
      },
      browingLevel: {
        type: 'integer',
        minimum: 0,
        maximum: 255,
      },
      option: {
        type: 'integer',
        minimum: 0,
        maximum: 255,
      },
    },
  },
  'raw:samsungce.defined_recipe:cook_defined_recipe': {
    type: 'object',
    additionalProperties: false,
    properties: {
      recipeType: {
        type: 'string',
      },
      categoryId: {
        type: 'integer',
        minimum: 0,
        maximum: 255,
      },
      itemId: {
        type: 'integer',
        minimum: 0,
        maximum: 255,
      },
      servingSize: {
        type: 'integer',
        minimum: 0,
        maximum: 255,
      },
      browingLevel: {
        type: 'integer',
        minimum: 0,
        maximum: 255,
      },
      option: {
        type: 'integer',
        minimum: 0,
        maximum: 255,
      },
    },
    required: ['recipeType', 'categoryId', 'itemId', 'servingSize'],
  },
  'raw:samsungce.software_update.schedule': {
    type: 'object',
    additionalProperties: false,
    properties: {
      scheduledTime: {
        type: 'string',
        pattern:
          '^(?:[1-9]\\d{3}-?(?:(?:0[1-9]|1[0-2])-?(?:0[1-9]|1\\d|2[0-8])|(?:0[13-9]|1[0-2])-?(?:29|30)|(?:0[13578]|1[02])-?31)|(?:[1-9]\\d(?:0[48]|[2468][048]|[13579][26])|(?:[2468][048]|[13579][26])00)-?02-?29)T(?:[01]\\d|2[0-3]):?[0-5]\\d:?[0-5]\\d(?:\\.\\d{3})?(?:Z|[+-][01]\\d(?::?[0-5]\\d)?)$',
      },
    },
  },
  'raw:samsungce.software_update:agree_update': {
    type: 'object',
    additionalProperties: false,
    properties: {
      module: {
        type: 'string',
      },
    },
    required: [],
  },
  'raw:samsungce.software_update:disagree_update': {
    type: 'object',
    additionalProperties: false,
    properties: {
      module: {
        type: 'string',
      },
    },
    required: [],
  },
  'raw:samsungce.oven_operating_state:set_operation_time': {
    type: 'object',
    additionalProperties: false,
    properties: {
      operationTime: {
        type: 'string',
        pattern: '^\\d\\d+:[0-5]\\d:[0-5]\\d$',
      },
    },
    required: ['operationTime'],
  },
};
