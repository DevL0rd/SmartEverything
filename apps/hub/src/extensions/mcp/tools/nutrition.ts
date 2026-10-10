import {
  API_ENDPOINTS as E,
  BARCODE,
  FOOD_CANDIDATE,
  MEALS,
  MEAL_TYPES,
  NUTRITION_PREF,
  defaultAmount,
  factsOf,
  foodEntryOf,
  waterEntryOf,
  type FoodCandidate,
  type FoodOrigin,
} from '@smarteverything/domain';
import { z } from 'zod';
import { operate, type ActingAs } from './acting';
import { readPref } from './prefs';
import {
  MOMENT_ARGUMENT,
  PROFILE,
  READS,
  ToolError,
  WRITES,
  defineTool,
  matches,
  type Tool,
  type ToolContext,
} from './registry';
import { minuteSpan } from './spans';

const LOG_FOOD = z
  .strictObject({
    foodId: z.uuid().optional().describe('A saved food from find_food'),
    barcode: BARCODE.optional().describe(
      'A packaged product’s barcode, looked up on Open Food Facts',
    ),
    food: FOOD_CANDIDATE.optional().describe('Nutrition facts given inline, per basis amount'),
    save: z.boolean().default(false).describe('Also save an inline food to the person’s foods'),
    amount: z
      .number()
      .positive()
      .max(10_000)
      .optional()
      .describe('Grams or ml; one serving when left out'),
    meal: z.enum(MEALS),
    at: MOMENT_ARGUMENT.optional().describe('When it was eaten or drunk; now when left out'),
    profileId: PROFILE,
  })
  .refine(
    (input) =>
      [input.foodId, input.barcode, input.food].filter((part) => part !== undefined).length === 1,
    {
      message: 'give exactly one of foodId, barcode or food',
    },
  );

type LogFood = z.infer<typeof LOG_FOOD>;

interface Chosen {
  readonly food: FoodCandidate;
  readonly foodId: string | null;
}

async function saved(
  context: ToolContext,
  food: FoodCandidate,
  origin: FoodOrigin,
  as: ActingAs,
): Promise<Chosen> {
  const row = E.createFood.response.parse(
    await operate(context, 'createFood', { body: { ...food, origin, favourite: false } }, as),
  );
  return { food, foodId: row.id };
}

async function chosen(context: ToolContext, input: LogFood): Promise<Chosen> {
  if (input.foodId !== undefined) {
    const foods = E.listFoods.response.parse(await operate(context, 'listFoods', {}, input));
    const row = foods.find((food) => food.id === input.foodId);
    if (row === undefined) {
      throw new ToolError(`This person has no saved food ${input.foodId}`, 'not_found');
    }
    return { food: factsOf(row), foodId: row.id };
  }
  if (input.barcode !== undefined) {
    const product = E.lookupFood.response.parse(
      await operate(context, 'lookupFood', { query: { barcode: input.barcode } }, input),
    );
    return saved(context, product, 'open_food_facts', input);
  }
  if (input.food === undefined) {
    throw new ToolError('Give exactly one of foodId, barcode or food');
  }
  return input.save
    ? saved(context, input.food, 'custom', input)
    : { food: input.food, foodId: null };
}

async function foodLogged(context: ToolContext, input: LogFood): Promise<unknown> {
  const { food, foodId } = await chosen(context, input);
  const start = input.at === undefined ? context.clock.now() : new Date(input.at);
  const entry = foodEntryOf({
    food,
    foodId,
    amount: input.amount ?? defaultAmount(food),
    mealType: MEAL_TYPES[input.meal],
    span: minuteSpan(context, start),
  });
  return operate(context, 'createHealthEntry', { body: entry }, input);
}

const LOG_WATER = z
  .strictObject({
    millilitres: z.number().positive().max(5000).optional(),
    glasses: z
      .number()
      .positive()
      .max(20)
      .optional()
      .describe('Glasses of the person’s glass size'),
    at: MOMENT_ARGUMENT.optional().describe('When; now when left out'),
    profileId: PROFILE,
  })
  .refine((input) => (input.millilitres === undefined) !== (input.glasses === undefined), {
    message: 'give millilitres or glasses',
  });

async function millilitresOf(
  context: ToolContext,
  input: z.infer<typeof LOG_WATER>,
): Promise<number> {
  if (input.millilitres !== undefined) {
    return input.millilitres;
  }
  if (input.glasses === undefined) {
    throw new ToolError('Give millilitres or glasses');
  }
  const pref = NUTRITION_PREF.parse(await readPref(context, 'nutrition', input));
  return input.glasses * pref.glassMl;
}

async function waterLogged(
  context: ToolContext,
  input: z.infer<typeof LOG_WATER>,
): Promise<unknown> {
  const millilitres = await millilitresOf(context, input);
  const start = input.at === undefined ? context.clock.now() : new Date(input.at);
  return operate(
    context,
    'createHealthEntry',
    { body: waterEntryOf(millilitres, minuteSpan(context, start)) },
    input,
  );
}

const FIND = z
  .strictObject({
    query: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .optional()
      .describe('Words in the food’s name or brand'),
    barcode: BARCODE.optional(),
    profileId: PROFILE,
  })
  .refine((input) => input.query !== undefined || input.barcode !== undefined, {
    message: 'give a query or a barcode',
  });

async function found(
  context: ToolContext,
  input: z.infer<typeof FIND>,
): Promise<Record<string, unknown>> {
  if (input.barcode !== undefined) {
    return {
      product: await operate(context, 'lookupFood', { query: { barcode: input.barcode } }, input),
    };
  }
  const query = input.query ?? '';
  const foods = E.listFoods.response.parse(await operate(context, 'listFoods', {}, input));
  return {
    saved: foods.filter((food) => matches(query, food.name, food.brand)),
    open_food_facts: await operate(context, 'searchFoods', { query: { q: query } }, input),
    attribution: 'Food data from Open Food Facts (ODbL)',
  };
}

export const NUTRITION_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'log_food',
    input: LOG_FOOD,
    annotations: WRITES,
    run: async (context, input) => ({ structured: { entry: await foodLogged(context, input) } }),
  }),
  defineTool({
    name: 'log_water',
    input: LOG_WATER,
    annotations: WRITES,
    run: async (context, input) => ({ structured: { entry: await waterLogged(context, input) } }),
  }),
  defineTool({
    name: 'find_food',
    input: FIND,
    annotations: { ...READS, openWorldHint: true },
    run: async (context, input) => ({ structured: await found(context, input) }),
  }),
];
