import {
  JSON_VALUE,
  MICROWAVE_KEYS,
  MICROWAVE_DEFINED_RECIPE,
  MICROWAVE_COOK_DEFINED_RECIPE,
  MICROWAVE_COOK_RECIPE,
  MICROWAVE_UPDATE_SCHEDULE,
  MICROWAVE_UPDATE_MODULE,
  type JsonValue,
} from '@smarteverything/domain';
import { z } from 'zod';
export const UPDATE_AVAILABLE_KEY = 'raw:samsungce.software_update.new_version_available';
export interface MicrowaveField {
  readonly key: string;
  readonly label: string;
  readonly kind: 'text' | 'number' | 'json' | 'enum' | 'date' | 'time';
  readonly optional?: true;
  readonly options?: readonly string[];
  readonly helper?: string;
}
export interface MicrowaveFormSpec {
  readonly fields: readonly MicrowaveField[];
  readonly help: string;
  readonly cooking: boolean;
  readonly build: (given: Readonly<Record<string, string>>) => JsonValue;
}
const RECIPE_FIELDS: readonly MicrowaveField[] = [
  { key: 'recipeType', label: 'Samsung recipe type', kind: 'text' },
  { key: 'categoryId', label: 'Category number', kind: 'number', helper: '0–255' },
  { key: 'itemId', label: 'Recipe number', kind: 'number', helper: '0–255' },
  { key: 'servingSize', label: 'Serving size number', kind: 'number', helper: '0–255' },
  {
    key: 'browingLevel',
    label: 'Browning level',
    kind: 'number',
    optional: true,
    helper: '0–255 · optional',
  },
  {
    key: 'option',
    label: 'Recipe option',
    kind: 'number',
    optional: true,
    helper: '0–255 · optional',
  },
];
function parsedField(field: MicrowaveField, text: string): JsonValue {
  switch (field.kind) {
    case 'number':
      return z.coerce.number().parse(text === '' ? Number.NaN : text);
    case 'json':
      return JSON_VALUE.parse(JSON.parse(text));
    case 'text':
    case 'enum':
    case 'date':
    case 'time':
      return text;
  }
}
function fieldsValue(
  fields: readonly MicrowaveField[],
  given: Readonly<Record<string, string>>,
): Readonly<Record<string, JsonValue>> {
  return Object.fromEntries(
    fields.flatMap((field) => {
      const text = (given[field.key] ?? '').trim();
      if (field.optional === true && text === '') {
        return [];
      }
      return [[field.key, parsedField(field, text)]];
    }),
  );
}
const PREPARE_FIELDS = [
  ...RECIPE_FIELDS,
  { key: 'cavityId', label: 'Oven cavity identifier', kind: 'text', optional: true },
] as const;
const UPDATE_FIELDS: readonly MicrowaveField[] = [
  {
    key: 'module',
    label: 'Update module',
    kind: 'text',
    optional: true,
    helper: 'Leave blank for the appliance’s default update.',
  },
];
const DISPLAY_FIELDS: readonly MicrowaveField[] = [
  {
    key: 'menu',
    label: 'Recipe name',
    kind: 'text',
    optional: true,
    helper: 'Up to 40 characters',
  },
  {
    key: 'option',
    label: 'Recipe description',
    kind: 'text',
    optional: true,
    helper: 'Up to 25 characters',
  },
  { key: 'servingSize', label: 'Serving size description', kind: 'text', optional: true },
  {
    key: 'language',
    label: 'Display language',
    kind: 'text',
    optional: true,
    helper: 'For example en_GB',
  },
];
const STAGED_FIELDS: readonly MicrowaveField[] = [
  {
    key: 'recipeType',
    label: 'Recipe source',
    kind: 'enum',
    options: ['normal', 'todayRecipe', 'imageScanCook'],
  },
  ...DISPLAY_FIELDS,
  {
    key: 'recipeStages',
    label: 'Advanced cooking stages',
    kind: 'json',
    helper:
      'Samsung stage object. Stage item fields are not documented by the provider; use a known compatible recipe.',
  },
  {
    key: 'recipeZones',
    label: 'Cooking zones',
    kind: 'json',
    helper: 'Object such as {"zone1":"Main cavity"}. Use {} for no zone labels.',
  },
];
function stagedRecipe(given: Readonly<Record<string, string>>): JsonValue {
  const value = fieldsValue(STAGED_FIELDS, given);
  const display = fieldsValue(DISPLAY_FIELDS, given);
  return JSON_VALUE.parse(
    MICROWAVE_COOK_RECIPE.parse({
      recipeType: value['recipeType'],
      recipeStages: value['recipeStages'],
      recipeDisplay: display,
      recipeZones: value['recipeZones'],
    }),
  );
}
function updateSchedule(given: Readonly<Record<string, string>>): JsonValue {
  const date = z.iso.date().parse(given['date']);
  const time = z
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
    .parse(given['time']);
  return JSON_VALUE.parse(
    MICROWAVE_UPDATE_SCHEDULE.parse({
      scheduledTime: new Date(`${date}T${time}:00`).toISOString(),
    }),
  );
}
export const MICROWAVE_FORM_SPECS: Readonly<Record<string, MicrowaveFormSpec>> = {
  [MICROWAVE_KEYS.definedRecipe]: {
    fields: PREPARE_FIELDS,
    help: 'Use the recipe identifiers from Samsung’s compatible recipe catalogue. Preparing a recipe does not start cooking.',
    cooking: true,
    build: (given) =>
      JSON_VALUE.parse(MICROWAVE_DEFINED_RECIPE.parse(fieldsValue(PREPARE_FIELDS, given))),
  },
  [MICROWAVE_KEYS.cookDefinedRecipe]: {
    fields: RECIPE_FIELDS,
    help: 'This sends Samsung’s cook recipe command and can start cooking. Use identifiers from a compatible Samsung recipe.',
    cooking: true,
    build: (given) =>
      JSON_VALUE.parse(MICROWAVE_COOK_DEFINED_RECIPE.parse(fieldsValue(RECIPE_FIELDS, given))),
  },
  [MICROWAVE_KEYS.cookRecipe]: {
    fields: STAGED_FIELDS,
    help: 'Prepare a staged Samsung recipe. Advanced stage data must come from a compatible recipe; the provider does not describe each stage’s fields.',
    cooking: true,
    build: stagedRecipe,
  },
  [MICROWAVE_KEYS.schedule]: {
    fields: [
      { key: 'date', label: 'Update date', kind: 'date' },
      { key: 'time', label: 'Update time', kind: 'time', helper: 'Your local time zone' },
    ],
    help: 'Choose when the microwave should install its update.',
    cooking: false,
    build: updateSchedule,
  },
  [MICROWAVE_KEYS.agreeUpdate]: {
    fields: UPDATE_FIELDS,
    help: 'Install an available software update.',
    cooking: false,
    build: (given) =>
      JSON_VALUE.parse(MICROWAVE_UPDATE_MODULE.parse(fieldsValue(UPDATE_FIELDS, given))),
  },
  [MICROWAVE_KEYS.disagreeUpdate]: {
    fields: UPDATE_FIELDS,
    help: 'Decline an offered update for this appliance or a specific module.',
    cooking: false,
    build: (given) =>
      JSON_VALUE.parse(MICROWAVE_UPDATE_MODULE.parse(fieldsValue(UPDATE_FIELDS, given))),
  },
};
