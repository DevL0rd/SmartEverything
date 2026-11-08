import {
  API_ENDPOINTS as E,
  FOOD_PORTION,
  MEALS,
  MEAL_TYPES,
  NUTRIENTS,
  NUTRIENT_GRAMS,
  entryRecord,
  type FoodPortion,
  type HealthEntryRow,
  type NutrientGrams,
} from '@smarteverything/domain';
import { z } from 'zod';
import { operate } from './acting';
import {
  REMOVES,
  PERSON,
  ToolError,
  WRITES,
  defineTool,
  type Tool,
  type ToolContext,
} from './registry';

const ENTRY = z.strictObject({
  entryId: z.uuid().describe('The logged entry id, from food_log or health_read view entries'),
  personId: PERSON,
});

const CORRECTION = z.strictObject({
  name: FOOD_PORTION.shape.name.optional(),
  meal: z.enum(MEALS).optional(),
  kcal: z.number().nonnegative().nullable().optional().describe('Calories for the eaten portion'),
  grams: z
    .partialRecord(z.enum(NUTRIENTS), NUTRIENT_GRAMS.valueType.nullable())
    .optional()
    .describe('Nutrients to change in the eaten portion, in grams; null removes that nutrient'),
  waterMl: FOOD_PORTION.shape.waterMl
    .optional()
    .describe('Water counted for this portion; set to zero to remove it'),
});

const UPDATE = ENTRY.extend({
  changes: CORRECTION.refine((changes) => Object.keys(changes).length > 0, {
    message: 'give at least one change',
  }).describe('The fields to correct on the logged entry; send only what changes'),
});

async function loggedEntry(
  context: ToolContext,
  input: z.infer<typeof ENTRY>,
): Promise<HealthEntryRow> {
  const row = E.readHealthEntry.response.parse(
    await operate(context, 'readHealthEntry', { params: { entryId: input.entryId } }, input),
  );
  if (row.record_type !== 'Nutrition' && row.record_type !== 'Hydration') {
    throw new ToolError('This entry is neither a logged meal nor water. Use health_edit.');
  }
  return row;
}

function correctedPortion(
  portion: FoodPortion | null,
  { name, waterMl }: z.infer<typeof CORRECTION>,
): FoodPortion | null {
  if (portion !== null) {
    return { ...portion, name: name ?? portion.name, waterMl: waterMl ?? portion.waterMl };
  }
  if (waterMl !== undefined) {
    throw new ToolError('This nutrition entry has no food portion with linked water.');
  }
  return null;
}

function correctedNutrients(
  previous: NutrientGrams,
  changes: z.infer<typeof CORRECTION>['grams'],
): NutrientGrams {
  if (changes === undefined) return previous;
  const next = { ...previous };
  const removed = new Set<string>();
  for (const nutrient of NUTRIENTS) {
    const value = changes[nutrient];
    if (value === null) removed.add(nutrient);
    else if (value !== undefined) next[nutrient] = value;
  }
  return Object.fromEntries(Object.entries(next).filter(([nutrient]) => !removed.has(nutrient)));
}

async function updated(context: ToolContext, input: z.infer<typeof UPDATE>): Promise<unknown> {
  const entry = await loggedEntry(context, input);
  const record = entryRecord(entry);
  if (record.type !== 'Nutrition') {
    throw new ToolError('Use health_edit action update for a standalone water entry.');
  }
  const { name, meal, kcal, grams } = input.changes;
  return operate(
    context,
    'updateHealthEntry',
    {
      params: { entryId: input.entryId },
      query: { expectedVersion: entry.version },
      body: {
        type: record.type,
        startTime: record.startTime,
        endTime: record.endTime,
        zoneOffsetSeconds: record.zoneOffsetSeconds,
        data: {
          ...record.data,
          name: name ?? record.data.name,
          mealType: meal === undefined ? record.data.mealType : MEAL_TYPES[meal],
          kilocalories: kcal === undefined ? record.data.kilocalories : kcal,
          grams: correctedNutrients(record.data.grams, grams),
        },
        food: correctedPortion(entry.food, input.changes),
      },
    },
    input,
  );
}

export const NUTRITION_ENTRY_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'update_logged_food',
    input: UPDATE,
    annotations: WRITES,
    answer: true,
    run: async (context, input) => ({ structured: { entry: await updated(context, input) } }),
  }),
  defineTool({
    name: 'remove_logged_food',
    input: ENTRY,
    annotations: REMOVES,
    run: async (context, input) => {
      const { id } = await loggedEntry(context, input);
      await operate(context, 'deleteHealthEntry', { params: { entryId: id } }, input);
      return { structured: { id } };
    },
  }),
];
